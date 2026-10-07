import type { AgentId, UserId } from "@/domain/ids";
import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { DslCondition, ProposalAction } from "@/research/dsl";
import type { ProviderErrorCategory } from "@/research/provider";

export const THESIS_PROMPT_VERSION = "1.1";
export const STRATEGY_PROPOSAL_PROMPT_VERSION = "1.1";

export const THESIS_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "READY_FOR_EXPERIMENT",
  "TESTING",
  "COMPLETED",
  "REJECTED",
  "INVALID",
  "MODEL_ERROR",
] as const;

export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const PROPOSAL_STATUSES = [
  "LLM_GENERATED",
  "VALIDATING",
  "READY_FOR_EXPERIMENT",
  "PAPER_TESTING",
  "RESULT",
  "CANDIDATE",
  "REJECTED",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const EXPERIMENT_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "INVALID"] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export type EvidenceKind =
  | "OBSERVED_FACT"
  | "OBSERVED_EVENT"
  | "OBSERVED_NEWS"
  | "OBSERVED_EARNINGS"
  | "OBSERVED_EXTERNAL_SIGNAL"
  | "OBSERVED_HISTORICAL_RESULT"
  | "MODEL_INFERENCE"
  | "HYPOTHESIS";

export interface EvidenceItem {
  kind: EvidenceKind;
  statement: string;
  /** Feature or observation id for an observed fact. Null for inference and hypothesis. */
  source: string | null;
}

export interface FalsifiableHypothesis {
  conditions: readonly string[];
  session: MarketSessionState | "ANY";
  observationWindowBars: number;
  testWindowBars: number;
  expectedOutcome: string;
  invalidation: string;
}

export type ResearchSourceType = "MOCK" | "LLM";

export type MarketDataSource = "LIVE_BINANCE_HISTORY" | "MOCK_FIXTURE";

export interface ResearchProvenance {
  /** Optional for compatibility with previously recorded research. */
  contextId?: string | null;
  sourceType: ResearchSourceType;
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  contextTimestamp: string;
  contextDataVersion: string;
  /** False when the mock provider produced the record. */
  configuredModel: boolean;
  requestId: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  status: "SUCCESS" | "ERROR" | "TIMEOUT";
  errorCategory: ProviderErrorCategory | null;
}

export interface ResearchThesis {
  thesisId: string;
  userId: UserId;
  agentId: AgentId;
  assetId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  summary: string;
  hypothesis: FalsifiableHypothesis;
  observations: readonly EvidenceItem[];
  assumptions: readonly string[];
  supportingEvidence: readonly EvidenceItem[];
  contradictingEvidence: readonly EvidenceItem[];
  requiredData: readonly string[];
  invalidationConditions: readonly string[];
  riskConsiderations: readonly string[];
  confidence: number;
  status: ThesisStatus;
  version: string;
  provenance: ResearchProvenance;
  rejectionReasons: readonly string[];
}

export interface StrategyProposal {
  proposalId: string;
  thesisId: string;
  userId: UserId;
  agentId: AgentId;
  assetScope: readonly string[];
  sessionScope: readonly (MarketSessionState | "ANY")[];
  regimeScope: readonly (MarketRegime | "ANY")[];
  features: readonly string[];
  entryConditions: readonly DslCondition[];
  exitConditions: readonly DslCondition[];
  holdingPeriod: number;
  action: ProposalAction;
  positionSizingHint: string;
  invalidationConditions: readonly string[];
  parameterSet: Readonly<Record<string, string | number>>;
  version: string;
  createdAt: string;
  status: ProposalStatus;
  provenance: ResearchProvenance;
  rejectionReasons: readonly string[];
}

export interface ExperimentWindow {
  name: "RESEARCH" | "VALIDATION" | "OUT_OF_SAMPLE";
  fromIndex: number;
  toIndex: number;
  bars: number;
  trades: number;
  netPnl: string;
  used: boolean;
}

export interface ExperimentTradeRecord {
  asset: string;
  entryIndex: number;
  exitIndex: number;
  entryPrice: string;
  exitPrice: string;
  grossPnl: string;
  fees: string;
  netPnl: string;
  holdingBars: number;
}

export interface ExperimentMetrics {
  numberOfTrades: number;
  winRate: string | null;
  grossPnl: string;
  netPnl: string;
  averageTradeReturnBps: string | null;
  maxDrawdownBps: string | null;
  profitFactor: string | null;
  averageHoldingPeriodBars: string | null;
  largestWin: string | null;
  largestLoss: string | null;
  dataPoints: number;
  researchWindow: ExperimentWindow;
  validationWindow: ExperimentWindow;
  outOfSampleWindow: ExperimentWindow;
  /** False when the out-of-sample slice is too short to support that claim. */
  outOfSampleClaim: boolean;
  baselineName: "BUY_AND_HOLD";
  baselineNetPnl: string;
  strategyNetPnl: string;
  differenceNetPnl: string;
  warnings: readonly string[];
  trades: readonly ExperimentTradeRecord[];
}

