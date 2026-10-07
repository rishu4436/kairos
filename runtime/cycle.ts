import { listStrategyCandidates } from "@/lifecycle/candidates";
import { evaluateShadow } from "@/lifecycle/shadow";
import type { AgentCycleResult } from "@/paper/cycle";
import { asAgentId, asUserId } from "@/domain/ids";
import { exportPaperBook, importPaperBook, type PaperBookSnapshot } from "@/paper/snapshot";
import { readPaperBook } from "@/paper/store";
import { runAgentCycle } from "@/paper/run-cycle";
import { hydrateDomain, lastResearchAt, persistDomain, rememberResearchAt } from "@/runtime/domain-state";
import { autonomousStore, commitRecord, stateKey, terminalCycle, type KairosStateStore } from "@/runtime/store";
import { researchDue } from "@/runtime/research-schedule";
import { FAILURE_POLICY, type AgentControlState, type AutonomousExecutionMode, type CycleTrigger, type KairosCycleResult, type KairosCycleState, type RuntimeFailure, type RuntimeMode } from "@/runtime/types";
import type { StrategyContext } from "@/strategies/context";

const LEASE_TTL_MS = 60_000;
const assetLocks = new Set<string>();

export interface AutonomousCycleInput {
  userId: string;
  agentId: string;
  runtimeMode: RuntimeMode;
  executionMode: AutonomousExecutionMode;
  cycleTrigger: CycleTrigger;
  startedAtMs: number;
  ownerId: string;
  marketAvailable?: boolean;
  researchAvailable?: boolean;
  /** Injected paper cycle. Live modes never call it. */
  runPaper?: (userId: string, now: Date) => AgentCycleResult;
  /** Optional research work. A throw is non-blocking. */
  researchStep?: () => void;
  shadowContext?: StrategyContext | null;
  store?: KairosStateStore;
  control?: AgentControlState;
}

export interface AutonomousCycleOutcome extends KairosCycleResult {
  marketBlocked: boolean;
  liveBlocked: boolean;
  paper: AgentCycleResult | null;
}

export function runKairosAutonomousCycle(input: AutonomousCycleInput): AutonomousCycleOutcome {
  const store = input.store ?? autonomousStore();
  const startedAt = new Date(input.startedAtMs).toISOString();
  const cycleId = `cycle_${input.userId}_${input.agentId}_${input.startedAtMs}`;
  const transitions: { state: KairosCycleState; at: string }[] = [{ state: "CREATED", at: startedAt }];
  const errors: RuntimeFailure[] = [];
  const warnings: string[] = [];
  const push = (state: KairosCycleState) => transitions.push({ state, at: new Date(input.startedAtMs).toISOString() });

  recoverInterrupted(store, input.userId, input.agentId, startedAt);
  hydratePaperBook(store, input.userId, input.agentId);
  hydrateDomain(store, input.userId, input.agentId);
  const control = input.control ?? store.readControl(input.userId, input.agentId);
  if (control === "STOPPED" || control === "PAUSED") {
    const status: KairosCycleState = control === "STOPPED" ? "FAILED" : "COMPLETED";
    warnings.push(control === "STOPPED" ? "Runtime is stopped." : "Runtime is paused. No new execution intent was created.");
    return finish(input, store, cycleId, startedAt, status, [], [], errors, warnings, [], false, false, null, transitions);
  }

  push("ACQUIRING_LOCK");
  const lease = store.acquireLease({
    userId: input.userId,
    agentId: input.agentId,
    ownerId: input.ownerId,
    nowMs: input.startedAtMs,
    ttlMs: LEASE_TTL_MS,
  });
  if (!lease.ok) {
    errors.push(failure("LEASE_UNAVAILABLE", "Another runtime owns this agent."));
    return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, false, null, transitions);
  }

  try {
    if (input.marketAvailable === false) {
      errors.push(failure("MARKET_DATA_ERROR", "Market data is unavailable. Trading decisions are blocked."));
      return finish(input, store, cycleId, startedAt, "DEGRADED", [], [], errors, warnings, [], true, false, null, transitions);
    }
    if (input.executionMode !== "PAPER") {
      warnings.push("Live execution is blocked. No paper fill was created.");
      return finish(input, store, cycleId, startedAt, "COMPLETED", [], [], errors, warnings, [], false, true, null, transitions);
    }

    push("OBSERVING");
    push("REVIEWING_POSITIONS");
    push("EXECUTING_PAPER");
    let paper: AgentCycleResult;
    try {
      paper = (input.runPaper ?? ((userId: string, now: Date) => runAgentCycle(userId, now, { safetyMode: control === "RISK_REDUCTION_ONLY" ? "RISK_REDUCTION_ONLY" : "NORMAL" })))(input.userId, new Date(input.startedAtMs));
    } catch (error) {
      errors.push(failure("UNKNOWN_RUNTIME_ERROR", error instanceof Error ? error.message : "Cycle failed."));
      return finish(input, store, cycleId, startedAt, "FAILED", [], [], errors, warnings, [], false, false, null, transitions);
    }

    const research = reviewResearch(input, warnings, errors);
    push("RESEARCHING");
    push("RECONCILING");
    const assets = assetResultsFrom(paper);
    const blocking = errors.some((item) => FAILURE_POLICY[item.code] === "BLOCKING");
    const degraded = assets.some((asset) => asset.status === "BLOCKED" || asset.status === "FAILED") || errors.some((item) => item.code === "RESEARCH_ERROR" || FAILURE_POLICY[item.code] === "DEGRADING");
    const status: KairosCycleState = blocking ? "FAILED" : degraded || !paper.ran ? "DEGRADED" : "COMPLETED";
    if (!paper.ran && paper.reason) {
      warnings.push(paper.reason);
    }
    return finish(input, store, cycleId, startedAt, status, assets, research, errors, warnings, paper.createdIntentIds, false, false, paper, transitions);
  } finally {
    store.releaseLease(input.userId, input.agentId, input.ownerId);
  }
}

