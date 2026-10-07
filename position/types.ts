import type { PositionState } from "@/context/types";

/** Thesis comparison is deterministic. A model does not assign it. */
export const THESIS_STATES = ["VALID", "STRENGTHENED", "WEAKENED", "INVALIDATED", "UNKNOWN"] as const;
export type PositionThesisState = (typeof THESIS_STATES)[number];

export const POSITION_ACTIONS = ["HOLD", "ADD", "REDUCE", "EXIT", "BLOCKED"] as const;
export type PositionAction = (typeof POSITION_ACTIONS)[number];

/**
 * How an approved position action changes risk.
 * INCREASE_RISK uses the entry allocation, position, and daily-loss checks.
 * REDUCE_RISK is a partial reduction. Those entry checks do not apply.
 * CLOSE_RISK is a full exit. It still passes risk and cannot increase exposure.
 * NONE is not sent to the risk engine.
 */
export const RISK_EFFECTS = ["INCREASE_RISK", "REDUCE_RISK", "CLOSE_RISK", "NONE"] as const;
export type RiskEffect = (typeof RISK_EFFECTS)[number];

export const EXIT_CLASSES = ["THESIS", "RISK"] as const;
export type ExitClass = (typeof EXIT_CLASSES)[number];

export const POSITION_INTENT_KINDS = ["OPEN", "ADD", "REDUCE", "EXIT"] as const;
export type PositionIntentKind = (typeof POSITION_INTENT_KINDS)[number];

/**
 * Decision order. A later action cannot override an earlier one.
 * An ADD never overrides a hard exit.
 *
 * 1. HARD_RISK_OR_DATA_BLOCK — forced exit, or a block when no mark exists
 * 2. SECURITY_OR_TRADABILITY — exit when a mark exists, otherwise block
 * 3. THESIS_INVALIDATION — strategy invalidation policy
 * 4. EXIT_SIGNAL — origin strategy exit that is not already an invalidation
 * 5. REDUCE — partial reduction under a named rule
 * 6. ADD — every add gate passed
 * 7. HOLD — default
 */
export const POSITION_DECISION_PRIORITY = [
  "HARD_RISK_OR_DATA_BLOCK",
  "SECURITY_OR_TRADABILITY",
  "THESIS_INVALIDATION",
  "EXIT_SIGNAL",
  "REDUCE",
  "ADD",
  "HOLD",
] as const;

export type PositionDecisionPriority = (typeof POSITION_DECISION_PRIORITY)[number];

export const POSITION_REASON_CODES = [
  "NO_POSITION",
  "ALREADY_CLOSED",
  "MANAGEMENT_IN_FLIGHT",
  "THESIS_VALID",
  "THESIS_UNKNOWN",
  "RISK_WITHIN_LIMIT",
  "NO_EXIT_TRIGGER",
  "CRITICAL_DATA_FAILURE",
  "ADVERSE_MOVE",
  "MAX_DRAWDOWN_BREACH",
  "POSITION_LIMIT_BREACH",
  "RISK_BREACH",
  "SECURITY_BLOCK",
  "TOKEN_NOT_TRADABLE",
  "TRADING_RESTRICTION",
  "ORIGIN_STRATEGY_REVERSED",
  "ORIGIN_STRATEGY_INVALID",
  "REGIME_INVALIDATED",
  "TREND_NO_LONGER_SUPPORTIVE",
  "REVERSION_COMPLETED",
  "EXTENSION_AGAINST_THESIS",
  "EXIT_SIGNAL",
  "EXPOSURE_TOO_LARGE",
  "ALLOCATION_ABOVE_POLICY",
  "WEAKENED_SIGNAL",
  "EVENT_UNCERTAINTY",
  "HEALTH_DEGRADED",
  "WEEKEND_ANALYTICAL",
  "NO_POSITION_POLICY",
  "ADD_SUPPORTED",
  "ADD_COOLDOWN",
  "ADD_PRICE_DOWN",
  "ADD_AT_MAX",
  "ADD_RISK_BLOCKED",
  "ADD_NOT_FRESH",
  "MARKET_DATA_STALE",
  "SECURITY_UNKNOWN",
  "THESIS_EXPIRED",
  "ALTERNATE_STRATEGY_SIGNAL",
  "EXTERNAL_CONFLICT",
  "EXTERNAL_SUPPORT",
  "MAINTENANCE",
  "TRAILING_EXIT",
] as const;

export type PositionReasonCode = (typeof POSITION_REASON_CODES)[number];

/**
 * A position decision is not an execution.
 * `executable` stays false. The paper cycle may later create an intent.
 */
export interface PositionDecision {
  decisionId: string;
  cycleId: string;
  correlationId: string;
  userId: string;
  agentId: string;
  assetId: string;
  positionId: string | null;
  originStrategyId: string | null;
  originStrategyVersion: string | null;
  action: PositionAction;
  reasonCodes: readonly PositionReasonCode[];
  /** Present only when a deterministic rule produced it. */
  strength: number | null;
  currentThesisState: PositionThesisState;
  riskState: "WITHIN_LIMIT" | "BREACH" | "UNKNOWN" | "INCREASE_BLOCKED";
  strategyState: string;
  marketState: string;
  createdAt: string;
  executable: false;
  riskEffect: RiskEffect;
  /** Lifecycle proposed by this pass. The ledger quantity changes only on a paper fill. */
  positionState: PositionState;
  /** REDUCE only. Basis points of the open quantity. Never a full close. */
  reductionBps: number | null;
  /** Set on EXIT. HOLD, ADD, REDUCE, and BLOCKED leave this null. */
  exitClass: ExitClass | null;
  /** Stronger non-origin strategy. Ownership does not move. */
  alternateStrategyId: string | null;
}

export interface ThesisInvalidation {
  invalidated: boolean;
  thesisState: PositionThesisState;
  reasonCodes: readonly PositionReasonCode[];
}
