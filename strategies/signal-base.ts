import type { DataQuality } from "@/domain/quality";
import type { AnalyticalSignal, EvaluationStatus, SignalAction } from "@/domain/signal";
import { SIGNAL_TTL_MS } from "@/strategies/parameters";
import type { StrategyContext } from "@/strategies/context";

export function makeSignal(
  context: StrategyContext,
  input: {
    strategyId: string;
    version: string;
    action: SignalAction;
    evaluation: EvaluationStatus;
    confidence: number;
    reasons: readonly string[];
    evidence: readonly string[];
    featuresUsed: readonly string[];
    riskHints?: readonly string[];
    tags?: readonly string[];
    quality?: DataQuality;
  },
): AnalyticalSignal {
  const hints = [...(input.riskHints ?? [])];
  if (context.fidelity === "paper") {
    hints.push("Paper sample. This is not a live observation.");
  }
  hints.push("A strategy signal is not an order.");
  return {
    strategyId: input.strategyId,
    strategyVersion: input.version,
    assetId: context.representationId,
    ticker: context.ticker,
    representationId: context.representationId,
    timestamp: new Date(context.asOfMs).toISOString(),
    action: input.action,
    evaluation: input.evaluation,
    confidence: input.confidence,
    reasons: input.reasons,
    evidence: input.evidence,
    featuresUsed: input.featuresUsed,
    riskHints: hints,
    validUntil: new Date(context.asOfMs + SIGNAL_TTL_MS).toISOString(),
    dataQuality: input.quality ?? context.dataQuality,
    tags: input.tags ?? [],
    executable: false,
  };
}

export function blocked(
  context: StrategyContext,
  strategyId: string,
  version: string,
  evaluation: "INSUFFICIENT_DATA" | "STALE_DATA",
  reason: string,
): AnalyticalSignal {
  const quality = {
    ...context.dataQuality,
    status: evaluation === "STALE_DATA" ? ("STALE" as const) : context.dataQuality.status === "STALE" ? ("STALE" as const) : ("INSUFFICIENT" as const),
  };
  return makeSignal(context, {
    strategyId,
    version,
    action: "NO_SIGNAL",
    evaluation,
    confidence: 0,
    reasons: [reason],
    evidence: [reason],
    featuresUsed: [],
    quality,
  });
}

export function clampConfidence(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
