import type { ArbitrationScore, ScoreComponents, StrategyHealth } from "@/domain/arbitration";
import type { DataQualityStatus } from "@/domain/quality";
import { SCORE_WEIGHTS } from "@/arbitration/policy";

export function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function dataQualityScore(status: DataQualityStatus): number {
  switch (status) {
    case "GOOD":
      return 1;
    case "DEGRADED":
      return 0.55;
    case "INSUFFICIENT":
    case "STALE":
      return 0;
  }
}

/** Operational health of this evaluation. This is not a profit record. */
export function healthScore(health: StrategyHealth): number {
  if (health.status !== "implemented") {
    return 0;
  }
  if (health.recentEvaluations === 0) {
    return 0.5;
  }
  if (health.dataFailures > 0) {
    return 0.25;
  }
  return clamp01(1 - (health.failedEvaluations / health.recentEvaluations) * 0.25);
}

/**
 * signalStrength = 0.7 * confidence + 0.2 * evidence coverage + 0.1 * remaining validity.
 * Evidence coverage caps at 4 lines. Validity is the fraction of the 15-minute window left.
 * The conflict penalty is stored for inspection and is not subtracted. A material
 * disagreement becomes a CONFLICT decision instead of a blended winner.
 */
export function scoreSelection(input: {
  confidence: number;
  evidenceCount: number;
  validityFraction: number;
  regimeFit: number;
  sessionFit: number;
  dataQuality: number;
  strategyHealth: number;
  uncertaintyPenalty: number;
  stalePenalty: number;
  conflictPenalty: number;
}): ArbitrationScore {
  const signalStrength = clamp01(
    input.confidence * 0.7 + (Math.min(input.evidenceCount, 4) / 4) * 0.2 + clamp01(input.validityFraction) * 0.1,
  );
  const components: ScoreComponents = {
    signalStrength: roundScore(signalStrength),
    regimeFit: roundScore(clamp01(input.regimeFit)),
    sessionFit: roundScore(clamp01(input.sessionFit)),
    dataQuality: roundScore(clamp01(input.dataQuality)),
    evidenceQuality: roundScore(clamp01(input.evidenceCount === 0 ? 0 : Math.min(1, input.evidenceCount / 3))),
    strategyHealth: roundScore(clamp01(input.strategyHealth)),
    conflictPenalty: roundScore(clamp01(input.conflictPenalty)),
    stalePenalty: roundScore(clamp01(input.stalePenalty)),
    uncertaintyPenalty: roundScore(clamp01(input.uncertaintyPenalty)),
  };
  const weighted =
    SCORE_WEIGHTS.signalStrength * components.signalStrength +
    SCORE_WEIGHTS.regimeFit * components.regimeFit +
    SCORE_WEIGHTS.sessionFit * components.sessionFit +
    SCORE_WEIGHTS.dataQuality * components.dataQuality +
    SCORE_WEIGHTS.evidenceQuality * components.evidenceQuality +
    SCORE_WEIGHTS.strategyHealth * components.strategyHealth;
  return {
    total: roundScore(clamp01(weighted - components.stalePenalty - components.uncertaintyPenalty)),
    components,
  };
}
