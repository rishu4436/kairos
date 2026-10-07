import type {
  CompanyNewsItem,
  CorrelatedMarketEvent,
  EarningsEvent,
  EarningsWindow,
  EventProviderHealth,
  EventRiskContext,
  EventTradingPolicy,
} from "@/events/model";

/** Availability of one context slice. Missing data stays missing. It is not zero. */
export const AVAILABILITY = ["AVAILABLE", "UNAVAILABLE", "STALE", "INSUFFICIENT"] as const;
export type Availability = (typeof AVAILABILITY)[number];

/** Age class for a source. UNKNOWN means the source time was not supplied. */
export const CONTEXT_FRESHNESS = ["FRESH", "AGING", "STALE", "UNKNOWN"] as const;
export type ContextFreshnessState = (typeof CONTEXT_FRESHNESS)[number];

/** Overall decision-context quality. One stale optional source does not block the rest. */
export const CONTEXT_QUALITY = ["GOOD", "DEGRADED", "BLOCKED"] as const;
export type ContextQuality = (typeof CONTEXT_QUALITY)[number];

export const OPPORTUNITY_STATES = [
  "NONE",
  "WATCH",
  "EMERGING",
  "QUALIFIED",
  "BLOCKED",
  "EXPIRED",
  "MONITORING",
  "RISK_REDUCTION",
  "EXIT_REQUIRED",
] as const;
export type OpportunityState = (typeof OPPORTUNITY_STATES)[number];

export const POSITION_STATES = ["NO_POSITION", "OPEN", "ADDING", "REDUCING", "CLOSING", "CLOSED", "BLOCKED"] as const;
export type PositionState = (typeof POSITION_STATES)[number];

export const EVENT_ORIGINS = ["REAL", "MOCK", "UNAVAILABLE"] as const;
export type EventOrigin = (typeof EVENT_ORIGINS)[number];

export interface Provenance {
  source: string | null;
  observedAt: string | null;
  effectiveAt: string | null;
}

export interface ContextSlice<T> {
  status: Availability;
  freshness: ContextFreshnessState;
  provenance: Provenance;
  /** Null when the slice is not usable. Never a fabricated zero. */
  value: T | null;
  reason: string | null;
}

export interface AssetIdentity {
  /** Underlying equity ticker. This is not a token contract. */
  underlyingTicker: string;
  underlyingName: string;
  /** One tokenized representation. A ticker may have several. */
  representationId: string;
  tokenSymbol: string;
  chainId: string | null;
  chainLabel: string;
  contractAddress: string | null;
}

export interface MarketSliceValue {
  price: string;
  session: string;
  sessionLabel: string;
  rawMarketStatus: string | null;
  fidelity: "live" | "paper";
}

export interface ReferenceSliceValue {
  referencePrice: string;
  deviationPct: number | null;
}

export interface HistorySliceValue {
  points: number;
  latestTimestampMs: number | null;
  latestClose: string | null;
}

export interface FeatureReading {
  id: string;
  value: string | null;
  sufficient: boolean;
}

export interface FeatureSliceValue {
  features: readonly FeatureReading[];
}

export interface RegimeSliceValue {
  regime: string;
  detail: string | null;
  sufficient: boolean;
}

export interface SessionSliceValue {
  session: string;
  label: string;
}

export interface DataQualitySliceValue {
  status: string;
  historyPoints: number;
  latestAgeMs: number | null;
  referenceAgeMs: number | null;
  missingFields: readonly string[];
}

export interface StrategySignalReading {
  strategyId: string;
  strategyName: string;
  version: string;
  action: string;
  evaluation: string;
  /** Null when the strategy did not produce a confidence. */
  confidence: number | null;
  timestamp: string;
  validUntil: string;
  source: string;
}

export interface StrategySignalSliceValue {
  signals: readonly StrategySignalReading[];
}

export interface StrategyHealthReading {
  strategyId: string;
  strategyVersion: string;
  status: string;
  sample: string;
  sampleSize: number;
  /** Null when no expectancy was measured. */
  expectancy: string | null;
  source: string;
}

export interface StrategyHealthSliceValue {
  reports: readonly StrategyHealthReading[];
}

