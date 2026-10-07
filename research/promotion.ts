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
