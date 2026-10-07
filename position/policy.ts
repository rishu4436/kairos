/**
 * Position policy version 1.0.
 * These numbers are the reduction and add rules. They are not chosen per trade.
 * The position manager does not invent a percentage at decision time.
 */
export const POSITION_POLICY_VERSION = "1.0";

/** Largest partial reduction. A full close is EXIT, not REDUCE. */
export const MAX_REDUCE_BPS = 5000;

/** Notional above this multiple of the position cap is a hard exit, not a trim. */
export const HARD_POSITION_MULTIPLE = 2;

/**
 * Named reduction sizes, in basis points of current quantity.
 * The manager applies the largest applicable size, capped by MAX_REDUCE_BPS.
 */
export const REDUCTION_BPS = {
  WEAKENED_SIGNAL: 2500,
  EVENT_UNCERTAINTY: 2500,
  ALLOCATION_ABOVE_POLICY: 2500,
  HEALTH_DEGRADED: 5000,
} as const;

/** Confidence must rise by at least this amount to count as a fresh add. */
export const ADD_CONFIDENCE_DELTA = 0.05;

/** A confidence drop of at least this amount weakens the thesis without invalidating it. */
export const WEAKEN_CONFIDENCE_DELTA = 0.1;

export interface PositionAddPolicy {
  version: typeof POSITION_POLICY_VERSION;
  /** Opening fill is not an add. */
  maxAdds: number;
  minIntervalMs: number;
  /** Hard cap on position notional, decimal string. The user cap can be tighter. */
  maxTotalNotional: string;
  /** One add cannot exceed this notional. Sizing can be tighter. */
  maxIncrementalNotional: string;
}

export const DEFAULT_ADD_POLICY: PositionAddPolicy = {
  version: POSITION_POLICY_VERSION,
  maxAdds: 2,
  minIntervalMs: 60 * 60 * 1000,
  maxTotalNotional: "1500",
  maxIncrementalNotional: "500",
};

/**
 * Optional position risk limits. A null field is not a stop.
 * The manager does not invent a number when the field is null.
 */
export interface PositionRiskPolicy {
  maxPositionDrawdownBps: number | null;
  maxHoldingBars: number | null;
  maxHoldingMinutes: number | null;
  profitProtectionBps: number | null;
  trailingExitBps: number | null;
}

export const UNCONFIGURED_POSITION_RISK: PositionRiskPolicy = {
  maxPositionDrawdownBps: null,
  maxHoldingBars: null,
  maxHoldingMinutes: null,
  profitProtectionBps: null,
  trailingExitBps: null,
};

export interface StrategyPositionPolicy {
  strategyId: string;
  /** Weekend is analytical. It does not open or manage a live position. */
  managesPositions: boolean;
  /** Long adverse move, in basis points, that is a configured stop. Null means no stop of this kind. */
  adverseMoveBps: number | null;
  /** Extra distance, in basis points, past the entry distance that invalidates a reversion. */
  extensionBps: number | null;
  risk: PositionRiskPolicy;
}

export const STRATEGY_POSITION_POLICIES: readonly StrategyPositionPolicy[] = [
  {
    strategyId: "momentum",
    managesPositions: true,
    adverseMoveBps: 150,
    extensionBps: null,
    risk: { ...UNCONFIGURED_POSITION_RISK, maxPositionDrawdownBps: 150 },
  },
  {
    strategyId: "mean-reversion",
    managesPositions: true,
    adverseMoveBps: null,
    extensionBps: 120,
    risk: UNCONFIGURED_POSITION_RISK,
  },
  {
    strategyId: "weekend",
    managesPositions: false,
    adverseMoveBps: null,
    extensionBps: null,
    risk: UNCONFIGURED_POSITION_RISK,
  },
];

export function positionPolicyFor(strategyId: string | null): StrategyPositionPolicy | null {
  if (!strategyId) {
    return null;
  }
  return STRATEGY_POSITION_POLICIES.find((policy) => policy.strategyId === strategyId) ?? null;
}
