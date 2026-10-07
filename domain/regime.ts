import type { Candle } from "@/domain/candle";
import { realizedVolBps, simpleReturnBps, sma } from "@/domain/features";

export type MarketRegime =
  | "TRENDING_UP"
  | "TRENDING_DOWN"
  | "RANGE_BOUND"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "UNKNOWN";

export interface RegimeAssessment {
  regime: MarketRegime;
  asOf: string;
  sufficient: boolean;
  reasons: readonly string[];
}

/** Rules, not a model. Thresholds are KAIROS policy on 15-minute closes. */
const HIGH_VOL_BPS = 80n;
const LOW_VOL_BPS = 20n;
const TREND_RETURN_BPS = 80n;
const RANGE_DISTANCE_BPS = 40n;
const MIN_CANDLES = 21;

export function classifyRegime(candles: readonly Candle[], asOf: string): RegimeAssessment {
  if (candles.length < MIN_CANDLES) {
    return {
      regime: "UNKNOWN",
      asOf,
      sufficient: false,
      reasons: [`Needs ${MIN_CANDLES} candles. Received ${candles.length}.`],
    };
  }
  const vol = realizedVolBps(candles, 20);
  const first = candles[candles.length - 21];
  const last = candles[candles.length - 1];
  const trendReturn = simpleReturnBps(last.close, first.close);
  const mean = sma(candles, 20);
  const distance = mean === null ? null : simpleReturnBps(last.close, mean);
  if (vol === null || trendReturn === null || distance === null) {
    return {
      regime: "UNKNOWN",
      asOf,
      sufficient: false,
      reasons: ["A close in the lookback was zero, so return or volatility is undefined."],
    };
  }
  const reasons = [
    `20-bar return ${bpsText(trendReturn)}`,
    `20-return volatility ${bpsText(vol)}`,
    `distance from SMA 20 ${bpsText(distance)}`,
  ];
  if (vol >= HIGH_VOL_BPS) {
    return { regime: "HIGH_VOLATILITY", asOf, sufficient: true, reasons: [...reasons, "Volatility is at or above 0.80%."] };
  }
  if (trendReturn >= TREND_RETURN_BPS && last.close > (mean as bigint)) {
    return { regime: "TRENDING_UP", asOf, sufficient: true, reasons: [...reasons, "Return and close are above the 20-bar mean."] };
  }
  if (trendReturn <= -TREND_RETURN_BPS && last.close < (mean as bigint)) {
    return { regime: "TRENDING_DOWN", asOf, sufficient: true, reasons: [...reasons, "Return and close are below the 20-bar mean."] };
  }
  if (vol <= LOW_VOL_BPS && abs(trendReturn) < RANGE_DISTANCE_BPS) {
    return { regime: "LOW_VOLATILITY", asOf, sufficient: true, reasons: [...reasons, "Volatility is at or below 0.20% and the 20-bar return is small."] };
  }
  if (abs(distance) <= RANGE_DISTANCE_BPS && abs(trendReturn) < TREND_RETURN_BPS) {
    return { regime: "RANGE_BOUND", asOf, sufficient: true, reasons: [...reasons, "Price is within 0.40% of the 20-bar mean."] };
  }
  return { regime: "UNKNOWN", asOf, sufficient: true, reasons: [...reasons, "No regime rule matched."] };
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function bpsText(bps: bigint): string {
  const negative = bps < 0n;
  const body = (negative ? -bps : bps).toString();
  return `${negative ? "-" : ""}${body} bps`;
}
