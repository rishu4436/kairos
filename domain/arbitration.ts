import type { DataQuality, DataQualityStatus } from "@/domain/quality";
import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { EvaluationStatus, SignalAction } from "@/domain/signal";
import type { FreshnessStatus } from "@/domain/freshness";
import type { StrategyStatus } from "@/domain/models";

export type ArbitrationDecisionKind =
  | "NO_OPPORTUNITY"
  | "SELECT_STRATEGY"
  | "MULTI_STRATEGY_CONFIRMATION"
  | "CONFLICT"
  | "DATA_BLOCKED"
  | "INSUFFICIENT_EVIDENCE";

export type CandidateStatus =
  | "SELECTED"
  | "ELIGIBLE"
  | "CONFIRMING"
  | "REJECTED"
  | "CONFLICTED"
  | "INSUFFICIENT_DATA"
  | "STALE"
  | "INELIGIBLE";

export interface ScoreComponents {
  signalStrength: number;
  regimeFit: number;
  sessionFit: number;
  dataQuality: number;
  evidenceQuality: number;
  strategyHealth: number;
  conflictPenalty: number;
  stalePenalty: number;
  uncertaintyPenalty: number;
}

/** Inspectable weighted score. `total` is the value selection uses. */
export interface ArbitrationScore {
  total: number;
  components: ScoreComponents;
}

export interface StrategyHealth {
  strategyId: string;
  status: StrategyStatus;
  recentEvaluations: number;
  validSignals: number;
  failedEvaluations: number;
  dataFailures: number;
}

export interface StrategyCandidate {
  strategyId: string;
  strategyName: string;
  status: StrategyStatus;
  eligible: boolean;
  candidateStatus: CandidateStatus;
  action: SignalAction;
  evaluation: EvaluationStatus;
  confidence: number;
  score: number;
  components: ScoreComponents;
  rejectionReason: string | null;
  evidence: readonly string[];
  health: StrategyHealth;
}

export interface StrategyConflict {
  leftStrategyId: string;
  rightStrategyId: string;
  leftAction: "BUY" | "SELL";
  rightAction: "BUY" | "SELL";
  leftScore: number;
  rightScore: number;
  summary: string;
}

export interface ArbitrationEvidence {
  summary: string;
  supports: readonly string[];
  penalties: readonly string[];
  rejected: readonly { strategyId: string; strategyName: string; reason: string }[];
}

export interface PriorSelection {
  userId: string;
  assetId: string;
  strategyId: string;
  action: SignalAction;
  score: number;
  selectedAtMs: number;
}

/** Freshness of an external signal. UNKNOWN means the provider timestamp was missing. */
export type ExternalSignalFreshness = "FRESH" | "AGING" | "STALE" | "EXPIRED" | "UNKNOWN";

/** NO_SIGNAL means the provider answered and mapped nothing. A failure is not NO_SIGNAL. */
export type ExternalConfirmation = "CONFIRMING_EVIDENCE" | "NO_SIGNAL" | "STALE" | "SOURCE_UNAVAILABLE" | "SOURCE_ERROR";

export type ExternalAbsence = "SOURCE_UNAVAILABLE" | "SOURCE_ERROR";

export type ExternalConflict = "CONFLICTING_EVIDENCE" | "NONE";

/** Eligibility only. This is not a confidence adjustment. */
export type SecurityGate = "NOT_EVALUATED" | "UNAVAILABLE" | "ELIGIBLE" | "BLOCK";

/** A mapped external signal the arbitrator may read. Unrelated signals stay off the asset. */
export interface ArbitrationExternalSignal {
  direction: "BUY" | "SELL" | null;
  freshness: ExternalSignalFreshness;
  source: string | null;
  mapStatus: "MAPPED" | "SIGNAL_UNRELATED";
}

export interface ArbitrationSecurityInput {
  available: boolean;
  supported: boolean;
  riskLevel: number | null;
  riskLevelEnum: string | null;
}

