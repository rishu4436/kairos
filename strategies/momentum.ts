import { featureById, realizedVolBps, simpleReturnBps, sma } from "@/domain/features";
import type { IntelligenceStrategy } from "@/strategies/types";
import { MOMENTUM_PARAMS } from "@/strategies/parameters";
import { blocked, clampConfidence, makeSignal } from "@/strategies/signal-base";
import type { StrategyContext } from "@/strategies/context";

/**
 * Momentum, version 1.
 * 1h return is the close-to-close change across 4 candles of 15m.
 * BUY when that return is at least +0.50%, the close is above the 20-bar SMA,
 * the trend feature is UP, and 20-return volatility is below 0.80%.
 * SELL uses the symmetric negative rule.
 * Otherwise the evaluation is VALID and the action is HOLD.
 * A short history or a stale observation does not become HOLD.
 */
export const momentumStrategy: IntelligenceStrategy = {
  metadata: {
    id: "momentum",
    name: "Momentum",
    category: "trend",
    description: "1-hour close return confirmed by the 20-bar average. Deterministic. Not an order.",
    enabled: true,
    supportedAssets: ["*"],
    riskLevel: "medium",
    requiredData: ["price", "candles", "history"],
    supportedSessions: ["*"],
    status: "implemented",
    version: MOMENTUM_PARAMS.version,
  },
  evaluate(context): ReturnType<IntelligenceStrategy["evaluate"]> {
    const stale = rejectStale(context, "momentum", MOMENTUM_PARAMS.version);
    if (stale) {
      return stale;
    }
    if (context.candles.length < MOMENTUM_PARAMS.minCandles || context.price === null) {
      return blocked(
        context,
        "momentum",
        MOMENTUM_PARAMS.version,
        "INSUFFICIENT_DATA",
        `Momentum needs ${MOMENTUM_PARAMS.minCandles} candles and a price. Received ${context.candles.length} candles.`,
      );
    }
    const last = context.candles[context.candles.length - 1];
    const prior = context.candles[context.candles.length - 1 - MOMENTUM_PARAMS.momentumBars];
    const momentum = simpleReturnBps(last.close, prior.close);
    const mean = sma(context.candles, MOMENTUM_PARAMS.trendPeriod);
    const vol = realizedVolBps(context.candles, 20);
    const trend = featureById(context.features.features, "trend");
    if (momentum === null || mean === null || vol === null || !trend?.sufficient || trend.value === null) {
      return blocked(context, "momentum", MOMENTUM_PARAMS.version, "INSUFFICIENT_DATA", "Momentum inputs were not available.");
    }
    const volatile = vol > BigInt(MOMENTUM_PARAMS.maxVolatilityBps);
    const up = momentum >= BigInt(MOMENTUM_PARAMS.minReturnBps) && last.close > mean && trend.value === "UP" && !volatile;
    const down = momentum <= -BigInt(MOMENTUM_PARAMS.minReturnBps) && last.close < mean && trend.value === "DOWN" && !volatile;
    const action = up ? "BUY" : down ? "SELL" : "HOLD";
    const evaluation = action === "HOLD" ? "VALID" : "SIGNAL";
    const magnitude = Number(momentum < 0n ? -momentum : momentum);
    const confidence = action === "HOLD" ? 0.42 : clampConfidence(0.55 + (magnitude - MOMENTUM_PARAMS.minReturnBps) / 400, 0.55, 0.84);
    const returnText = featureById(context.features.features, "return_1h")?.value ?? "unavailable";
    const reasons = [
      `1h return ${returnText}.`,
      last.close > mean ? "Close is above the 20-period average." : last.close < mean ? "Close is below the 20-period average." : "Close equals the 20-period average.",
      `Trend ${trend.value}.`,
      volatile ? "Volatility is above 0.80%, so no directional signal is taken." : "Volatility is within the 0.80% cap.",
    ];
    return makeSignal(context, {
      strategyId: "momentum",
      version: MOMENTUM_PARAMS.version,
      action,
      evaluation,
      confidence,
      reasons,
      evidence: evidenceLines(context, reasons),
      featuresUsed: ["return_1h", "sma_20", "trend", "realized_volatility_20", "data_freshness"],
      tags: action === "HOLD" ? [] : ["MOMENTUM"],
    });
  },
};

function evidenceLines(context: StrategyContext, reasons: readonly string[]): string[] {
  const age = context.latestAgeMs === null ? "age unknown" : `${Math.round(context.latestAgeMs / 1000)}s`;
  return [...reasons, `Data age: ${age}.`, `Regime: ${context.regime.regime}.`];
}

export function rejectStale(
  context: StrategyContext,
  strategyId: string,
  version: string,
): ReturnType<IntelligenceStrategy["evaluate"]> | null {
  if (context.freshness === "STALE") {
    return blocked(context, strategyId, version, "STALE_DATA", "The observation source time is stale.");
  }
  return null;
}
