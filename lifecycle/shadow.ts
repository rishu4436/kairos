import { evaluateDeclarativeStrategy } from "@/lifecycle/evaluate";
import { markCandidateEvaluated } from "@/lifecycle/candidates";
import { strategyMemory } from "@/lifecycle/store";
import type { StrategyCandidate } from "@/lifecycle/types";
import type { StrategyContext } from "@/strategies/context";

/** Shadow evaluation records a hypothetical outcome and does not create a trade intent. */
export function evaluateShadow(candidate: StrategyCandidate, context: StrategyContext, nowMs: number) {
  if (candidate.status !== "SHADOW") {
    throw new Error("SHADOW_REQUIRED");
  }
  const signal = evaluateDeclarativeStrategy(candidate, context, nowMs);
  markCandidateEvaluated(candidate.userId, candidate.candidateId, signal.timestamp);
  strategyMemory().record({
    strategyId: candidate.strategyId,
    strategyVersion: candidate.strategyVersion,
    userId: candidate.userId,
    dataset: "SHADOW",
    assetId: context.representationId,
    session: context.session,
    regime: context.regime.regime,
    evaluationTime: signal.timestamp,
    nowMs,
    signalOnly: true,
    net: null,
    gross: null,
    holdingBars: null,
    correlationId: null,
    intentId: null,
    executionId: null,
    experimentId: null,
    dataQualityFailure: false,
    conflict: false,
  });
  return { signal, tradeIntent: null as null, executable: false as const };
}
