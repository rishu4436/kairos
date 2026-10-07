import { LazyRedisTransport, type RedisTransport } from "@/runtime/redis";
import type { AgentControlState, AgentHeartbeatRecord, KairosCycleResult, KairosCycleState } from "@/runtime/types";

export const STATE_SCHEMA_VERSION = 1;
export const CYCLE_RETENTION = 100;

export interface VersionedRecord<T> {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  value: T;
}

export interface RuntimeLease {
  userId: string;
  agentId: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
  revision: number;
}

export interface AuditRecord {
  id: string;
  at: string;
  userId: string;
  agentId: string;
  cycleId: string | null;
  type: string;
  message: string;
}

export interface KairosStateStore {
  readonly backend: "MEMORY" | "REDIS";
  readonly durable: boolean;
  get<T>(key: string): VersionedRecord<T> | null;
  /** Rejects a stale revision. revision 0 inserts only when the key is absent. */
  compareAndSet<T>(key: string, revision: number, value: T, nowIso: string): { ok: true; record: VersionedRecord<T> } | { ok: false; reason: "STALE_REVISION" | "STATE_REVISION_CONFLICT" | "STATE_INVALID" };
  appendAudit(record: AuditRecord): void;
  listAudits(userId: string, agentId: string): readonly AuditRecord[];
  saveCycle(result: KairosCycleResult): void;
  listCycles(userId: string, agentId: string): readonly KairosCycleResult[];
  readControl(userId: string, agentId: string): AgentControlState;
  writeControl(userId: string, agentId: string, state: AgentControlState, revision: number, nowIso: string): { ok: boolean };
  readHeartbeat(userId: string, agentId: string): AgentHeartbeatRecord;
  writeHeartbeat(userId: string, agentId: string, heartbeat: AgentHeartbeatRecord): void;
  acquireLease(input: { userId: string; agentId: string; ownerId: string; nowMs: number; ttlMs: number }): { ok: true; lease: RuntimeLease } | { ok: false; reason: "LEASE_UNAVAILABLE" };
  renewLease(userId: string, agentId: string, ownerId: string, ttlMs: number): { ok: true } | { ok: false; reason: "LEASE_NOT_OWNER" };
  releaseLease(userId: string, agentId: string, ownerId: string): { ok: boolean; reason?: "LEASE_NOT_OWNER" };
}

const SECRET = /api[_-]?key|private[_-]?key|authorization|secret|seed phrase|password|redis[_-]?url|rediss?:\/\//i;

export function assertPersistable(value: unknown): void {
  const text = JSON.stringify(value);
  if (SECRET.test(text) || text.includes("FMP_API_KEY") || text.includes("BEGIN PRIVATE")) {
    throw new Error("STATE_INVALID");
  }
}

export function stateKey(parts: readonly string[]): string {
  return ["kairos", "v1", ...parts].join(":");
}

/** Optimistic write. The revision check itself stays inside one compareAndSet. */
export function commitRecord<T>(store: KairosStateStore, key: string, value: T, nowIso: string): VersionedRecord<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const revision = store.get<T>(key)?.revision ?? 0;
    const wrote = store.compareAndSet(key, revision, value, nowIso);
    if (wrote.ok) {
      return wrote.record;
    }
  }
  throw new Error("STATE_REVISION_CONFLICT");
}

export class InMemoryKairosStateStore implements KairosStateStore {
  readonly backend: "MEMORY" | "REDIS" = "MEMORY";
  readonly durable: boolean = false;
  private readonly records = new Map<string, VersionedRecord<unknown>>();
  private readonly audits: AuditRecord[] = [];
  private readonly cycles: KairosCycleResult[] = [];
  private readonly leases = new Map<string, RuntimeLease>();

  get<T>(key: string): VersionedRecord<T> | null {
    return (this.records.get(key) as VersionedRecord<T> | undefined) ?? null;
  }

  compareAndSet<T>(key: string, revision: number, value: T, nowIso: string) {
    assertPersistable(value);
    const current = this.records.get(key);
    if (revision === 0 && current) {
      return { ok: false as const, reason: "STALE_REVISION" as const };
    }
    if (revision !== 0 && (!current || current.revision !== revision)) {
      return { ok: false as const, reason: "STALE_REVISION" as const };
    }
    const record: VersionedRecord<T> = {
      schemaVersion: STATE_SCHEMA_VERSION,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: nowIso,
      value,
    };
    this.records.set(key, record);
    return { ok: true as const, record };
  }

  appendAudit(record: AuditRecord): void {
    assertPersistable(record);
    this.audits.push(record);
  }

  listAudits(userId: string, agentId: string): readonly AuditRecord[] {
    return this.audits.filter((record) => record.userId === userId && record.agentId === agentId);
  }

