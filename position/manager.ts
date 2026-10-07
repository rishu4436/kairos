import type { KAIROSContext } from "@/context/types";
import { decidePosition, evaluateThesisInvalidation } from "@/position/decide";
import type { PositionDecision, ThesisInvalidation } from "@/position/types";

/**
 * Paper position manager.
 * Input is the canonical context. Output is a decision, not an execution.
 * This module does not fetch market data, Binance skills, Qwen, or a wallet.
 */
export class DeterministicPositionManager {
  evaluatePosition(context: KAIROSContext): PositionDecision {
    return decidePosition(context);
  }

  /**
   * Reports an exit when the position decision is already an exit or a hard block.
   * It does not create a trade intent, a signature, or a broadcast.
   */
  generateExitIntent(context: KAIROSContext): PositionDecision {
    const decision = this.evaluatePosition(context);
    if (decision.action === "EXIT" || decision.action === "BLOCKED") {
      return decision;
    }
    return {
      ...decision,
      decisionId: `posdec:${context.userId}:${context.assetId}:${context.cycleId}:HOLD`,
      action: "HOLD",
      reasonCodes: ["NO_EXIT_TRIGGER"],
      riskEffect: "NONE",
      positionState: decision.positionState === "NO_POSITION" ? "NO_POSITION" : "OPEN",
      reductionBps: null,
      executable: false,
      exitClass: null,
      alternateStrategyId: decision.alternateStrategyId,
    };
  }

  evaluateThesisInvalidation(context: KAIROSContext): ThesisInvalidation {
    return evaluateThesisInvalidation(context);
  }
}

export const deterministicPositionManager = new DeterministicPositionManager();
