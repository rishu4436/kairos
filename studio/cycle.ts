import type { AgentCycleResult } from "@/paper/cycle";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import type { CycleStep, KairosCycleReport } from "@/studio/types";

export interface CycleDependencies {
  userId: string;
  kairosAgentId: string;
  marketAvailable: boolean;
  researchAvailable: boolean;
  externalIntelligence: "OK" | "DEGRADED";
  tradingWalletConnected: boolean;
  liveRequested: boolean;
  /** Paper cycle. Live execution is not called from this path. */
  runPaper?: (userId: string, now: Date) => AgentCycleResult;
}

let cycleSequence = 0;

export function resetCycleSequence(): void {
  cycleSequence = 0;
}

export async function runKairosAgentCycle(input: CycleDependencies, nowMs: number): Promise<KairosCycleReport> {
  cycleSequence += 1;
  const autonomous = await runKairosAutonomousCycle({
    userId: input.userId,
    agentId: input.kairosAgentId,
    runtimeMode: "LOCAL",
    executionMode: input.liveRequested ? "LIVE_PREVIEW" : "PAPER",
    cycleTrigger: "AGENT_STUDIO",
    startedAtMs: nowMs,
    ownerId: `studio:${input.userId}:${input.kairosAgentId}:${cycleSequence}`,
    marketAvailable: input.marketAvailable,
    researchAvailable: input.researchAvailable,
    runPaper: input.runPaper,
  });
  const startedAt = autonomous.startedAt;
  const steps: CycleStep[] = [];
  if (autonomous.marketBlocked) {
    steps.push(
      blocked("OBSERVE", "Market data is unavailable. Trading decisions are blocked."),
      skipped("ANALYZE"),
      skipped("STRATEGY_EVALUATION"),
      skipped("ARBITRATION"),
      input.researchAvailable ? skipped("RESEARCH_CONTEXT") : degraded("RESEARCH_CONTEXT", "Research provider is unavailable. Strategies are unaffected."),
      skipped("TRADE_INTENT"),
      skipped("RISK"),
      input.liveRequested ? blocked("EXECUTION", "Live execution is blocked. No paper fill was created.") : skipped("EXECUTION"),
    );
    return finish(input, autonomous.cycleId, startedAt, nowMs, steps, [], false, null, null);
  }
  if (autonomous.liveBlocked) {
    steps.push(
      { name: "OBSERVE", status: "OK", detail: null },
      { name: "ANALYZE", status: "OK", detail: null },
      { name: "STRATEGY_EVALUATION", status: "OK", detail: null },
      { name: "ARBITRATION", status: "OK", detail: null },
      input.researchAvailable ? { name: "RESEARCH_CONTEXT", status: "OK", detail: null } : degraded("RESEARCH_CONTEXT", "Research provider is unavailable."),
      skipped("TRADE_INTENT"),
      { name: "RISK", status: "OK", detail: "KAIROS risk still applies. The runtime cannot override it." },
      blocked("EXECUTION", input.tradingWalletConnected ? "Live execution was not started by the runtime." : "Trading wallet is not connected. Live execution is blocked."),
    );
    return finish(input, autonomous.cycleId, startedAt, nowMs, steps, [], false, "WAITING_FOR_RISK", null);
  }
  const thrown = autonomous.errors.find((item) => item.code === "UNKNOWN_RUNTIME_ERROR");
  if (thrown) {
    steps.push(failed("OBSERVE", thrown.message), skipped("ANALYZE"), skipped("STRATEGY_EVALUATION"), skipped("ARBITRATION"), skipped("RESEARCH_CONTEXT"), skipped("TRADE_INTENT"), skipped("RISK"), skipped("EXECUTION"));
    return finish(input, autonomous.cycleId, startedAt, nowMs, steps, [], false, null, thrown.message);
  }
  const paper = autonomous.paper;
  const correlationIds = paper?.events.map((event) => event.correlationId).filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];
  steps.push(
    { name: "OBSERVE", status: paper && (paper.ran || paper.view !== null) ? "OK" : "DEGRADED", detail: paper?.reason ?? null },
    { name: "ANALYZE", status: "OK", detail: null },
    { name: "STRATEGY_EVALUATION", status: "OK", detail: null },
    { name: "ARBITRATION", status: "OK", detail: null },
    input.researchAvailable ? { name: "RESEARCH_CONTEXT", status: "OK", detail: null } : degraded("RESEARCH_CONTEXT", "Research provider is unavailable. The paper cycle still ran."),
    { name: "TRADE_INTENT", status: autonomous.createdIntentIds.length > 0 ? "OK" : "SKIPPED", detail: autonomous.createdIntentIds.length > 0 ? null : "No intent was created." },
    { name: "RISK", status: "OK", detail: null },
    {
      name: "EXECUTION",
      status: paper?.executionMode === "PAPER" && paper.ran ? "OK" : "BLOCKED",
      detail: paper?.executionMode === "PAPER" ? "Paper execution. No broadcast." : paper?.reason ?? null,
    },
  );
  if (input.externalIntelligence === "DEGRADED") {
    steps.push({ name: "ANALYZE", status: "DEGRADED", detail: "External intelligence is degraded. KAIROS strategies still ran." });
  }
  return finish(input, autonomous.cycleId, startedAt, nowMs, steps, correlationIds, autonomous.createdIntentIds.length > 0, paper?.loopState ?? null, paper && !paper.ran ? paper.reason : null);
}

function finish(
  input: CycleDependencies,
  cycleId: string,
  startedAt: string,
  nowMs: number,
  steps: readonly CycleStep[],
  correlationIds: readonly string[],
  createdIntent: boolean,
  tradingState: string | null,
  error: string | null,
): KairosCycleReport {
  return {
    cycleId,
    userId: input.userId,
    kairosAgentId: input.kairosAgentId,
    startedAt,
    completedAt: new Date(nowMs).toISOString(),
    runtimeState: error ? "ERROR" : "RUNNING",
    tradingState,
    steps,
    correlationIds,
    createdIntent,
    signed: false,
    broadcast: false,
    riskOverridden: false,
    error,
  };
}

function blocked(name: CycleStep["name"], detail: string): CycleStep {
  return { name, status: "BLOCKED", detail };
}
function skipped(name: CycleStep["name"]): CycleStep {
  return { name, status: "SKIPPED", detail: null };
}
function degraded(name: CycleStep["name"], detail: string): CycleStep {
  return { name, status: "DEGRADED", detail };
}
function failed(name: CycleStep["name"], detail: string): CycleStep {
  return { name, status: "FAILED", detail };
}
