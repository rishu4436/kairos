import type { KAIROSContext } from "@/context/types";
import type { PositionDecision, ThesisInvalidation } from "@/position/types";

export type { PositionDecision, PositionThesisState, ThesisInvalidation } from "@/position/types";
export { DeterministicPositionManager, deterministicPositionManager } from "@/position/manager";

/**
 * Position decisions are not executions.
 * The paper cycle may turn ADD, REDUCE, or EXIT into an intent after risk.
 * The model cannot call these methods to move a position.
 */
export interface PositionManager {
  evaluatePosition(context: KAIROSContext): PositionDecision;
  generateExitIntent(context: KAIROSContext): PositionDecision;
  evaluateThesisInvalidation(context: KAIROSContext): ThesisInvalidation;
}

/** The deterministic manager is implemented. Live position execution stays closed. */
export const POSITION_MANAGER_IMPLEMENTED = true;
