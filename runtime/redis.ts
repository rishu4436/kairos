/**
 * Redis command transport. Each call is one atomic command.
 * Lease acquire, renew, release, and revision CAS are EVAL scripts, not GET followed by SET.
 * A TCP socket opens only when LazyRedisTransport runs a command.
 */
import path from "node:path";
import { Worker } from "node:worker_threads";

export interface RedisTransport {
  command(args: readonly string[]): string | null;
}

interface Entry {
  value: string;
  expiresAt: number | null;
}

export class MemoryRedisTransport implements RedisTransport {
  private readonly values = new Map<string, Entry>();
  nowMs = () => Date.now();

  command(args: readonly string[]): string | null {
    this.purge();
    const [op, key] = args;
    if (!key && op !== "EVAL") {
      throw new Error("STATE_BACKEND_ERROR");
    }
    if (op === "GET") {
      return this.live(key ?? "")?.value ?? null;
    }
    if (op === "PTTL") {
      const entry = this.live(key ?? "");
      if (!entry?.expiresAt) {
        return entry ? "-1" : "-2";
      }
      return String(entry.expiresAt - this.nowMs());
    }
    if (op === "SET" && key) {
      const nx = args.includes("NX");
      const pxIndex = args.indexOf("PX");
      const ttl = pxIndex >= 0 ? Number(args[pxIndex + 1]) : null;
      if (nx && this.live(key)) {
        return null;
      }
      const value = args[2] ?? "";
      this.values.set(key, { value, expiresAt: ttl && Number.isFinite(ttl) ? this.nowMs() + ttl : null });
      return "OK";
    }
    if (op === "DEL" && key) {
      this.values.delete(key);
      return "1";
    }
    if (op === "EVAL") {
      return this.evalScript(args);
    }
    throw new Error("STATE_BACKEND_ERROR");
  }

  private evalScript(args: readonly string[]): string | null {
    const script = args[1] ?? "";
    const numKeys = Number(args[2] ?? "0");
    const keys = args.slice(3, 3 + numKeys);
    const argv = args.slice(3 + numKeys);
    const key = keys[0] ?? "";
    if (script === "lease-acquire") {
      const owner = argv[0] ?? "";
      const ttl = Number(argv[1] ?? "0");
      const current = this.live(key);
      if (current && current.value !== owner) {
        return null;
      }
      this.values.set(key, { value: owner, expiresAt: this.nowMs() + ttl });
      return "OK";
    }
    if (script === "lease-renew") {
      const owner = argv[0] ?? "";
      const ttl = Number(argv[1] ?? "0");
      const current = this.live(key);
      if (!current || current.value !== owner) {
        return null;
      }
      this.values.set(key, { value: owner, expiresAt: this.nowMs() + ttl });
      return "OK";
    }
    if (script === "lease-release") {
      const owner = argv[0] ?? "";
      const current = this.live(key);
      if (!current || current.value !== owner) {
        return "0";
      }
      this.values.delete(key);
      return "1";
    }
    if (script === "cas") {
      const expected = Number(argv[0] ?? "NaN");
      const body = argv[1] ?? "";
      const nowIso = argv[2] ?? "";
      const current = this.live(key);
      const parsed = current ? (JSON.parse(current.value) as { revision?: number }) : null;
      if (expected === 0 && parsed) {
        return null;
      }
      if (expected !== 0 && parsed?.revision !== expected) {
        return null;
      }
      const next = { schemaVersion: 1, revision: (parsed?.revision ?? 0) + 1, updatedAt: nowIso, value: JSON.parse(body) as unknown };
      this.values.set(key, { value: JSON.stringify(next), expiresAt: null });
      return JSON.stringify(next);
    }
    throw new Error("STATE_BACKEND_ERROR");
  }

  private live(key: string): Entry | null {
    const entry = this.values.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.nowMs()) {
      this.values.delete(key);
      return null;
    }
    return entry;
  }

  private purge(): void {
    for (const key of [...this.values.keys()]) {
      this.live(key);
    }
  }
}

/** The store sends a script name. A live server needs the Lua source. */
export function toRedisArgs(args: readonly string[]): string[] {
  if (args[0] !== "EVAL") {
    return [...args];
  }
  const name = args[1] ?? "";
  const lua = REDIS_LUA[name as keyof typeof REDIS_LUA];
  if (!lua) {
    throw new Error("STATE_BACKEND_ERROR");
  }
  return ["EVAL", lua, ...args.slice(2)];
}

/**
 * One blocking RESP connection. The socket lives on a worker thread so the
 * main thread can wait without stalling the worker's I/O. Commands stay one
 * round trip: SET NX PX, GET, PTTL, DEL, or EVAL.
 */
export class LazyRedisTransport implements RedisTransport {
  private worker: Worker | null = null;
  private readonly header: Int32Array;
  private readonly body: Uint8Array;
  private ready = false;

  constructor(private readonly url: string) {
    if (url.trim().length === 0) {
      throw new Error("STATE_BACKEND_NOT_CONFIGURED");
    }
    const shared = new SharedArrayBuffer(16 + 4_000_000);
    this.header = new Int32Array(shared, 0, 4);
    this.body = new Uint8Array(shared, 16);
    this.shared = shared;
  }

  private readonly shared: SharedArrayBuffer;

  command(args: readonly string[]): string | null {
    this.ensure();
    return this.roundTrip(toRedisArgs(args));
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  private ensure(): void {
    if (this.ready) {
      return;
    }
    const start = Atomics.load(this.header, 0);
    this.worker = new Worker(workerPath(), { workerData: { url: this.url, sab: this.shared } });
    this.worker.unref();
    this.wait(start);
    if (Atomics.load(this.header, 1) !== 1) {
      this.close();
      throw new Error("STATE_BACKEND_ERROR");
    }
    this.ready = true;
  }

  private roundTrip(args: readonly string[]): string | null {
    const start = Atomics.load(this.header, 0);
    this.worker?.postMessage(args);
    this.wait(start);
    const status = Atomics.load(this.header, 1);
    if (status === 3) {
      return null;
    }
    if (status !== 1) {
      throw new Error("STATE_BACKEND_ERROR");
    }
    const length = Atomics.load(this.header, 2);
    return Buffer.from(this.body.subarray(0, length)).toString("utf8");
  }

  private wait(start: number): void {
    const woke = Atomics.wait(this.header, 0, start, 8_000);
    if (woke === "timed-out") {
      throw new Error("STATE_BACKEND_ERROR");
    }
  }
}

function workerPath(): string {
  return path.join(process.cwd(), "runtime", "redis-worker.mjs");
}

export const REDIS_LUA = {
  "lease-acquire":
    "local cur = redis.call('GET', KEYS[1]) if cur and cur ~= ARGV[1] then return nil end redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 'OK'",
  "lease-renew":
    "local cur = redis.call('GET', KEYS[1]) if not cur or cur ~= ARGV[1] then return nil end redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 'OK'",
  "lease-release":
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
  cas: "local cur = redis.call('GET', KEYS[1]) local expected = tonumber(ARGV[1]) local parsed = nil if cur then parsed = cjson.decode(cur) end if expected == 0 and parsed then return nil end if expected ~= 0 and (not parsed or tonumber(parsed.revision) ~= expected) then return nil end local nextRev = (parsed and tonumber(parsed.revision) or 0) + 1 local record = { schemaVersion = 1, revision = nextRev, updatedAt = ARGV[3], value = cjson.decode(ARGV[2]) } local encoded = cjson.encode(record) redis.call('SET', KEYS[1], encoded) return encoded",
} as const;
