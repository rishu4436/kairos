import type { ExecutionMode } from "@/domain/execution-mode";
import type { AgentRuntimeState } from "@/domain/models";

export const AGENT_STATES = [
  "OFFLINE",
  "STARTING",
  "OBSERVING",
  "ANALYZING",
  "EVALUATING_STRATEGIES",
  "ARBITRATING",
  "DECISION_READY",
  "WAITING_FOR_RISK",
  "RISK_CHECK",
  "SIMULATING",
  "PAPER_EXECUTING",
  "EXECUTING",
  "MONITORING_POSITION",
  "PAUSED",
  "ERROR",
] as const satisfies readonly AgentRuntimeState[];

/**
 * Unscoped legal transitions.
 * The intelligence path stops at WAITING_FOR_RISK.
 * The older proposal path may still move SIMULATING → EXECUTING.
 * Neither edge enters PAPER_EXECUTING. Paper advances only through transitionPaperLoop.
 */
const TRANSITIONS: Record<AgentRuntimeState, readonly AgentRuntimeState[]> = {
  OFFLINE: ["STARTING"],
  STARTING: ["OBSERVING", "ERROR"],
  OBSERVING: ["ANALYZING", "PAUSED", "ERROR"],
  ANALYZING: ["EVALUATING_STRATEGIES", "OBSERVING", "ERROR"],
  EVALUATING_STRATEGIES: ["ARBITRATING", "RISK_CHECK", "OBSERVING", "PAUSED", "ERROR"],
  ARBITRATING: ["DECISION_READY", "OBSERVING", "ERROR"],
  DECISION_READY: ["WAITING_FOR_RISK", "OBSERVING", "ERROR"],
  WAITING_FOR_RISK: ["OBSERVING", "PAUSED", "ERROR"],
  RISK_CHECK: ["SIMULATING", "OBSERVING", "ERROR"],
  SIMULATING: ["EXECUTING", "OBSERVING", "ERROR"],
  PAPER_EXECUTING: ["MONITORING_POSITION", "OBSERVING", "ERROR"],
  EXECUTING: ["MONITORING_POSITION", "ERROR"],
  MONITORING_POSITION: ["OBSERVING", "PAUSED", "ERROR"],
  PAUSED: ["OBSERVING", "OFFLINE"],
  ERROR: ["OFFLINE", "STARTING"],
};

/**
 * Paper-only edges. LIVE has none.
 * SIMULATING may go to PAPER_EXECUTING here, and cannot go to EXECUTING here.
 * The base table still allows SIMULATING → EXECUTING for the older proposal path.
 */
const PAPER_LOOP_EDGES: Partial<Record<AgentRuntimeState, readonly AgentRuntimeState[]>> = {
  WAITING_FOR_RISK: ["SIMULATING", "OBSERVING", "PAUSED", "ERROR"],
  SIMULATING: ["PAPER_EXECUTING", "OBSERVING", "ERROR"],
  PAPER_EXECUTING: ["MONITORING_POSITION", "OBSERVING", "ERROR"],
  MONITORING_POSITION: ["OBSERVING", "PAUSED", "ERROR"],
};

export const AGENT_STATE_LABEL: Record<AgentRuntimeState, string> = {
  OFFLINE: "Offline",
  STARTING: "Starting",
  OBSERVING: "Observing",
  ANALYZING: "Analyzing",
  EVALUATING_STRATEGIES: "Evaluating strategies",
  ARBITRATING: "Arbitrating",
  DECISION_READY: "Decision ready",
  WAITING_FOR_RISK: "Waiting for risk",
  RISK_CHECK: "Risk check",
  SIMULATING: "Simulating",
  PAPER_EXECUTING: "Paper executing",
  EXECUTING: "Executing",
  MONITORING_POSITION: "Monitoring position",
  PAUSED: "Paused",
  ERROR: "Error",
};

export const AGENT_STATE_DETAIL: Record<AgentRuntimeState, string> = {
  OFFLINE: "The runtime is not started.",
  STARTING: "The runtime is coming up. It is not observing yet.",
  OBSERVING: "Observations can be accepted. No order is in flight.",
  ANALYZING: "The latest observation is being read.",
  EVALUATING_STRATEGIES: "Eligible strategies are being asked for evidence.",
  ARBITRATING: "Strategy candidates are being scored. Nothing is sent.",
  DECISION_READY: "A strategy was selected or rejected. The arbitrator does not create a trade intent.",
  WAITING_FOR_RISK: "Arbitration stopped here. Risk has not passed. This state cannot enter chain execution.",
  RISK_CHECK: "A proposal is in front of the user risk policy.",
  SIMULATING: "A plan is being checked. Nothing is broadcast.",
  PAPER_EXECUTING: "A simulated fill is being recorded. Nothing is signed or broadcast.",
  EXECUTING: "A chain submission would be in flight. Paper mode does not enter this state.",
  MONITORING_POSITION: "An open paper position exists. The next paper cycle can hold, add, reduce, or exit. Reading the mark does not write the book.",
  PAUSED: "The user has paused the agent.",
  ERROR: "The runtime stopped on a fault and must be reset.",
};

export type TransitionResult =
  | { ok: true; state: AgentRuntimeState }
  | { ok: false; from: AgentRuntimeState; to: AgentRuntimeState; error: string };

export function nextStates(from: AgentRuntimeState): readonly AgentRuntimeState[] {
  return TRANSITIONS[from];
}

export function canTransition(from: AgentRuntimeState, to: AgentRuntimeState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionAgent(from: AgentRuntimeState, to: AgentRuntimeState): TransitionResult {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      from,
      to,
      error: `Cannot move from ${from} to ${to}.`,
    };
  }
  return { ok: true, state: to };
}

export function paperLoopTargets(from: AgentRuntimeState, mode: ExecutionMode): readonly AgentRuntimeState[] {
  if (mode !== "PAPER") {
    return [];
  }
  return PAPER_LOOP_EDGES[from] ?? [];
}

/**
 * Advances the paper lifecycle. LIVE is refused for every edge, including edges
 * the unscoped table still allows. PAPER cannot move into EXECUTING.
 */
export function transitionPaperLoop(from: AgentRuntimeState, to: AgentRuntimeState, mode: ExecutionMode): TransitionResult {
  if (mode !== "PAPER") {
    return {
      ok: false,
      from,
      to,
      error: "Paper loop transitions require PAPER execution mode.",
    };
  }
  if (to === "EXECUTING") {
    return {
      ok: false,
      from,
      to,
      error: "Paper mode cannot enter EXECUTING.",
    };
  }
  if (!paperLoopTargets(from, mode).includes(to)) {
    return {
      ok: false,
      from,
      to,
      error: `Paper loop cannot move from ${from} to ${to}.`,
    };
  }
  return { ok: true, state: to };
}