export interface StrategyPerformanceReading {
  strategyId: string;
  dataset: string;
  netPnL: string;
  tradeCount: number;
}

export interface StrategyPerformanceSliceValue {
  records: readonly StrategyPerformanceReading[];
}

export interface ExternalSignalReading {
  id: string;
  provider: string;
  contract: string | null;
  chainId: string | null;
  direction: "BUY" | "SELL" | null;
  freshness: string;
  /** Age in milliseconds when the provider timestamp was present. */
  signalAgeMs: number | null;
  source: string | null;
  relevance: "MAPPED" | "MISMATCH" | "UNRELATED";
  observedAt: string | null;
}

export interface ExternalSignalSliceValue {
  signals: readonly ExternalSignalReading[];
}

export interface SecuritySliceValue {
  gate: "NOT_EVALUATED" | "UNAVAILABLE" | "ELIGIBLE" | "BLOCK";
  /** Display label. PASS is ELIGIBLE. It is not a score. */
  label: "PASS" | "BLOCK" | "UNKNOWN" | "UNAVAILABLE";
  riskLevel: number | null;
  riskLevelEnum: string | null;
  chainId: string | null;
  contractAddress: string | null;
}

export interface SecurityEventReading {
  eventType: string | null;
  status: string | null;
  effectiveTime: string | null;
  source: string;
  /** Null when the stored event did not name a representation. */
  assetId: string | null;
}

export interface SecurityEventSliceValue {
  events: readonly SecurityEventReading[];
}

export interface ResearchThesisReading {
  thesisId: string;
  title: string;
  status: string;
  source: string;
}

export interface ResearchCandidateReading {
  candidateId: string;
  status: string;
}

export interface ResearchSliceValue {
  theses: readonly ResearchThesisReading[];
  candidates: readonly ResearchCandidateReading[];
}

export const MARKET_EVENT_TYPES = [
  "EARNINGS",
  "DIVIDEND",
  "STOCK_SPLIT",
  "MERGER",
  "ACQUISITION",
  "SPINOFF",
  "MAINTENANCE",
  "MARKET_STATUS_CHANGE",
  "TRADING_RESTRICTION",
  "PRICE_DISLOCATION",
  "VOLATILITY_EVENT",
  "OTHER",
] as const;
export type MarketEventType = (typeof MARKET_EVENT_TYPES)[number];

export interface EventSemantics {
  /** What the provider reported. This is not an interpretation. */
  detected: string;
  /** A bounded label. Null when the payload does not support one. */
  interpreted: string | null;
  /** The fusion engine does not write a hypothesis. */
  hypothesis: null;
}

export interface MarketEvent {
  eventId: string;
  assetId: string;
  type: MarketEventType;
  /** Provider status string, unchanged. */
  status: string;
  source: string;
  observedAt: string;
  effectiveAt: string;
  expiresAt: string;
  /** Null when the provider did not supply a confidence. */
  confidence: number | null;
  severity: "INFO" | "RESTRICTION";
  /** Provider reason, unchanged. Null when the payload had none. */
  reason: string | null;
  details: string;
  semantics: EventSemantics;
  freshness: ContextFreshnessState;
  origin: EventOrigin;
  active: boolean;
}

export interface EventSliceValue {
  providerAnswered: boolean;
  events: readonly MarketEvent[];
}

/** Compact record of why the position was opened. Not a second market payload. */
export interface EntryContextSnapshot {
  entryContextId: string;
  entryCycleId: string;
  entryStrategySignal: {
    strategyId: string;
    action: string;
    evaluation: string;
    confidence: number | null;
  };
  entryRegime: string | null;
  entrySession: string | null;
  entryPrice: string;
  entryStrategyHealth: { status: string; sample: string; sampleSize: number } | null;
  /** Null when external evidence was unavailable at entry. An empty list means the provider answered with nothing mapped. */
  entryExternalEvidence: { mappedDirections: readonly ("BUY" | "SELL")[]; freshness: string } | null;
  /** Null when the event provider did not answer at entry. */
  entryEventState: { activeTypes: readonly string[]; restriction: boolean } | null;
  entryTimestamp: string;
  /** Feature readings the position policy compares. Not the full feature set. */
  entryFeatures: { trend: string | null; distanceFromMeanBps: number | null };
}

