import type { AnalyticalSignal } from "@/domain/signal";
import { conditionsPass, type BarSnapshot } from "@/research/snapshot";
import type { StrategyContext } from "@/strategies/context";
import type { StrategyCandidate } from "@/lifecycle/types";

/** Reuses the research DSL and the features already on the strategy context. */
export function snapshotFromStrategyContext(context: StrategyContext): BarSnapshot {
  const numeric: Record<string, number> = {};
  const labels: Record<string, string> = {
    market_session: context.session,
    regime: context.regime.regime,
    price_vs_sma20: "",
  };
  const sufficient: Record<string, boolean> = {
    market_session: true,
    regime: context.regime.sufficient,
    price_vs_sma20: false,
  };
  for (const feature of context.features.features) {
    const id = feature.id === "realized_volatility_20" ? "volatility_20" : feature.id === "reference_deviation" ? "reference_deviation_bps" : feature.id;
    sufficient[id] = feature.sufficient && feature.bps !== null;
    if (feature.sufficient && feature.bps !== null) {
      numeric[id] = Number(feature.bps);
    }
    if (feature.id === "distance_from_mean" && feature.sufficient && feature.bps !== null) {
      const bps = Number(feature.bps);
      labels.price_vs_sma20 = bps > 0 ? "ABOVE" : bps < 0 ? "BELOW" : "EQUAL";
      sufficient.price_vs_sma20 = true;
      numeric.price_vs_sma20 = bps;
    }
  }
  return { index: 0, numeric, labels, sufficient };
}

export function evaluateDeclarativeStrategy(candidate: StrategyCandidate, context: StrategyContext, nowMs: number): AnalyticalSignal {
  const current = snapshotFromStrategyContext(context);
  const inScope =
    (candidate.assetScope.includes("*") || candidate.assetScope.includes(context.ticker)) &&
    (candidate.sessionScope.includes("ANY") || candidate.sessionScope.includes(context.session)) &&
    (candidate.regimeScope.includes("ANY") || candidate.regimeScope.includes(context.regime.regime));
  const passed = inScope && conditionsPass(candidate.conditions, current, null);
  const action = !passed || candidate.action === "OBSERVE" ? "NO_SIGNAL" : candidate.action;
  return {
    strategyId: candidate.strategyId,
    strategyVersion: candidate.strategyVersion,
    assetId: context.representationId,
    ticker: context.ticker,
    representationId: context.representationId,
    timestamp: new Date(nowMs).toISOString(),
    action,
    evaluation: passed && action !== "NO_SIGNAL" ? "SIGNAL" : "NO_SIGNAL",
    confidence: passed && action !== "NO_SIGNAL" ? 0.5 : 0,
    reasons: ["Declarative conditions were evaluated. No code was generated."],
    evidence: passed ? ["The declarative conditions matched the current features."] : ["The declarative conditions did not match."],
    featuresUsed: candidate.conditions.map((condition) => condition.feature),
    riskHints: ["A research signal is not an order."],
    validUntil: new Date(nowMs + 15 * 60 * 1000).toISOString(),
    dataQuality: context.dataQuality,
    tags: candidate.status === "SHADOW" ? ["SHADOW", "RESEARCH"] : ["RESEARCH"],
    executable: false,
  };
}
