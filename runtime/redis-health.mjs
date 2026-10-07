import { Worker } from "node:worker_threads";
import path from "node:path";

/** Read-only connectivity probe using the same RESP worker as the state adapter.
 * Returns fixed status strings; connection details and server errors never escape.
 */
export function probeRedis(url) {
  let worker;
  try {
    if (!["redis:", "rediss:"].includes(new URL(url).protocol)) return "STATE_BACKEND_ERROR";
    const sab = new SharedArrayBuffer(16 + 4_000_000);
    const header = new Int32Array(sab, 0, 4);
    const body = new Uint8Array(sab, 16);
    let sequence = Atomics.load(header, 0);
    worker = new Worker(path.join(process.cwd(), "runtime", "redis-worker.mjs"), { workerData: { url, sab } });
    worker.unref();
    if (Atomics.wait(header, 0, sequence, 8_000) === "timed-out" || Atomics.load(header, 1) !== 1) return "STATE_BACKEND_ERROR";
    sequence = Atomics.load(header, 0);
    worker.postMessage(["PING"]);
    if (Atomics.wait(header, 0, sequence, 8_000) === "timed-out" || Atomics.load(header, 1) !== 1) return "STATE_BACKEND_ERROR";
    return Buffer.from(body.subarray(0, Atomics.load(header, 2))).toString("utf8") === "PONG" ? "READY" : "STATE_BACKEND_ERROR";
  } catch {
    return "STATE_BACKEND_ERROR";
  } finally {
    void worker?.terminate();
  }
}