export function acquireAssetMutation(userId: string, representationId: string): boolean {
  const key = `${userId}\n${representationId}`;
  if (assetLocks.has(key)) {
    return false;
  }
  assetLocks.add(key);
  return true;
}

export function releaseAssetMutation(userId: string, representationId: string): void {
  assetLocks.delete(`${userId}\n${representationId}`);
}

function reviewResearch(input: AutonomousCycleInput, warnings: string[], errors: RuntimeFailure[]): KairosCycleResult["researchResults"] {
  const results: { candidateId: string; status: string; intentCreated: false }[] = [];
  for (const candidate of listStrategyCandidates(input.userId)) {
    if (candidate.status === "SHADOW" && input.shadowContext) {
      try {
        const reviewed = evaluateShadow(candidate, input.shadowContext, input.startedAtMs);
        if (reviewed.tradeIntent !== null || reviewed.executable !== false) {
          throw new Error("SHADOW_CREATED_INTENT");
        }
        results.push({ candidateId: candidate.candidateId, status: "SHADOW", intentCreated: false });
      } catch (error) {
        errors.push(failure("RESEARCH_ERROR", error instanceof Error ? error.message : "Shadow review failed."));
      }
    }
    if (candidate.status === "PAPER_ACTIVE" && input.executionMode !== "PAPER") {
      warnings.push(`Research candidate ${candidate.candidateId} is excluded from ${input.executionMode}.`);
    }
  }
  const schedule = researchDue({
    nowMs: input.startedAtMs,
    lastResearchAtMs: lastResearchAt(input.userId, input.agentId),
    hasThesis: true,
    regimeChanged: false,
    majorEventChanged: false,
    healthDegraded: false,
  });
  if (input.researchAvailable === false) {
    warnings.push("Research provider is unavailable. Strategies are unaffected.");
    return results;
  }
  if (!schedule.due || !input.researchStep) {
    return results;
  }
  try {
    input.researchStep();
    rememberResearchAt(input.userId, input.agentId, input.startedAtMs);
  } catch (error) {
    errors.push(failure("RESEARCH_ERROR", error instanceof Error ? error.message : "Research failed."));
    warnings.push("Research failed. The trading cycle continued.");
  }
  return results;
}

