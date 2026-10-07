import { listStrategyCandidates } from "@/lifecycle/candidates";
import { evaluateDeclarativeStrategy } from "@/lifecycle/evaluate";
import { evaluateShadow } from "@/lifecycle/shadow";
import type { StrategyEvaluation } from "@/domain/arbitration";
import type { StrategyContext } from "@/strategies/context";

/** PAPER_ACTIVE research strategies may join paper arbitration. Shadow stays out of that list. */
export function paperResearchEvaluations(userId: string, context: StrategyContext, nowMs: number): StrategyEvaluation[] {
  return listStrategyCandidates(userId)
    .filter((candidate) => candidate.status === "PAPER_ACTIVE")
    .map((candidate) => {
      const signal = evaluateDeclarativeStrategy(candidate, context, nowMs);
      return {
        signalStrategyId: candidate.strategyId,
        strategyName: candidate.strategyId,
        status: "research_candidate" as const,
        supportedAssets: candidate.assetScope,
        supportedSessions: candidate.sessionScope,
        minHistory: 0,
        requiresReference: false,
        action: signal.action,
        evaluation: signal.evaluation,
        confidence: signal.confidence,
        evidence: signal.evidence,
        featuresUsed: signal.featuresUsed,
        tags: ["PAPER_ACTIVE", "RESEARCH", `candidate:${candidate.candidateId}`, `thesis:${candidate.thesisId}`, `version:${candidate.strategyVersion}`],
        validUntil: signal.validUntil,
        signalTimestamp: signal.timestamp,
        signalQuality: signal.dataQuality.status,
      };
    });
}

/** Shadow reviews record a hypothetical outcome and never create an intent. */
export function reviewShadowCandidates(userId: string, context: StrategyContext, nowMs: number): readonly { candidateId: string; intentCreated: false }[] {
  return listStrategyCandidates(userId)
    .filter((candidate) => candidate.status === "SHADOW")
    .map((candidate) => {
      const reviewed = evaluateShadow(candidate, context, nowMs);
      if (reviewed.tradeIntent !== null) {
        throw new Error("SHADOW_CREATED_INTENT");
      }
      return { candidateId: candidate.candidateId, intentCreated: false as const };
    });
}
