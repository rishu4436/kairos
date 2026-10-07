import type { HealthState, SampleState } from "@/lifecycle/types";

export const SAMPLE_THRESHOLDS = {
  early: 10,
  developing: 30,
  established: 100,
} as const;

/** 1500.00 in the same 6-decimal units as net PnL. */
export const DRAWDOWN_BREACH = 1_500_000_000n;
export const CONSECUTIVE_LOSS_WARNING = 4;
export const CONSECUTIVE_LOSS_UNSTABLE = 8;
export const PROMOTION_MIN_TRADES = 30;
export const PROMOTION_MIN_OUT_OF_SAMPLE = 8;
export const PROMOTION_MAX_DRAWDOWN = 1_500_000_000n;

/** Scales only the existing 0.06 strategy-health weight. It does not replace signal strength. */
export const HISTORICAL_HEALTH_FACTOR: Record<HealthState | SampleState, number> = {
  UNKNOWN: 0.5,
  INSUFFICIENT_DATA: 0.5,
  INSUFFICIENT: 0.5,
  EARLY: 0.6,
  DEVELOPING: 0.8,
  ESTABLISHED: 1,
  HEALTHY: 1,
  DEGRADED: 0.45,
  UNSTABLE: 0.25,
  RETIRED: 0,
};

export function sampleState(tradeCount: number): SampleState {
  if (tradeCount >= SAMPLE_THRESHOLDS.established) {
    return "ESTABLISHED";
  }
  if (tradeCount >= SAMPLE_THRESHOLDS.developing) {
    return "DEVELOPING";
  }
  if (tradeCount >= SAMPLE_THRESHOLDS.early) {
    return "EARLY";
  }
  return "INSUFFICIENT";
}

export function historicalFactor(status: HealthState, sample: SampleState): number {
  if (status === "RETIRED" || status === "UNSTABLE" || status === "DEGRADED") {
    return HISTORICAL_HEALTH_FACTOR[status];
  }
  if (status === "UNKNOWN" || status === "INSUFFICIENT_DATA" || sample === "INSUFFICIENT") {
    return HISTORICAL_HEALTH_FACTOR.INSUFFICIENT;
  }
  if (sample === "EARLY") {
    return HISTORICAL_HEALTH_FACTOR.EARLY;
  }
  if (sample === "DEVELOPING") {
    return HISTORICAL_HEALTH_FACTOR.DEVELOPING;
  }
  return status === "HEALTHY" ? HISTORICAL_HEALTH_FACTOR.HEALTHY : HISTORICAL_HEALTH_FACTOR.DEVELOPING;
}