  saveCycle(result: KairosCycleResult): void {
    assertPersistable(result);
    this.cycles.push(result);
    const mine = this.cycles.filter((cycle) => cycle.userId === result.userId && cycle.agentId === result.agentId);
    const overflow = mine.length - CYCLE_RETENTION;
    if (overflow > 0) {
      const drop = new Set(mine.slice(0, overflow).map((cycle) => cycle.cycleId));
      for (let index = this.cycles.length - 1; index >= 0 && drop.size > 0; index -= 1) {
        const cycle = this.cycles[index];
        if (cycle && drop.has(cycle.cycleId)) {
          this.cycles.splice(index, 1);
          drop.delete(cycle.cycleId);
        }
      }
    }
  }

  listCycles(userId: string, agentId: string): readonly KairosCycleResult[] {
    return this.cycles.filter((cycle) => cycle.userId === userId && cycle.agentId === agentId);
  }

  readControl(userId: string, agentId: string): AgentControlState {
    return this.get<AgentControlState>(stateKey(["control", userId, agentId]))?.value ?? "RUNNING";
  }

  writeControl(userId: string, agentId: string, state: AgentControlState, revision: number, nowIso: string) {
    const key = stateKey(["control", userId, agentId]);
    const wrote = this.compareAndSet(key, revision, state, nowIso);
    return { ok: wrote.ok };
  }

  readHeartbeat(userId: string, agentId: string): AgentHeartbeatRecord {
    return this.get<AgentHeartbeatRecord>(stateKey(["heartbeat", userId, agentId]))?.value ?? emptyHeartbeat();
  }

  writeHeartbeat(userId: string, agentId: string, heartbeat: AgentHeartbeatRecord): void {
    const key = stateKey(["heartbeat", userId, agentId]);
    const revision = this.get(key)?.revision ?? 0;
    this.compareAndSet(key, revision, heartbeat, heartbeat.lastCycleCompleted ?? new Date(0).toISOString());
  }

  acquireLease(input: { userId: string; agentId: string; ownerId: string; nowMs: number; ttlMs: number }) {
    const key = `${input.userId}\n${input.agentId}`;
    const current = this.leases.get(key);
    if (current && Date.parse(current.expiresAt) > input.nowMs && current.ownerId !== input.ownerId) {
      return { ok: false as const, reason: "LEASE_UNAVAILABLE" as const };
    }
    const lease: RuntimeLease = {
      userId: input.userId,
      agentId: input.agentId,
      ownerId: input.ownerId,
      acquiredAt: current?.ownerId === input.ownerId ? current.acquiredAt : new Date(input.nowMs).toISOString(),
      expiresAt: new Date(input.nowMs + input.ttlMs).toISOString(),
      revision: (current?.revision ?? 0) + 1,
    };
    this.leases.set(key, lease);
    return { ok: true as const, lease };
  }

  renewLease(userId: string, agentId: string, ownerId: string, ttlMs: number): { ok: true } | { ok: false; reason: "LEASE_NOT_OWNER" } {
    const key = `${userId}\n${agentId}`;
    const current = this.leases.get(key);
    if (!current || current.ownerId !== ownerId || Date.parse(current.expiresAt) <= Date.now()) {
      return { ok: false, reason: "LEASE_NOT_OWNER" };
    }
    this.leases.set(key, { ...current, expiresAt: new Date(Date.now() + ttlMs).toISOString(), revision: current.revision + 1 });
    return { ok: true };
  }

  releaseLease(userId: string, agentId: string, ownerId: string): { ok: boolean; reason?: "LEASE_NOT_OWNER" } {
    const key = `${userId}\n${agentId}`;
    const current = this.leases.get(key);
    if (current?.ownerId !== ownerId) {
      return { ok: false, reason: "LEASE_NOT_OWNER" };
    }
    this.leases.delete(key);
    return { ok: true };
  }
}

export function emptyHeartbeat(): AgentHeartbeatRecord {
  return {
    lastCycleStarted: null,
    lastCycleCompleted: null,
    lastSuccessfulCycle: null,
    lastError: null,
    nextCycleAt: null,
    runtimeStatus: "OFFLINE",
  };
}

let singleton: KairosStateStore | null = null;

export function resetAutonomousStore(): void {
  singleton = null;
}

export function autonomousStore(): KairosStateStore {
  if (!singleton) {
    singleton = openStateStore();
  }
  return singleton;
}

export function openStateStore(env: NodeJS.ProcessEnv = process.env): KairosStateStore {
  const backend = env.KAIROS_STATE_BACKEND ?? "memory";
  if (backend === "memory") {
    return new InMemoryKairosStateStore();
  }
  if (backend === "redis") {
    if (!env.REDIS_URL || env.REDIS_URL.trim().length === 0) {
      throw new Error("STATE_BACKEND_NOT_CONFIGURED");
    }
    return new RedisKairosStateStore(env.REDIS_URL, new LazyRedisTransport(env.REDIS_URL));
  }
  throw new Error("STATE_BACKEND_NOT_CONFIGURED");
}