function finish(
  input: AutonomousCycleInput,
  store: KairosStateStore,
  cycleId: string,
  startedAt: string,
  status: KairosCycleResult["status"],
  assetResults: KairosCycleResult["assetResults"],
  researchResults: KairosCycleResult["researchResults"],
  errors: RuntimeFailure[],
  warnings: string[],
  createdIntentIds: readonly string[],
  marketBlocked: boolean,
  liveBlocked: boolean,
  paper: AgentCycleResult | null,
  transitions: { state: KairosCycleState; at: string }[],
): AutonomousCycleOutcome {
  const completedAt = new Date(input.startedAtMs).toISOString();
  const interval = positiveInterval(process.env.KAIROS_CYCLE_INTERVAL_MS);
  const result: AutonomousCycleOutcome = {
    cycleId,
    userId: input.userId,
    agentId: input.agentId,
    startedAt,
    completedAt,
    runtimeMode: input.runtimeMode,
    executionMode: input.executionMode,
    status,
    assetResults,
    researchResults,
    errors,
    warnings,
    nextSuggestedRunAt: new Date(input.startedAtMs + interval).toISOString(),
    createdIntentIds,
    transitions,
    marketBlocked,
    liveBlocked,
    paper,
  };
  store.saveCycle(result);
  store.appendAudit({
    id: `${cycleId}:${status}`,
    at: completedAt,
    userId: input.userId,
    agentId: input.agentId,
    cycleId,
    type: status === "FAILED" ? "CYCLE_FAILED" : status === "DEGRADED" ? "CYCLE_DEGRADED" : "CYCLE_COMPLETED",
    message: warnings[0] ?? status,
  });
  const snapshot = exportPaperBook(asUserId(input.userId), asAgentId(input.agentId));
  if (snapshot) {
    commitRecord(store, stateKey(["paper", input.userId, input.agentId]), snapshot, completedAt);
  }
  persistDomain(store, input.userId, input.agentId, completedAt, cycleId);
  store.writeHeartbeat(input.userId, input.agentId, {
    lastCycleStarted: startedAt,
    lastCycleCompleted: completedAt,
    lastSuccessfulCycle: status === "FAILED" ? store.readHeartbeat(input.userId, input.agentId).lastSuccessfulCycle : completedAt,
    lastError: errors[0]?.message ?? null,
    nextCycleAt: result.nextSuggestedRunAt,
    runtimeStatus: input.control ?? "RUNNING",
  });
  return result;
}

function hydratePaperBook(store: KairosStateStore, userId: string, agentId: string): void {
  if (readPaperBook(asUserId(userId), asAgentId(agentId))) {
    return;
  }
  const saved = store.get<PaperBookSnapshot>(stateKey(["paper", userId, agentId]));
  if (!saved || saved.schemaVersion !== 1) {
    return;
  }
  importPaperBook(saved.value);
}

function recoverInterrupted(store: KairosStateStore, userId: string, agentId: string, at: string): void {
  const cycles = store.listCycles(userId, agentId);
  const last = cycles.at(-1);
  if (!last || terminalCycle(last.status)) {
    return;
  }
  store.saveCycle({ ...last, status: "INTERRUPTED", completedAt: at });
  store.appendAudit({
    id: `${last.cycleId}:INTERRUPTED`,
    at,
    userId,
    agentId,
    cycleId: last.cycleId,
    type: "CYCLE_INTERRUPTED",
    message: "Recovered an unfinished cycle. Completed intents were not filled again.",
  });
}

function assetResultsFrom(paper: AgentCycleResult): KairosCycleResult["assetResults"] {
  const assets = paper.view?.assets ?? [];
  return assets.map((asset) => ({
    assetId: asset.assetId,
    ticker: asset.ticker,
    contextId: null,
    positionState: asset.steps.some((step) => step.detail?.includes("HOLD")) ? "OPEN" : null,
    strategyDecision: null,
    arbitrationDecision: null,
    positionDecision: asset.steps.find((step) => step.label === "Position decision")?.detail ?? null,
    riskDecision: asset.steps.find((step) => step.label === "Risk")?.detail ?? null,
    executionState: asset.steps.find((step) => step.label === "Paper execution")?.detail ?? null,
    status: asset.steps.some((step) => step.state === "failed") ? "FAILED" : "OK",
  }));
}

function failure(code: RuntimeFailure["code"], message: string): RuntimeFailure {
  return { code, class: FAILURE_POLICY[code], message, assetId: null };
}

function positiveInterval(raw: string | undefined): number {
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : 60_000;
}
