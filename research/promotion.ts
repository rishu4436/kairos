/**
 * Future gate for moving a research candidate into the executable registry.
 * This function does not register a strategy and does not change a proposal.
 */
export interface PromotionCriteria {
  minimumTrades: number;
  minimumValidationBars: number;
  maxDrawdownBps: number;
  requirePositiveNetExpectancy: boolean;
  rejectOnCriticalWarnings: boolean;
}

export const FUTURE_PROMOTION_CRITERIA: PromotionCriteria = {
  minimumTrades: 30,
  minimumValidationBars: 20,
  maxDrawdownBps: 1500,
  requirePositiveNetExpectancy: true,
  rejectOnCriticalWarnings: true,
};

export function promoteResearchCandidate(): { promoted: false; reason: string } {
  return {
    promoted: false,
    reason: "Promotion is not implemented. A later phase must apply deterministic acceptance criteria before a candidate can become an implemented strategy.",
  };
}

export interface ExperimentMetrics {
  trades: number;
  winRate: number;
  expectancy: number;
  maxDrawdownBps: number;
  sampleSufficient: boolean;
  validationViolations: number;
}

export interface PromotionDecision {
  status: "PROMOTION_ELIGIBLE" | "INSUFFICIENT_SAMPLE" | "UNDERPERFORMED" | "REJECTED";
  reasons: string[];
}

const MIN_TRADES = 20;
const MIN_WIN_RATE = 0.55;
const MAX_DRAWDOWN_BPS = 2500;

/** Win rate alone never promotes. A 60% result on 3 trades stays ineligible. */
export function assessPromotion(metrics: ExperimentMetrics): PromotionDecision {
  const reasons: string[] = [];
  if (metrics.validationViolations > 0) {
    return { status: "REJECTED", reasons: ["Validation violations block promotion."] };
  }
  if (!metrics.sampleSufficient || metrics.trades < MIN_TRADES) {
    return { status: "INSUFFICIENT_SAMPLE", reasons: [`Need at least ${MIN_TRADES} completed paper trades.`] };
  }
  if (metrics.winRate < MIN_WIN_RATE) {
    reasons.push("Win rate is below 55%.");
  }
  if (metrics.expectancy <= 0) {
    reasons.push("Expectancy is not positive.");
  }
  if (metrics.maxDrawdownBps > MAX_DRAWDOWN_BPS) {
    reasons.push("Drawdown exceeds 25% of the experiment book.");
  }
  if (reasons.length > 0) {
    return { status: "UNDERPERFORMED", reasons };
  }
  return { status: "PROMOTION_ELIGIBLE", reasons: ["Sample, win rate, expectancy, and drawdown passed. Strategy stays disabled until the operator enables it."] };
}

export interface PromotedStrategy {
  id: string;
  displayName: string;
  thesisId: string;
  version: string;
  enabled: boolean;
  status: "PROMOTED";
  origin: "RESEARCH-DERIVED";
}

/** Eligibility only. This does not register a strategy or grant execution authority. */
export function promoteThesis(input: { thesisId: string; title: string; metrics: ExperimentMetrics }): PromotionDecision & { persisted: false } {
  return { ...assessPromotion(input.metrics), persisted: false };
}