export interface StrategyExperiment {
  experimentId: string;
  proposalId: string;
  thesisId: string;
  userId: UserId;
  agentId: AgentId;
  assetScope: readonly string[];
  startTime: string;
  endTime: string;
  initialCapital: string;
  executionPolicy: string;
  dataset: string;
  dataSource: MarketDataSource;
  thesisSource: ResearchSourceType;
  result: ExperimentMetrics | null;
  reason: string | null;
  status: ExperimentStatus;
  createdAt: string;
  /** External signals recorded beside the experiment. They are not candles. */
  externalContext?: {
    signalIds: readonly string[];
    usedAsCandles: false;
    fabricatedHistory: false;
    note: string;
  };
}

export interface ResearchObservedEvent {
  eventId: string;
  type: string;
  status: string;
  reason: string | null;
  semantics: "OBSERVED_EVENT";
  detected: string;
  interpreted: string | null;
  /** The context does not invent a hypothesis. */
  hypothesis: null;
}

export interface ResearchEventContext {
  status: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "INSUFFICIENT";
  /** False means the provider did not answer. An empty events list is not "no events" in that case. */
  providerAnswered: boolean;
  events: readonly ResearchObservedEvent[];
}

export interface ResearchNewsItem {
  newsId: string;
  headline: string;
  publisher: string | null;
  publishedAt: string;
  freshness: string;
}

export interface ResearchNewsContext {
  status: "UNAVAILABLE" | "AVAILABLE" | "STALE" | "INSUFFICIENT";
  providerConnected: boolean;
  reason: string;
  /** Null when the provider did not answer. This is not an empty headline list. */
  items: readonly ResearchNewsItem[] | null;
}

export interface ResearchEarningsContext {
  status: "UNAVAILABLE" | "AVAILABLE" | "STALE" | "INSUFFICIENT";
  reason: string;
  eventId: string | null;
  expectedEarningsDate: string | null;
  reportTime: string | null;
  state: string | null;
  window: string | null;
  actualEps: string | null;
  estimatedEps: string | null;
  revenue: string | null;
  estimatedRevenue: string | null;
}

/** Missing news and earnings stay unavailable. They are not rewritten as "no news". */
export function unavailableResearchBoundaries(): {
  eventContext: ResearchEventContext;
  newsContext: ResearchNewsContext;
  earningsContext: ResearchEarningsContext;
} {
  return {
    eventContext: { status: "UNAVAILABLE", providerAnswered: false, events: [] },
    newsContext: {
      status: "UNAVAILABLE",
      providerConnected: false,
      reason: "NOT_CONFIGURED",
      items: null,
    },
    earningsContext: {
      status: "UNAVAILABLE",
      reason: "NOT_CONFIGURED",
      eventId: null,
      expectedEarningsDate: null,
      reportTime: null,
      state: null,
      window: null,
      actualEps: null,
      estimatedEps: null,
      revenue: null,
      estimatedRevenue: null,
    },
  };
}

/** Read-only model input. Built from KAIROSContext when the observation row has one. */
export interface ResearchContext {
  userId: string;
  agentId: string;
  assetId: string;
  ticker: string;
  watchlist: readonly string[];
  observation: {
    price: string | null;
    session: string;
    regime: string;
    freshness: string | null;
  };
  features: readonly { id: string; value: string | null; bps: string | null }[];
  signals: readonly { strategyId: string; action: string }[];
  arbitration: { decision: string; action: string | null } | null;
  paperPerformance: { closedTrades: number; netPnl: string | null } | null;
  priorExperiments: readonly { experimentId: string; status: string; netPnl: string | null }[];
  /** Same context id as the observation cycle when one was fused. */
  contextId: string | null;
  eventContext: ResearchEventContext;
  newsContext: ResearchNewsContext;
  earningsContext: ResearchEarningsContext;
  /** Ledger read for this representation. Unavailable is not a flat position. */
  positionContext?: {
    status: "AVAILABLE" | "UNAVAILABLE" | "STALE" | "INSUFFICIENT";
    state: "NO_POSITION" | "OPEN" | "ADDING" | "REDUCING" | "CLOSING" | "CLOSED" | "BLOCKED" | null;
    quantity: string | null;
    averageEntry: string | null;
    currentMark: string | null;
    unrealizedPnL: string | null;
    originStrategy: string | null;
    thesisState?: string | null;
  };
  /** Deterministic position diff. Research may describe it. It is not a PositionDecision. */
  positionContextDiff?: {
    regime: { entry: string | null; previous: string | null; current: string | null };
    strategyAction: { entry: string | null; previous: string | null; current: string | null };
    externalConfirmation: { entry: string | null; previous: string | null; current: string | null };
  } | null;
  /** External skill evidence. Empty means none was supplied. It is not fabricated history. */
  externalSignals?: readonly {
    id: string;
    source: string | null;
    direction: "BUY" | "SELL" | null;
    freshness: string;
  }[];
  tokenSecurity?: {
    available: boolean;
    supported: boolean;
    riskLevel: number | null;
    riskLevelEnum: string | null;
    source: string;
  } | null;
  securityEvents?: readonly {
    id: string;
    eventType: string | null;
    status: string | null;
    source: string;
  }[];
  strategyHealth?: readonly { strategyId: string; status: string; sampleSize: number; expectancy: string | null }[];
  strategyPerformance?: readonly { strategyId: string; dataset: string; netPnL: string; tradeCount: number }[];
  candidatePerformance?: readonly { candidateId: string; status: string }[];
}
