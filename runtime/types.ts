export const RUNTIME_MODES = ["LOCAL", "AGENT_STUDIO"] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export const EXECUTION_MODES = ["PAPER", "LIVE_PREVIEW", "LIVE"] as const;
export type AutonomousExecutionMode = (typeof EXECUTION_MODES)[number];

export const CYCLE_TRIGGERS = ["SCHEDULER", "MANUAL", "AGENT_STUDIO"] as const;
export type CycleTrigger = (typeof CYCLE_TRIGGERS)[number];

export const CYCLE_STATES = [
  "CREATED",
  "ACQUIRING_LOCK",
  "OBSERVING",
  "BUILDING_CONTEXT",
  "EVALUATING",
  "REVIEWING_POSITIONS",
  "ARBITRATING",
  "RESEARCHING",
  "RISK_CHECKING",
  "EXECUTION_PREPARATION",
  "EXECUTING_PAPER",
  "RECONCILING",
  "COMPLETED",
  "DEGRADED",
  "FAILED",
  "INTERRUPTED",
] as const;
export type KairosCycleState = (typeof CYCLE_STATES)[number];

export const CONTROL_STATES = ["RUNNING", "PAUSED", "STOPPED", "RISK_REDUCTION_ONLY"] as const;
export type AgentControlState = (typeof CONTROL_STATES)[number];

export const FAILURE_CLASSES = ["BLOCKING", "DEGRADING", "NON_BLOCKING"] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const RUNTIME_FAILURES = [
  "STATE_BACKEND_ERROR",
  "STATE_BACKEND_NOT_CONFIGURED",
  "STATE_INVALID",
  "LEASE_UNAVAILABLE",
  "MARKET_DATA_ERROR",
  "CONTEXT_INVALID",
  "STRATEGY_ERROR",
  "ARBITRATION_ERROR",
  "RISK_ERROR",
  "PAPER_EXECUTION_ERROR",
  "RESEARCH_ERROR",
  "EXTERNAL_INTELLIGENCE_ERROR",
  "UNKNOWN_RUNTIME_ERROR",
] as const;
export type RuntimeFailureCode = (typeof RUNTIME_FAILURES)[number];

export interface RuntimeFailure {
  code: RuntimeFailureCode;
  class: FailureClass;
  message: string;
  assetId: string | null;
}

export interface AssetCycleResult {
  assetId: string;
  ticker: string;
  contextId: string | null;
  positionState: string | null;
  strategyDecision: string | null;
  arbitrationDecision: string | null;
  positionDecision: string | null;
  riskDecision: string | null;
  executionState: string | null;
  status: "OK" | "BLOCKED" | "DEGRADED" | "FAILED";
}

export interface KairosCycleResult {
  cycleId: string;
  userId: string;
  agentId: string;
  startedAt: string;
  completedAt: string;
  runtimeMode: RuntimeMode;
  executionMode: AutonomousExecutionMode;
  status: KairosCycleState;
  assetResults: readonly AssetCycleResult[];
  researchResults: readonly { candidateId: string; status: string; intentCreated: false }[];
  errors: readonly RuntimeFailure[];
  warnings: readonly string[];
  nextSuggestedRunAt: string;
  createdIntentIds: readonly string[];
  transitions: readonly { state: KairosCycleState; at: string }[];
}

export interface AgentHeartbeatRecord {
  lastCycleStarted: string | null;
  lastCycleCompleted: string | null;
  lastSuccessfulCycle: string | null;
  lastError: string | null;
  nextCycleAt: string | null;
  runtimeStatus: AgentControlState | "OFFLINE";
}

export interface AgentHealthReport {
  overall: "HEALTHY" | "DEGRADED" | "BLOCKED" | "OFFLINE";
  market: string;
  research: string;
  fmp: string;
  tradingWallet: string;
  paperRuntime: string;
  liveReadiness: "BLOCKED";
  paperReadiness: "READY" | "BLOCKED";
  stateBackend: "MEMORY" | "REDIS";
  durable: boolean;
}

export const FAILURE_POLICY: Readonly<Record<RuntimeFailureCode, FailureClass>> = {
  STATE_BACKEND_ERROR: "BLOCKING",
  STATE_BACKEND_NOT_CONFIGURED: "BLOCKING",
  STATE_INVALID: "BLOCKING",
  LEASE_UNAVAILABLE: "BLOCKING",
  MARKET_DATA_ERROR: "DEGRADING",
  CONTEXT_INVALID: "DEGRADING",
  STRATEGY_ERROR: "DEGRADING",
  ARBITRATION_ERROR: "DEGRADING",
  RISK_ERROR: "BLOCKING",
  PAPER_EXECUTION_ERROR: "DEGRADING",
  RESEARCH_ERROR: "NON_BLOCKING",
  EXTERNAL_INTELLIGENCE_ERROR: "NON_BLOCKING",
  UNKNOWN_RUNTIME_ERROR: "DEGRADING",
};
