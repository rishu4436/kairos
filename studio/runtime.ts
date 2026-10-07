import { runtimeEvent } from "@/studio/events";
import { buildRuntimeHealth } from "@/studio/health";
import { CycleScheduler } from "@/studio/scheduler";
import { InMemoryRuntimeStateStore, type RuntimeState } from "@/studio/store";
import { runKairosAgentCycle, type CycleDependencies } from "@/studio/cycle";
import type { AgentRuntime, KairosCycleReport, RuntimeHealthReport, StudioRuntimeState } from "@/studio/types";

export interface RuntimeOptions {
  kairosAgentId: string;
  userId: string;
  dependencies: Omit<CycleDependencies, "userId" | "kairosAgentId">;
  studioProjectPresent?: boolean;
  configurationValid?: boolean;
}

abstract class BaseRuntime implements AgentRuntime {
  abstract readonly kind: "LOCAL" | "AGENT_STUDIO";
  protected state: StudioRuntimeState = "OFFLINE";
  protected startedAtMs: number | null = null;
  protected readonly scheduler = new CycleScheduler();
  protected readonly store: InMemoryRuntimeStateStore;

  constructor(protected readonly options: RuntimeOptions) {
    this.store = new InMemoryRuntimeStateStore(this.kindFromOptions());
  }

  protected abstract kindFromOptions(): "LOCAL" | "AGENT_STUDIO";

  start(nowMs: number): StudioRuntimeState {
    if (this.kind === "AGENT_STUDIO" && this.options.configurationValid === false) {
      this.state = "ERROR";
      this.record(nowMs, "AGENT_RUNTIME_DEGRADED", null, "AGENT_STUDIO_CONFIGURATION_INVALID");
      return this.state;
    }
    this.state = "RUNNING";
    this.startedAtMs = nowMs;
    this.record(nowMs, "AGENT_STARTED", null, null);
    return this.state;
  }

  stop(nowMs: number): StudioRuntimeState {
    this.state = "PAUSED";
    this.scheduler.disarm();
    this.touch(nowMs);
    this.record(nowMs, "AGENT_STOPPED", null, null);
    return this.state;
  }

  status(): StudioRuntimeState {
    return this.state;
  }

  health(): RuntimeHealthReport {
    return buildRuntimeHealth({
      processUp: this.state === "RUNNING" || this.state === "PAUSED" || this.state === "LOCAL",
      studioProjectPresent: this.options.studioProjectPresent === true,
      market: this.options.dependencies.marketAvailable ? "PAPER_SAMPLE" : "UNAVAILABLE",
      researchLabel: this.options.dependencies.researchAvailable ? "CONNECTED" : "NOT CONFIGURED",
      strategiesReady: true,
      executionPrepared: true,
      tradingWalletConnected: this.options.dependencies.tradingWalletConnected,
    });
  }

  scheduleCycle(intervalMs: number, nowMs: number): void {
    this.scheduler.schedule(intervalMs, nowMs);
    this.touch(nowMs);
  }

  runCycle(nowMs: number): KairosCycleReport {
    if (this.state !== "RUNNING") {
      this.state = "ERROR";
      const report = this.failed(nowMs, "The runtime is not running.");
      this.record(nowMs, "AGENT_CYCLE_FAILED", report.cycleId, report.error);
      return report;
    }
    const cycleIdPreview = `pending_${nowMs}`;
    this.record(nowMs, "AGENT_CYCLE_STARTED", cycleIdPreview, null);
    let report: KairosCycleReport;
    try {
      report = runKairosAgentCycle({ ...this.options.dependencies, userId: this.options.userId, kairosAgentId: this.options.kairosAgentId }, nowMs);
    } catch (error) {
      report = this.failed(nowMs, error instanceof Error ? error.message : "Cycle failed.");
    }
    const book = this.store.read(this.options.kairosAgentId);
    book.lastCycle = report;
    book.cycles.push(report);
    book.heartbeat.lastCycleStarted = report.startedAt;
    book.heartbeat.lastCycleCompleted = report.completedAt;
    book.heartbeat.tradingState = report.tradingState;
    book.heartbeat.currentState = this.state;
    if (report.steps.some((step) => step.name === "OBSERVE" && step.status === "OK")) {
      book.heartbeat.lastSuccessfulObservation = report.completedAt;
    }
    if (report.error || report.steps.some((step) => step.status === "FAILED" || step.status === "BLOCKED")) {
      book.heartbeat.lastError = report.error ?? report.steps.find((step) => step.status === "BLOCKED" || step.status === "FAILED")?.detail ?? null;
      this.scheduler.recordFailure(nowMs);
      this.record(nowMs, report.error ? "AGENT_CYCLE_FAILED" : "AGENT_RUNTIME_DEGRADED", report.cycleId, book.heartbeat.lastError);
    } else {
      book.heartbeat.lastError = null;
      this.scheduler.recordSuccess(nowMs);
      this.record(nowMs, "AGENT_CYCLE_COMPLETED", report.cycleId, null);
    }
    book.heartbeat.nextCycle = this.scheduler.nextIso(nowMs);
    this.store.write(this.options.kairosAgentId, book);
    return report;
  }

