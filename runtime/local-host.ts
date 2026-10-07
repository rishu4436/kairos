import { randomUUID } from "node:crypto";
import { CycleScheduler } from "@/runtime/scheduler";
import { runKairosAutonomousCycle, type AutonomousCycleOutcome } from "@/runtime/cycle";
import { runAgentCycle } from "@/paper/run-cycle";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { readDataMode, type DataModeEnv } from "@/lib/mode";
import type { ObserveMarket } from "@/runtime/observe";
import type { KairosStateStore } from "@/runtime/store";
import type { AgentControlState, AutonomousExecutionMode } from "@/runtime/types";
import type { PaperAccountState, RiskPolicy } from "@/domain/models";
import type { LivePreparationAdapters } from "@/runtime/cycle";
import { autonomousStore } from "@/runtime/store";
import { readOperatorCommand, writeControl, writeOperatorCommand } from "@/operator/commands";
import { readOperatorConfig } from "@/operator/store";
import { operatorExecutionMode } from "@/operator/runtime-mode";

const DEFAULT_INTERVAL_MS = 60_000;

export interface LocalHostOptions {
  userId?: string;
  agentId?: string;
  intervalMs?: number;
  executionMode?: AutonomousExecutionMode;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onCycle?: (outcome: AutonomousCycleOutcome) => void;
  store?: KairosStateStore;
  observeMarket?: ObserveMarket;
  riskPolicy?: RiskPolicy;
  account?: PaperAccountState;
  livePreparation?: LivePreparationAdapters | ((nowMs: number) => LivePreparationAdapters);
  ownerId?: string;
  env?: DataModeEnv;
}

/**
 * Persistent local runtime host. It only schedules and invokes the canonical cycle.
 * Importing this module does not start a loop.
 */
export class LocalKairosRunner {
  private readonly scheduler = new CycleScheduler();
  private readonly options: Required<Pick<LocalHostOptions, "userId" | "agentId">> & LocalHostOptions;
  readonly ownerId: string;
  private started = false;
  private stopping = false;
  private inFlight = false;
  private stopWaiters: Array<() => void> = [];

  constructor(options: LocalHostOptions = {}) {
    const userId = options.userId ?? LOCAL_RUNTIME_USER_ID;
    const agentId = options.agentId ?? DEFAULT_AGENT_ID;
    this.options = { userId, agentId, ...options };
    this.ownerId = options.ownerId ?? `local:${userId}:${agentId}:${randomUUID()}`;
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
    if (!this.started || this.stopping) {
      return false;
    }
    const store = this.options.store ?? autonomousStore();
    if (readOperatorCommand(store).kind === "ONE_SHOT") {
      return true;
    }
    const control = store.readControl(this.options.userId, this.options.agentId);
    if (control === "PAUSED" || control === "STOPPED") {
      return false;
    }
    return this.scheduler.due(nowMs);
  }

  async tick(nowMs = this.now()): Promise<AutonomousCycleOutcome | null> {
    if (!this.started || this.stopping || this.inFlight || !this.due(nowMs)) {
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
      const store = this.options.store ?? autonomousStore();
      if (readOperatorCommand(store).kind === "ONE_SHOT") {
        writeControl("STOPPED", store, new Date(nowMs).toISOString());
        writeOperatorCommand({ kind: "IDLE", requestedAt: new Date(nowMs).toISOString() }, store);
      }
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
    const operator = readOperatorConfig(this.options.store ?? autonomousStore());
    const requested = this.options.executionMode ?? (readDataMode(this.options.env) === "paper" ? "PAPER" : operatorExecutionMode(operator));
    const executionMode = resolveRunnerExecutionMode(requested, this.options.env);
    const livePreparation =
      typeof this.options.livePreparation === "function"
        ? this.options.livePreparation(nowMs)
        : this.options.livePreparation;
    return runKairosAutonomousCycle({
      userId: this.options.userId,
      agentId: this.options.agentId,
      runtimeMode: "LOCAL",
      executionMode,
      cycleTrigger: "SCHEDULER",
      startedAtMs: nowMs,
      ownerId: this.ownerId,
      marketAvailable: true,
      researchAvailable: false,
      runPaper: executionMode === "PAPER" ? (userId, now) => runAgentCycle(userId, now) : undefined,
      observeMarket: this.options.observeMarket,
      riskPolicy: this.options.riskPolicy,
      account: this.options.account,
      livePreparation,
      store: this.options.store,
      operatorConfig: operator,
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
    const configured = this.options.intervalMs ?? readOperatorConfig(this.options.store ?? autonomousStore()).runtime.cycleIntervalMs ?? positiveInterval(process.env.KAIROS_CYCLE_INTERVAL_MS);
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

export function resolveRunnerExecutionMode(
  explicit: AutonomousExecutionMode | undefined,
  env?: DataModeEnv,
): AutonomousExecutionMode {
  const data = readDataMode(env);
  const mode = explicit ?? (data === "live" ? "LIVE_PREVIEW" : "PAPER");
  if (data === "paper" && mode !== "PAPER") {
    throw new Error("Invalid combination: paper data mode cannot run LIVE execution.");
  }
  if (data === "live" && mode === "PAPER") {
    throw new Error("Invalid combination: live data mode cannot run paper execution.");
  }
  return mode;
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
