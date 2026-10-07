import type { ArbitrationContext, ArbitrationDecision, StrategyEvaluation } from "@/domain/arbitration";
import { arbitrateAsset } from "@/arbitration/arbitrate";
import { arbitrationMemory, type ArbitrationMemory } from "@/arbitration/memory";

/**
 * Reads the prior selection, runs the pure arbitrator, and stores a selection.
 * It does not call a market API, a wallet, a risk policy, or a model.
 */
export class StrategyArbitrator {
  constructor(private readonly memory: ArbitrationMemory = arbitrationMemory) {}

  arbitrate(context: ArbitrationContext, evaluations: readonly StrategyEvaluation[]): ArbitrationDecision {
    const prior = context.priorSelection ?? this.memory.read(context.userId, context.asset.id);
    const decision = arbitrateAsset({ ...context, priorSelection: prior }, evaluations);
    this.remember(decision);
    return decision;
  }

  private remember(decision: ArbitrationDecision): void {
    if (decision.cooldownHeld) {
      return;
    }
    if (
      (decision.decision !== "SELECT_STRATEGY" && decision.decision !== "MULTI_STRATEGY_CONFIRMATION") ||
      decision.selectedStrategy === null ||
      decision.selectedAction === null ||
      decision.score === null
    ) {
      return;
    }
    const existing = this.memory.read(decision.asset.userId, decision.asset.id);
    const same = existing?.strategyId === decision.selectedStrategy;
    this.memory.write({
      userId: decision.asset.userId,
      assetId: decision.asset.id,
      strategyId: decision.selectedStrategy,
      action: decision.selectedAction,
      score: decision.score,
      selectedAtMs: same && existing ? existing.selectedAtMs : Date.parse(decision.timestamp),
    });
  }
}