/** Limits copied onto the context so the position manager does not read a policy store. */
export interface PositionRiskSnapshot {
  maxPositionNotional: string | null;
  maxAllocationBps: number | null;
  equity: string | null;
  invested: string | null;
  /** True only when today's realized loss has reached the stored policy. Null when no policy was supplied. */
  dailyLossReached: boolean | null;
  minimumTradeNotional: string | null;
}

/** Compact cycle reading used to explain what changed. Not a second market payload. */
export interface PositionCycleSnapshot {
  cycleId: string;
  price: string | null;
  regime: string | null;
  session: string | null;
  strategyAction: string | null;
  strategyHealth: string | null;
  externalConfirmation: string | null;
  security: string | null;
  events: readonly string[];
}

/** Strategy risk limits copied onto the context. Null fields are not stops. */
export interface PositionManagementPolicy {
  maxPositionDrawdownBps: number | null;
  maxHoldingBars: number | null;
  maxHoldingMinutes: number | null;
  profitProtectionBps: number | null;
  trailingExitBps: number | null;
}

export interface PositionSliceValue {
  state: PositionState;
  quantity: string | null;
  averageEntry: string | null;
  currentMark: string | null;
  unrealizedPnL: string | null;
  notional: string | null;
  originStrategy: string | null;
  strategyVersion: string | null;
  openedAt: string | null;
  representationId: string | null;
  /** Ledger position id. Null when nothing is open. */
  positionId: string | null;
  /** Opening paper correlation. Null when the position has no meta. */
  correlationId: string | null;
  addCount: number;
  lastAddAt: string | null;
  /** Reduce reasons already applied. Exposure is recomputed and is not sticky. */
  appliedReductions: readonly string[];
  entry: EntryContextSnapshot | null;
  risk: PositionRiskSnapshot | null;
  lastDecision: "HOLD" | "ADD" | "REDUCE" | "EXIT" | "BLOCKED" | null;
  lastDecisionAt: string | null;
  reduceCount: number;
  lastReduceAt: string | null;
  thesisState: "VALID" | "STRENGTHENED" | "WEAKENED" | "INVALIDATED" | "UNKNOWN" | null;
  entryContextId: string | null;
  /** Highest observed mark. Trailing uses it only when a threshold is configured. */
  highestMark: string | null;
  previousSnapshot: PositionCycleSnapshot | null;
  alternateStrategyId: string | null;
  exitClass: "THESIS" | "RISK" | null;
  managementPolicy: PositionManagementPolicy | null;
}

export const BLANK_POSITION_MEMORY = {
  lastDecision: null,
  lastDecisionAt: null,
  reduceCount: 0,
  lastReduceAt: null,
  thesisState: null,
  entryContextId: null,
  highestMark: null,
  previousSnapshot: null,
  alternateStrategyId: null,
  exitClass: null,
  managementPolicy: null,
} as const;

export interface ContextFreshness {
  market: ContextFreshnessState;
  reference: ContextFreshnessState;
  history: ContextFreshnessState;
  externalSignals: ContextFreshnessState;
  security: ContextFreshnessState;
  events: ContextFreshnessState;
  position: ContextFreshnessState;
}

export interface SourceTimestamps {
  market: string | null;
  reference: string | null;
  history: string | null;
  externalSignals: string | null;
  security: string | null;
  events: string | null;
  position: string | null;
}

export interface ContextConflict {
  code:
    | "REFERENCE_TIMESTAMP_DIVERGENCE"
    | "EXTERNAL_CONTRACT_MISMATCH"
    | "SECURITY_UNAVAILABLE"
    | "POSITION_SCOPE_MISMATCH"
    | "POSITION_REPRESENTATION_MISMATCH"
    | "EVENT_EXPIRED"
    | "HISTORY_TIMESTAMP_GAP"
    | "CHAIN_MISMATCH"
    | "ASSET_MISMATCH"
    | "USER_MISMATCH"
    | "TIMESTAMP_INCONSISTENT"
    | "WATCHLIST_EXCLUDED";
  severity: "BLOCKING" | "DEGRADE" | "NOTE";
  message: string;
}

