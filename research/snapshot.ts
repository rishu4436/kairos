import type { Candle } from "@/domain/candle";
import { computeFeatures, featureById } from "@/domain/features";
import { classifyRegime, type MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { DslCondition, DslOperator } from "@/research/dsl";

export interface ResearchBar {
  candle: Candle;
  session: MarketSessionState;
  /** Basis points known at this bar. Null stays null. It is never replaced with zero. */
  referenceDeviationBps: bigint | null;
}

export interface BarSnapshot {
  index: number;
  numeric: Readonly<Record<string, number>>;
  labels: Readonly<Record<string, string>>;
  sufficient: Readonly<Record<string, boolean>>;
}

/** Features and regime from bars[0..index] only. */
export function snapshotAt(bars: readonly ResearchBar[], index: number): BarSnapshot {
  const visible = bars.slice(0, index + 1);
  const last = visible[visible.length - 1];
  const candles = visible.map((bar) => bar.candle);
  const asOf = new Date(last.candle.timestampMs).toISOString();
  const features = computeFeatures({
    candles,
    asOf,
    referenceDeviationBps: last.referenceDeviationBps,
    freshnessLabel: null,
  });
  const regime = classifyRegime(candles, asOf);
  const distance = featureById(features.features, "distance_from_mean");
  const distanceBps = distance?.bps === null || distance?.bps === undefined ? null : Number(distance.bps);
  const priceLabel = distanceBps === null ? "" : distanceBps > 0 ? "ABOVE" : distanceBps < 0 ? "BELOW" : "EQUAL";
  const numeric: Record<string, number> = {};
  const labels: Record<string, string> = {
    market_session: last.session,
    regime: regime.regime,
    price_vs_sma20: priceLabel,
  };
  const sufficient: Record<string, boolean> = {
    market_session: true,
    regime: regime.sufficient,
    price_vs_sma20: distance?.sufficient === true,
  };
  copyBps("return_15m", "return_15m");
  copyBps("return_1h", "return_1h");
  copyBps("return_4h", "return_4h");
  copyBps("volatility_20", "realized_volatility_20");
  copyBps("momentum_1h", "momentum_1h");
  copyBps("reference_deviation_bps", "reference_deviation");
  if (distanceBps !== null && distance?.sufficient) {
    numeric.price_vs_sma20 = distanceBps;
  }
  return { index, numeric, labels, sufficient };

  function copyBps(dslId: string, featureId: string): void {
    const feature = featureById(features.features, featureId);
    sufficient[dslId] = feature?.sufficient === true && feature.bps !== null;
    if (feature?.bps !== null && feature?.bps !== undefined && feature.sufficient) {
      numeric[dslId] = Number(feature.bps);
    }
  }
}

export function conditionsPass(
  conditions: readonly DslCondition[],
  current: BarSnapshot,
  previous: BarSnapshot | null,
): boolean {
  return conditions.every((condition) => matchCondition(condition, current, previous));
}

function matchCondition(condition: DslCondition, current: BarSnapshot, previous: BarSnapshot | null): boolean {
  const operator = condition.operator as DslOperator;
  if (operator === "IN") {
    const label = current.labels[condition.feature];
    return Array.isArray(condition.threshold) && current.sufficient[condition.feature] === true && condition.threshold.includes(label);
  }
  if (typeof condition.threshold === "string") {
    if (current.sufficient[condition.feature] !== true) {
      return false;
    }
    const label = current.labels[condition.feature];
    if (operator === "EQ") {
      return label === condition.threshold;
    }
    if (operator === "NEQ") {
      return label !== condition.threshold;
    }
    return false;
  }
  if (typeof condition.threshold !== "number" || !Number.isFinite(condition.threshold)) {
    return false;
  }
  if (current.sufficient[condition.feature] !== true || current.numeric[condition.feature] === undefined) {
    return false;
  }
  const value = current.numeric[condition.feature];
  const prior = previous?.sufficient[condition.feature] === true ? previous.numeric[condition.feature] : undefined;
  switch (operator) {
    case "GT":
      return value > condition.threshold;
    case "GTE":
      return value >= condition.threshold;
    case "LT":
      return value < condition.threshold;
    case "LTE":
      return value <= condition.threshold;
    case "EQ":
      return value === condition.threshold;
    case "NEQ":
      return value !== condition.threshold;
    case "CROSS_ABOVE":
      return prior !== undefined && prior <= condition.threshold && value > condition.threshold;
    case "CROSS_BELOW":
      return prior !== undefined && prior >= condition.threshold && value < condition.threshold;
    default:
      return false;
  }
}

export function regimeAt(bars: readonly ResearchBar[], index: number): MarketRegime {
  return classifyRegime(
    bars.slice(0, index + 1).map((bar) => bar.candle),
    new Date(bars[index].candle.timestampMs).toISOString(),
  ).regime;
}