export class RedisKairosStateStore implements KairosStateStore {
  readonly backend = "REDIS" as const;
  readonly durable = true;

  constructor(
    url: string,
    private readonly transport: RedisTransport,
  ) {
    if (url.trim().length === 0) {
      throw new Error("STATE_BACKEND_NOT_CONFIGURED");
    }
  }

  get<T>(key: string): VersionedRecord<T> | null {
    const raw = this.transport.command(["GET", key]);
    return raw ? (JSON.parse(raw) as VersionedRecord<T>) : null;
  }

  compareAndSet<T>(key: string, revision: number, value: T, nowIso: string) {
    assertPersistable(value);
    const raw = this.transport.command(["EVAL", "cas", "1", key, String(revision), JSON.stringify(value), nowIso]);
    if (!raw) {
      return { ok: false as const, reason: "STATE_REVISION_CONFLICT" as const };
    }
    return { ok: true as const, record: JSON.parse(raw) as VersionedRecord<T> };
  }

  appendAudit(record: AuditRecord): void {
    assertPersistable(record);
    this.putList<AuditRecord>(stateKey(["audit", record.userId, record.agentId]), (current) => [...(current ?? []), record].slice(-200), record.at);
  }

  listAudits(userId: string, agentId: string): readonly AuditRecord[] {
    return this.get<AuditRecord[]>(stateKey(["audit", userId, agentId]))?.value ?? [];
  }

  saveCycle(result: KairosCycleResult): void {
    assertPersistable(result);
    this.putList<KairosCycleResult>(stateKey(["cycles", result.userId, result.agentId]), (current) => [...(current ?? []), result].slice(-CYCLE_RETENTION), result.completedAt);
  }

  listCycles(userId: string, agentId: string): readonly KairosCycleResult[] {
    return this.get<KairosCycleResult[]>(stateKey(["cycles", userId, agentId]))?.value ?? [];
  }

  readControl(userId: string, agentId: string): AgentControlState {
    return this.get<AgentControlState>(stateKey(["control", userId, agentId]))?.value ?? "RUNNING";
  }

  writeControl(userId: string, agentId: string, state: AgentControlState, revision: number, nowIso: string) {
    return { ok: this.compareAndSet(stateKey(["control", userId, agentId]), revision, state, nowIso).ok };
  }

  readHeartbeat(userId: string, agentId: string): AgentHeartbeatRecord {
    return this.get<AgentHeartbeatRecord>(stateKey(["heartbeat", userId, agentId]))?.value ?? emptyHeartbeat();
  }

  writeHeartbeat(userId: string, agentId: string, heartbeat: AgentHeartbeatRecord): void {
    commitRecord(this, stateKey(["heartbeat", userId, agentId]), heartbeat, heartbeat.lastCycleCompleted ?? new Date(0).toISOString());
  }

  private putList<T>(key: string, build: (current: T[] | null) => T[], nowIso: string): void {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = this.get<T[]>(key);
      const wrote = this.compareAndSet(key, current?.revision ?? 0, build(current?.value ?? null), nowIso);
      if (wrote.ok) {
        return;
      }
    }
    throw new Error("STATE_REVISION_CONFLICT");
  }

  acquireLease(input: { userId: string; agentId: string; ownerId: string; nowMs: number; ttlMs: number }) {
    const key = stateKey(["lease", input.userId, input.agentId]);
    const ok = this.transport.command(["EVAL", "lease-acquire", "1", key, input.ownerId, String(input.ttlMs)]);
    if (ok !== "OK") {
      return { ok: false as const, reason: "LEASE_UNAVAILABLE" as const };
    }
    return {
      ok: true as const,
      lease: {
        userId: input.userId,
        agentId: input.agentId,
        ownerId: input.ownerId,
        acquiredAt: new Date(input.nowMs).toISOString(),
        expiresAt: new Date(input.nowMs + input.ttlMs).toISOString(),
        revision: 1,
      },
    };
  }

  renewLease(userId: string, agentId: string, ownerId: string, ttlMs: number): { ok: true } | { ok: false; reason: "LEASE_NOT_OWNER" } {
    const ok = this.transport.command(["EVAL", "lease-renew", "1", stateKey(["lease", userId, agentId]), ownerId, String(ttlMs)]);
    return ok === "OK" ? { ok: true } : { ok: false, reason: "LEASE_NOT_OWNER" };
  }

  releaseLease(userId: string, agentId: string, ownerId: string): { ok: boolean; reason?: "LEASE_NOT_OWNER" } {
    const result = this.transport.command(["EVAL", "lease-release", "1", stateKey(["lease", userId, agentId]), ownerId]);
    return result === "1" ? { ok: true } : { ok: false, reason: "LEASE_NOT_OWNER" };
  }
}

export function terminalCycle(state: KairosCycleState): boolean {
  return state === "COMPLETED" || state === "DEGRADED" || state === "FAILED" || state === "INTERRUPTED";
}