export interface OpportunityAssessment {
  state: OpportunityState;
  reason: string;
}

export interface SummaryLine {
  label: string;
  value: string;
}

export interface MarketTransition {
  kind: "SESSION" | "REFERENCE_FRESHNESS" | "REGIME" | "STRATEGY_SELECTION" | "OPPORTUNITY";
  from: string;
  to: string;
  at: string;
  label: string;
}

export interface TimelineEntry {
  id: string;
  at: string;
  clock: string;
  label: string;
  detail: string;
  origin: EventOrigin;
  /** Provider or KAIROS. Interpretation is not stored in a provider row. */
  source?: string;
}

export interface NewsContextValue {
  providerConnected: boolean;
  /** Null when the provider failed. An empty list means the provider answered and nothing current remains. */
  items: readonly CompanyNewsItem[] | null;
  historicalCount: number;
  health: EventProviderHealth;
  cachedAt: string | null;
}

export interface EarningsContextValue {
  event: EarningsEvent | null;
  window: EarningsWindow;
  policy: EventTradingPolicy;
  eventRisk: EventRiskContext;
  correlations: readonly CorrelatedMarketEvent[];
  health: EventProviderHealth;
  cachedAt: string | null;
}

export interface ContextValidation {
  ok: boolean;
  /** False when arbitration must not see this context. */
  admitsArbitration: boolean;
  reasons: readonly string[];
}

/**
 * Canonical decision context for one user, one tokenized representation, and one cycle.
 * Serializable. It contains no secrets and no signing material.
 */
export interface KAIROSContext {
  contextId: string;
  cycleId: string;
  userId: string;
  agentId: string;
  assetId: string;
  /** Cycle clock. Every slice is aligned to this observation. */
  timestamp: string;
  snapshotTimestamp: string;
  sourceTimestamps: SourceTimestamps;
  identity: AssetIdentity;
  watchlist: readonly string[];
  market: ContextSlice<MarketSliceValue>;
  reference: ContextSlice<ReferenceSliceValue>;
  history: ContextSlice<HistorySliceValue>;
  features: ContextSlice<FeatureSliceValue>;
  regime: ContextSlice<RegimeSliceValue>;
  session: ContextSlice<SessionSliceValue>;
  dataQuality: ContextSlice<DataQualitySliceValue>;
  strategySignals: ContextSlice<StrategySignalSliceValue>;
  strategyHealth: ContextSlice<StrategyHealthSliceValue>;
  strategyPerformance: ContextSlice<StrategyPerformanceSliceValue>;
  externalSignals: ContextSlice<ExternalSignalSliceValue>;
  tokenSecurity: ContextSlice<SecuritySliceValue>;
  securityEvents: ContextSlice<SecurityEventSliceValue>;
  researchContext: ContextSlice<ResearchSliceValue>;
  researchCandidates: ContextSlice<{ candidates: readonly ResearchCandidateReading[] }>;
  positionContext: ContextSlice<PositionSliceValue>;
  eventContext: ContextSlice<EventSliceValue>;
  /** Missing news is not "no news". A failure stays UNAVAILABLE. */
  newsContext: ContextSlice<NewsContextValue>;
  /** Underlying earnings. A tokenized-security restriction does not fill this slice. */
  earningsContext: ContextSlice<EarningsContextValue>;
  freshness: ContextFreshness;
  quality: ContextQuality;
  conflicts: readonly ContextConflict[];
  opportunity: OpportunityAssessment;
  summaryLines: readonly SummaryLine[];
  /** Human-readable summary built only from the structured fields above. */
  summaryText: string;
  transitions: readonly MarketTransition[];
  timeline: readonly TimelineEntry[];
  validation: ContextValidation;
  /** Context construction does not sign or read a wallet key. */
  walletAccess: false;
  /** Events, external signals, and this context do not create orders. */
  createsOrders: false;
  /**
   * NONE when a read was stored.
   * SOURCE_ERROR and SOURCE_UNAVAILABLE are provider states, not evidence of no signal.
   */
  externalAbsence: "NONE" | "SOURCE_ERROR" | "SOURCE_UNAVAILABLE";
}
