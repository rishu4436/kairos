import { featureById, simpleReturnBps, sma } from "@/domain/features";
import type { IntelligenceStrategy } from "@/strategies/types";
import { MEAN_REVERSION_PARAMS } from "@/strategies/parameters";
import { blocked, clampConfidence, makeSignal } from "@/strategies/signal-base";
import { rejectStale } from "@/strategies/momentum";

/**
 * Mean reversion, version 1.
 * Distance is (close - SMA 20) / SMA 20.
 * BUY when distance is at or below -1.20% and the regime is not TRENDING_DOWN.
 * SELL when distance is at or above +1.20% and the regime is not TRENDING_UP.
 * HIGH_VOLATILITY suppresses the side and returns HOLD.
 * A short history does not become HOLD.
 */
export const meanReversionStrategy: IntelligenceStrategy = {
  metadata: {
    id: "mean-reversion",
    name: "Mean reversion",
    category: "mean_reversion",
    description: "Distance from the 20-bar average. Deterministic. Not an order.",
    enabled: true,
    supportedAssets: ["*"],
    riskLevel: "medium",
    requiredData: ["price", "candles", "history"],
    supportedSessions: ["*"],
    status: "implemented",
    version: MEAN_REVERSION_PARAMS.version,
  },
  evaluate(context) {
    const stale = rejectStale(context, "mean-reversion", MEAN_REVERSION_PARAMS.version);
    if (stale) {
      return stale;
    }
    if (context.candles.length < MEAN_REVERSION_PARAMS.minCandles || context.price === null) {
      return blocked(
        context,
        "mean-reversion",
        MEAN_REVERSION_PARAMS.version,
        "INSUFFICIENT_DATA",
        `Mean reversion needs ${MEAN_REVERSION_PARAMS.minCandles} candles and a price. Received ${context.candles.length} candles.`,
      );
    }
    const mean = sma(context.candles, MEAN_REVERSION_PARAMS.period);
    const last = context.candles[context.candles.length - 1].close;
    const distance = mean === null ? null : simpleReturnBps(last, mean);
    if (distance === null) {
      return blocked(context, "mean-reversion", MEAN_REVERSION_PARAMS.version, "INSUFFICIENT_DATA", "The rolling mean was not available.");
    }
    const threshold = BigInt(MEAN_REVERSION_PARAMS.entryBps);
    const stretchedDown = distance <= -threshold;
    const stretchedUp = distance >= threshold;
    const highVol = context.regime.regime === "HIGH_VOLATILITY";
    let action: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (!highVol && stretchedDown && context.regime.regime !== "TRENDING_DOWN") {
      action = "BUY";
    } else if (!highVol && stretchedUp && context.regime.regime !== "TRENDING_UP") {
      action = "SELL";
    }
    const magnitude = Number(distance < 0n ? -distance : distance);
    const confidence = action === "HOLD" ? 0.4 : clampConfidence(0.55 + (magnitude - MEAN_REVERSION_PARAMS.entryBps) / 500, 0.55, 0.82);
    const printed = featureById(context.features.features, "distance_from_mean")?.value ?? "unavailable";
    const reasons = [
      `Distance from the 20-bar mean: ${printed}.`,
      `Entry band is ±${(MEAN_REVERSION_PARAMS.entryBps / 100).toFixed(2)}%.`,
      `Regime: ${context.regime.regime}.`,
      highVol ? "High volatility suppresses the reversion side." : "Volatility regime does not suppress the rule.",
    ];
    return makeSignal(context, {
      strategyId: "mean-reversion",
      version: MEAN_REVERSION_PARAMS.version,
      action,
      evaluation: action === "HOLD" ? "VALID" : "SIGNAL",
      confidence,
      reasons,
      evidence: [...reasons, context.latestAgeMs === null ? "Data age: unknown." : `Data age: ${Math.round(context.latestAgeMs / 1000)}s.`],
      featuresUsed: ["distance_from_mean", "sma_20", "data_freshness"],
      tags: action === "HOLD" ? [] : ["MEAN_REVERSION"],
    });
  },
};