export const NEUTRAL_EXTERNAL_POLICY = {
  externalConfirmation: "NO_SIGNAL",
  externalConflict: "NONE",
  securityGate: "NOT_EVALUATED",
  externalFreshness: "NONE",
  historicalHealth: "NONE",
  historicalSample: "NONE",
} as const;

export interface ArbitrationContext {
  userId: string;
  asset: { id: string; ticker: string };
  timestamp: string;
  asOfMs: number;
  regime: MarketRegime;
  session: MarketSessionState;
  dataQuality: DataQuality;
  freshness: FreshnessStatus | "SAMPLE";
  pricePresent: boolean;
  referencePresent: boolean;
  historyPoints: number;
  /** Feature ids that were actually computed. Missing ids are not filled with zero. */
  featureIds: readonly string[];
  priorSelection: PriorSelection | null;
  /** Absent means no external intelligence was supplied. That is not a silent pass of a failed skill. */
  externalSignals?: readonly ArbitrationExternalSignal[];
  /** Set when the provider failed or was not stored. It is not a signal. */
  externalAbsence?: ExternalAbsence | null;
  securityAssessment?: ArbitrationSecurityInput | null;
  /**
   * Optional measured history. Absent means the existing evaluation-only health score is used.
   * Historical profitability cannot replace the current signal.
   */
  historicalHealth?: Readonly<Record<string, HistoricalHealthInput>>;
  /** Present for inspection. It does not change the score. */
  eventWindow?: string | null;
  eventContextStatus?: string;
  /** Paper mode may admit PAPER_ACTIVE research candidates. Live leaves this false. */
  paperResearchEligible?: boolean;
}

export interface HistoricalHealthInput {
  status: "UNKNOWN" | "INSUFFICIENT_DATA" | "HEALTHY" | "DEGRADED" | "UNSTABLE" | "RETIRED";
  sample: "INSUFFICIENT" | "EARLY" | "DEVELOPING" | "ESTABLISHED";
}

/** One strategy output handed to the arbitrator. Coming-soon rows may be passed and are rejected. */
export interface StrategyEvaluation {
  signalStrategyId: string;
  strategyName: string;
  status: StrategyStatus;
  supportedAssets: readonly string[];
  supportedSessions: readonly string[];
  minHistory: number;
  requiresReference: boolean;
  action: SignalAction;
  evaluation: EvaluationStatus;
  confidence: number;
  evidence: readonly string[];
  featuresUsed: readonly string[];
  tags: readonly string[];
  validUntil: string;
  signalTimestamp: string;
  signalQuality: DataQualityStatus;
}

export interface ArbitrationDecision {
  asset: { id: string; ticker: string; userId: string };
  timestamp: string;
  decision: ArbitrationDecisionKind;
  selectedStrategy: string | null;
  selectedStrategyName: string | null;
  selectedAction: SignalAction | null;
  score: number | null;
  confidence: number | null;
  candidates: readonly StrategyCandidate[];
  conflicts: readonly StrategyConflict[];
  evidence: ArbitrationEvidence;
  dataQuality: DataQualityStatus;
  marketRegime: MarketRegime;
  marketSession: MarketSessionState;
  validUntil: string;
  version: string;
  cooldownHeld: boolean;
  /** The arbitrator stops here. It does not create a trade intent. */
  loopPhase: "WAITING_FOR_RISK";
  /** External agreement. It does not change the score. */
  externalConfirmation: ExternalConfirmation;
  /** External disagreement. It does not change the score. */
  externalConflict: ExternalConflict;
  /** Token security eligibility. A block clears the selection and does not raise confidence. */
  securityGate: SecurityGate;
  /** Freshness of the external evidence the policy used. NONE when no signal was supplied. */
  externalFreshness: ExternalSignalFreshness | "NONE";
  /** Measured history for the selected strategy. NONE means it was not supplied and did not change the score. */
  historicalHealth: "UNKNOWN" | "INSUFFICIENT_DATA" | "HEALTHY" | "DEGRADED" | "UNSTABLE" | "RETIRED" | "NONE";
  historicalSample: "INSUFFICIENT" | "EARLY" | "DEVELOPING" | "ESTABLISHED" | "NONE";
}
