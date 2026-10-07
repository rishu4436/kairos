import { CycleScheduler } from "@/runtime/scheduler";
import { runKairosAutonomousCycle, type AutonomousCycleOutcome } from "@/runtime/cycle";
import { runAgentCycle } from "@/paper/run-cycle";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { resolveProductExecutionMode } from "@/domain/execution-mode";
import type { AgentControlState, AutonomousExecutionMode } from "@/runtime/types";

const DEFAULT_INTERVAL_MS = 60_000;

export interface LocalHostOptions {
  userId?: string;
  agentId?: string;
  intervalMs?: number;
  executionMode?: AutonomousExecutionMode;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onCycle?: (outcome: AutonomousCycleOutcome) => void;
}

/**
 * Persistent local runtime host. It only schedules and invokes the canonical cycle.
 * Importing this module does not start a loop.
 */
export class LocalKairosRunner {
  private readonly scheduler = new CycleScheduler();
  private readonly options: Required<Pick<LocalHostOptions, "userId" | "agentId">> & LocalHostOptions;
  private started = false;
  private stopping = false;
  private inFlight = false;
  private stopWaiters: Array<() => void> = [];

  constructor(options: LocalHostOptions = {}) {
    this.options = {
      userId: options.userId ?? LOCAL_RUNTIME_USER_ID,
      agentId: options.agentId ?? DEFAULT_AGENT_ID,
      ...options,
    };
  }

  start(nowMs = this.now()): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.stopping = false;
    this.scheduler.schedule(this.interval(), nowMs);
  }

  stop(): void {
    this.stopping = true;
    this.started = false;
    this.scheduler.disarm();
    if (!this.inFlight) {
      this.flushStop();
    }
  }

  async waitUntilStopped(): Promise<void> {
    if (!this.inFlight && !this.started) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.stopWaiters.push(resolve);
      if (!this.inFlight && !this.started) {
        this.flushStop();
      }
    });
  }

  due(nowMs = this.now()): boolean {
    return this.started && !this.stopping && this.scheduler.due(nowMs);
  }

  async tick(nowMs = this.now()): Promise<AutonomousCycleOutcome | null> {
    if (!this.started || this.stopping || this.inFlight || !this.scheduler.due(nowMs)) {
      return null;
    }
    this.inFlight = true;
    try {
      const outcome = await this.runOnce(nowMs);
      if (outcome.status === "FAILED") {
        this.scheduler.recordFailure(nowMs);
      } else {
        this.scheduler.recordSuccess(nowMs);
      }
      this.options.onCycle?.(outcome);
      return outcome;
    } catch {
      this.scheduler.recordFailure(nowMs);
      throw new Error("LOCAL_RUNNER_CYCLE_FAILED");
    } finally {
      this.inFlight = false;
      if (this.stopping) {
        this.flushStop();
      }
    }
  }

  async runOnce(nowMs = this.now()): Promise<AutonomousCycleOutcome> {
    const executionMode = resolveProductExecutionMode({
      serverMode: this.options.executionMode ?? "PAPER",
      requested: "LIVE",
    });
    return runKairosAutonomousCycle({
      userId: this.options.userId,
      agentId: this.options.agentId,
      runtimeMode: "LOCAL",
      executionMode,
      cycleTrigger: "SCHEDULER",
      startedAtMs: nowMs,
      ownerId: `local:${this.options.userId}:${this.options.agentId}`,
      marketAvailable: true,
      researchAvailable: false,
      runPaper: executionMode === "PAPER" ? (userId, now) => runAgentCycle(userId, now) : undefined,
      control: "RUNNING" satisfies AgentControlState,
    });
  }

  async runLoop(): Promise<void> {
    this.start();
    while (this.started && !this.stopping) {
      const now = this.now();
      if (this.due(now)) {
        await this.tick(now);
      }
      const wait = Math.min(1_000, this.interval());
      await (this.options.sleep ?? delay)(wait);
    }
    await this.waitUntilStopped();
  }

  private interval(): number {
    const configured = this.options.intervalMs ?? positiveInterval(process.env.KAIROS_CYCLE_INTERVAL_MS);
    return configured;
  }

  private now(): number {
    return this.options.nowMs?.() ?? Date.now();
  }

  private flushStop(): void {
    const waiters = this.stopWaiters;
    this.stopWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }
}

function positiveInterval(raw: string | undefined): number {
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLocalKairosRunner(options?: LocalHostOptions): LocalKairosRunner {
  return new LocalKairosRunner(options);
}
