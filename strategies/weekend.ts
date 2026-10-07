import type { DataQuality } from "@/domain/quality";
import { assessDataQuality } from "@/domain/quality";
import type { MarketSessionState } from "@/domain/session-state";
import type { IntelligenceStrategy } from "@/strategies/types";
import type { StrategyContext } from "@/strategies/context";
import { WEEKEND_PARAMS } from "@/strategies/parameters";
import { blocked, clampConfidence, makeSignal } from "@/strategies/signal-base";
import { rejectStale } from "@/strategies/momentum";

const DEFAULT_OFF_HOURS = new Set<MarketSessionState>(WEEKEND_PARAMS.offHours);

/**
 * Off-hours reference check, version 1.
 * During CLOSED, PRE_OPEN, and POST_CLOSE, compare the token price with the API reference price.
 * A gap of at least 0.75% is an off-hours dislocation.
 * The action stays HOLD. This is not an arbitrage profit and not an order.
 * OPEN sessions return NO_SIGNAL. UNKNOWN sessions return INSUFFICIENT_DATA.
 */
export const weekendStrategy: IntelligenceStrategy = {
  metadata: {
    id: "weekend",
    name: "Weekend / off-hours",
    category: "session",
    description: "Reference deviation while the reported session is off hours. Not an arbitrage profit.",
    enabled: true,
    supportedAssets: ["*"],
    riskLevel: "medium",
    requiredData: ["price", "reference", "session"],
    supportedSessions: ["CLOSED", "PRE_OPEN", "POST_CLOSE", "OPEN", "UNKNOWN"],
    status: "implemented",
    version: WEEKEND_PARAMS.version,
  },
  evaluate(context) {
    const stale = rejectStale(context, "weekend", WEEKEND_PARAMS.version);
    if (stale) {
      return stale;
    }
    if (context.session === "UNKNOWN") {
      return blocked(context, "weekend", WEEKEND_PARAMS.version, "INSUFFICIENT_DATA", "Market session is unknown.");
    }
    const params = context.operator?.strategies.weekend;
    const offHours = new Set<MarketSessionState>(params?.allowedSessions ?? [...DEFAULT_OFF_HOURS]);
    const minDeviation = params?.minDeviationBps ?? WEEKEND_PARAMS.minDeviationBps;
    if (!offHours.has(context.session)) {
      return makeSignal(context, {
        strategyId: "weekend",
        version: WEEKEND_PARAMS.version,
        action: "NO_SIGNAL",
        evaluation: "NO_SIGNAL",
        confidence: 0,
        reasons: [`Session is ${context.session}. The off-hours rule does not apply.`],
        evidence: [`Session is ${context.session}.`],
        featuresUsed: ["data_freshness"],
        quality: weekendQuality(context, []),
      });
    }
    if (context.price === null || context.referencePrice === null || context.referenceDeviationBps === null) {
      return blocked(
        context,
        "weekend",
        WEEKEND_PARAMS.version,
        "INSUFFICIENT_DATA",
        "Token price or reference price is missing.",
      );
    }
    const gap = context.referenceDeviationBps < 0n ? -context.referenceDeviationBps : context.referenceDeviationBps;
    const material = gap >= BigInt(minDeviation);
    const printed = `${context.referenceDeviationBps > 0n ? "+" : context.referenceDeviationBps < 0n ? "" : ""}${(Number(context.referenceDeviationBps) / 100).toFixed(2)}%`;
    if (!material) {
      return makeSignal(context, {
        strategyId: "weekend",
        version: WEEKEND_PARAMS.version,
        action: "HOLD",
        evaluation: "VALID",
        confidence: 0.35,
        reasons: [
          `Reference deviation ${printed} is inside the 0.75% band.`,
          "The reference price is a per-share conversion of the token price, not an official stock quote.",
        ],
        evidence: [`Session: ${context.session}.`, `Reference deviation: ${printed}.`],
        featuresUsed: ["reference_deviation", "data_freshness"],
        tags: ["REFERENCE_DEVIATION"],
        quality: weekendQuality(context, []),
      });
    }
    const confidence = clampConfidence(0.5 + Number(gap) / 500, 0.5, 0.8);
    return makeSignal(context, {
      strategyId: "weekend",
      version: WEEKEND_PARAMS.version,
      action: "HOLD",
      evaluation: "SIGNAL",
      confidence,
      reasons: [
        "Tokenized asset is trading materially away from reference during a closed session.",
        `Reference deviation ${printed}.`,
        "This is an off-hours dislocation, not an arbitrage profit.",
      ],
      evidence: [
        `Session: ${context.session}.`,
        `Reference deviation: ${printed}.`,
        `Band: 0.75%.`,
        context.latestAgeMs === null ? "Data age: unknown." : `Data age: ${Math.round(context.latestAgeMs / 1000)}s.`,
      ],
      featuresUsed: ["reference_deviation", "data_freshness"],
      riskHints: ["Do not treat the reference gap as executable profit."],
      tags: ["REFERENCE_DEVIATION", "OFF_HOURS_DISLOCATION", "POTENTIAL_OPPORTUNITY"],
      quality: weekendQuality(context, []),
    });
  },
};

function weekendQuality(context: StrategyContext, missing: readonly string[]): DataQuality {
  return assessDataQuality({
    historyPoints: context.candles.length,
    requiredPoints: 0,
    freshness: context.freshness,
    latestAgeMs: context.latestAgeMs,
    referenceAgeMs: context.referenceAgeMs,
    missingFields: missing,
    fidelity: context.fidelity,
  });
}