  pump(nowMs: number): KairosCycleReport | null {
    if (!this.scheduler.due(nowMs)) {
      return null;
    }
    return this.runCycle(nowMs);
  }

  heartbeatView(nowMs: number) {
    const book = this.store.read(this.options.kairosAgentId);
    return {
      ...book.heartbeat,
      currentState: this.state,
      uptimeMs: this.startedAtMs === null ? null : Math.max(0, nowMs - this.startedAtMs),
      nextCycle: this.scheduler.nextIso(nowMs),
    };
  }

  protected touch(nowMs: number): void {
    const book = this.store.read(this.options.kairosAgentId);
    book.state = this.state;
    book.startedAtMs = this.startedAtMs;
    book.heartbeat.currentState = this.state;
    book.heartbeat.uptimeMs = this.startedAtMs === null ? null : Math.max(0, nowMs - this.startedAtMs);
    book.heartbeat.nextCycle = this.scheduler.nextIso(nowMs);
    this.store.write(this.options.kairosAgentId, book);
  }

  protected record(nowMs: number, type: Parameters<typeof runtimeEvent>[0]["type"], cycleId: string | null, detail: string | null): void {
    const book = this.store.read(this.options.kairosAgentId);
    book.state = this.state;
    book.events.push(runtimeEvent({ type, kairosAgentId: this.options.kairosAgentId, cycleId, nowMs, state: this.state, detail }));
    this.store.write(this.options.kairosAgentId, book);
  }

  protected failed(nowMs: number, message: string): KairosCycleReport {
    return {
      cycleId: `cycle_${nowMs}_failed`,
      userId: this.options.userId,
      kairosAgentId: this.options.kairosAgentId,
      startedAt: new Date(nowMs).toISOString(),
      completedAt: new Date(nowMs).toISOString(),
      runtimeState: "ERROR",
      tradingState: null,
      steps: [],
      correlationIds: [],
      createdIntent: false,
      signed: false,
      broadcast: false,
      riskOverridden: false,
      error: message,
    };
  }
}

export class LocalRuntimeProvider extends BaseRuntime {
  readonly kind = "LOCAL" as const;
  protected kindFromOptions(): "LOCAL" {
    return "LOCAL";
  }
}

export class AgentStudioRuntimeProvider extends BaseRuntime {
  readonly kind = "AGENT_STUDIO" as const;
  protected kindFromOptions(): "AGENT_STUDIO" {
    return "AGENT_STUDIO";
  }

  override start(nowMs: number): StudioRuntimeState {
    if (this.options.studioProjectPresent !== true) {
      this.state = "OFFLINE";
      this.record(nowMs, "AGENT_RUNTIME_DEGRADED", null, "AGENT_STUDIO_PROJECT_NOT_FOUND");
      return this.state;
    }
    return super.start(nowMs);
  }
}

export function readRuntimeBook(runtime: LocalRuntimeProvider | AgentStudioRuntimeProvider, kairosAgentId: string): RuntimeState {
  return new InMemoryRuntimeStateStore(runtime.kind).read(kairosAgentId);
}
