const DEFAULT_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** One-shot due times. There is no interval timer and no busy loop. */
export class CycleScheduler {
  private intervalMs = DEFAULT_INTERVAL_MS;
  private backoffMs = DEFAULT_INTERVAL_MS;
  private nextAtMs: number | null = null;
  private armed = false;

  schedule(intervalMs: number, nowMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
      throw new Error("Cycle interval must be at least 1000 milliseconds.");
    }
    this.intervalMs = intervalMs;
    this.backoffMs = intervalMs;
    this.nextAtMs = nowMs + intervalMs;
    this.armed = true;
  }

  disarm(): void {
    this.armed = false;
    this.nextAtMs = null;
  }

  due(nowMs: number): boolean {
    return this.armed && this.nextAtMs !== null && nowMs >= this.nextAtMs;
  }

  nextIso(nowMs: number): string | null {
    if (!this.armed || this.nextAtMs === null || this.nextAtMs <= nowMs) {
      return this.armed && this.nextAtMs !== null ? new Date(this.nextAtMs).toISOString() : null;
    }
    return new Date(this.nextAtMs).toISOString();
  }

  recordSuccess(nowMs: number): void {
    this.backoffMs = this.intervalMs;
    if (this.armed) {
      this.nextAtMs = nowMs + this.intervalMs;
    }
  }

  recordFailure(nowMs: number): void {
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    if (this.armed) {
      this.nextAtMs = nowMs + this.backoffMs;
    }
  }
}
