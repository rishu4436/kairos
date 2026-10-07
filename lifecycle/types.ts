export const STRATEGY_MEMORY_POLICY_VERSION = "1.0";

export const STRATEGY_SOURCES = ["BUILT_IN", "RESEARCH_GENERATED"] as const;
export type StrategySource = (typeof STRATEGY_SOURCES)[number];

export const BUILT_IN_LIFECYCLE = ["IMPLEMENTED", "SHADOW", "PAPER_ACTIVE", "LIVE_ELIGIBLE", "LIVE_ACTIVE", "RETIRED"] as const;
export const RESEARCH_LIFECYCLE = [
  "PROPOSED",
  "VALIDATING",
  "EXPERIMENTING",
  "CANDIDATE",
  "SHADOW",
  "PAPER_ACTIVE",
  "LIVE_ELIGIBLE",
  "REJECTED",
  "RETIRED",
] as const;
export type BuiltInLifecycle = (typeof BUILT_IN_LIFECYCLE)[number];
export type ResearchLifecycle = (typeof RESEARCH_LIFECYCLE)[number];
export type StrategyLifecycleState = BuiltInLifecycle | ResearchLifecycle;

export const SAMPLE_STATES = ["INSUFFICIENT", "EARLY", "DEVELOPING", "ESTABLISHED"] as const;
export type SampleState = (typeof SAMPLE_STATES)[number];

export const HEALTH_STATES = ["UNKNOWN", "INSUFFICIENT_DATA", "HEALTHY", "DEGRADED", "UNSTABLE", "RETIRED"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export const OUTCOME_DATASETS = ["PAPER", "EXPERIMENT", "SHADOW"] as const;
export type OutcomeDataset = (typeof OUTCOME_DATASETS)[number];

export interface StrategyVersion {
  strategyId: string;
  version: string;
  source: StrategySource;
  createdAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  definition: string;
  status: StrategyLifecycleState;
}

export interface StrategyCandidate {
  candidateId: string;
  thesisId: string;
  proposalId: string;
  strategyId: string;
  strategyVersion: string;
  assetScope: readonly string[];
  sessionScope: readonly string[];
  regimeScope: readonly string[];
  conditions: readonly { feature: string; operator: string; threshold: string | number | readonly string[] }[];
  action: "BUY" | "SELL" | "OBSERVE";
  status: ResearchLifecycle;
  createdAt: string;
  lastEvaluatedAt: string | null;
  userId: string;
}

export interface PerformanceContext {
  assetId: string | null;
  regime: string | null;
  session: string | null;
}

export interface StrategyPerformanceRecord {
  strategyId: string;
  strategyVersion: string;
  userId: string;
  dataset: OutcomeDataset;
  context: PerformanceContext;
  signalCount: number;
  tradeCount: number;
  wins: number;
  losses: number;
  grossPnL: string;
  netPnL: string;
  winRate: string | null;
  averageReturn: string | null;
  expectancy: string | null;
  profitFactor: string | null;
  maxDrawdown: string;
  averageHoldingPeriod: string | null;
  sampleSize: number;
  sampleState: SampleState;
  lastOutcome: string | null;
  consecutiveLosses: number;
  conflictCount: number;
  dataFailures: number;
  /** Internal running totals. They keep expectancy and drawdown reproducible. */
  winSum: string;
  lossAbs: string;
  peakPnL: string;
  holdingSum: string;
  holdingCount: number;
  updatedAt: string;
  snapshot: {
    marketAt: string;
    strategyVersion: string;
    policyVersion: string;
    experimentVersion: string | null;
  };
}

export interface StrategyHealthReport {
  strategyId: string;
  strategyVersion: string;
  userId: string;
  dataset: OutcomeDataset;
  status: HealthState;
  sampleSize: number;
  sampleState: SampleState;
  quality: SampleState | "UNKNOWN";
  expectancy: string | null;
  drawdown: string | null;
  consistency: "STABLE" | "WEAK" | "UNKNOWN";
  assetCoverage: readonly string[];
  regimeCoverage: readonly { regime: string; status: HealthState }[];
  sessionCoverage: readonly { session: string; status: HealthState }[];
  warnings: readonly string[];
  lastOutcome: string | null;
  updatedAt: string | null;
}

export interface PromotionAudit {
  candidateId: string;
  strategyVersion: string;
  policyVersion: string;
  timestamp: string;
  result: "PROMOTION_PASS" | "PROMOTION_FAIL" | "INSUFFICIENT_EVIDENCE";
  reasons: readonly string[];
  metrics: Readonly<Record<string, string | number | null>>;
  warnings: readonly string[];
}

export interface StrategyOutcome {
  strategyId: string;
  strategyVersion: string;
  userId: string;
  dataset: OutcomeDataset;
  assetId: string;
  session: string | null;
  regime: string | null;
  evaluationTime: string;
  nowMs: number;
  signalOnly: boolean;
  net: bigint | null;
  gross: bigint | null;
  holdingBars: number | null;
  correlationId: string | null;
  intentId: string | null;
  executionId: string | null;
  experimentId: string | null;
  dataQualityFailure: boolean;
  conflict: boolean;
}
