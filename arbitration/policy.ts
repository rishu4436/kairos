import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";

/** Initial KAIROS arbitration policy. Change the tables here. Do not scatter them. */
export const ARBITRATION_POLICY_VERSION = "1.0";

export type FitName = "HIGH" | "MEDIUM" | "LOW" | "ZERO";

export const FIT_VALUE: Record<FitName, number> = {
  HIGH: 1,
  MEDIUM: 0.6,
  LOW: 0.25,
  ZERO: 0,
};

/** Weights sum to 1. The conflict penalty is recorded and does not average two opposing sides. */
export const SCORE_WEIGHTS = {
  signalStrength: 0.4,
  regimeFit: 0.18,
  sessionFit: 0.12,
  dataQuality: 0.14,
  evidenceQuality: 0.1,
  strategyHealth: 0.06,
} as const;

export const MIN_SELECTION_SCORE = 0.72;
export const MIN_SELECTION_MARGIN = 0.08;
export const MIN_CONFIRM_SCORE = 0.7;
export const CONFLICT_FLOOR = 0.55;
export const MIN_SIGNAL_STRENGTH = 0.4;
export const MIN_STRATEGY_SWITCH_DELTA = 0.08;
export const MIN_STRATEGY_HOLD_TIME_MS = 15 * 60 * 1000;
export const DECISION_TTL_MS = 15 * 60 * 1000;
export const TIMESTAMP_ALIGN_MS = 2 * 60 * 1000;
export const HIGH_VOLATILITY_PENALTY = 0.1;
export const UNKNOWN_REGIME_PENALTY = 0.05;

export const STRATEGY_MIN_HISTORY: Record<string, number> = {
  momentum: 21,
  "mean-reversion": 20,
  weekend: 0,
};

/**
 * Regime fit. Weekend is a session rule: every regime, including UNKNOWN, is MEDIUM
 * so an unknown regime does not block it and does not count as trend confirmation.
 */
export const REGIME_FIT: Record<string, Record<MarketRegime, FitName>> = {
  momentum: {
    TRENDING_UP: "HIGH",
    TRENDING_DOWN: "HIGH",
    RANGE_BOUND: "LOW",
    HIGH_VOLATILITY: "LOW",
    LOW_VOLATILITY: "LOW",
    UNKNOWN: "ZERO",
  },
  "mean-reversion": {
    RANGE_BOUND: "HIGH",
    LOW_VOLATILITY: "HIGH",
    TRENDING_UP: "MEDIUM",
    TRENDING_DOWN: "MEDIUM",
    HIGH_VOLATILITY: "LOW",
    UNKNOWN: "ZERO",
  },
  weekend: {
    TRENDING_UP: "MEDIUM",
    TRENDING_DOWN: "MEDIUM",
    RANGE_BOUND: "MEDIUM",
    HIGH_VOLATILITY: "MEDIUM",
    LOW_VOLATILITY: "MEDIUM",
    UNKNOWN: "MEDIUM",
  },
};

export const SESSION_FIT: Record<string, Record<MarketSessionState, FitName>> = {
  momentum: {
    OPEN: "HIGH",
    CLOSED: "MEDIUM",
    PRE_OPEN: "MEDIUM",
    POST_CLOSE: "MEDIUM",
    UNKNOWN: "LOW",
  },
  "mean-reversion": {
    OPEN: "HIGH",
    CLOSED: "MEDIUM",
    PRE_OPEN: "MEDIUM",
    POST_CLOSE: "MEDIUM",
    UNKNOWN: "LOW",
  },
  weekend: {
    CLOSED: "HIGH",
    PRE_OPEN: "HIGH",
    POST_CLOSE: "HIGH",
    OPEN: "ZERO",
    UNKNOWN: "ZERO",
  },
};

export function regimeFitName(strategyId: string, regime: MarketRegime): FitName {
  return REGIME_FIT[strategyId]?.[regime] ?? "ZERO";
}

export function sessionFitName(strategyId: string, session: MarketSessionState): FitName {
  return SESSION_FIT[strategyId]?.[session] ?? "ZERO";
}
