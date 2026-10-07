import type { Candle } from "@/domain/candle";
import { formatDecimal, divRound, type Scaled } from "@/domain/money";

export interface MarketFeature {
  id: string;
  label: string;
  lookback: string;
  source: string;
  timestamp: string;
  sufficient: boolean;
  /** Display value. Null means the feature was not computed. Never a stand-in zero. */
  value: string | null;
  /** Integer basis points as a decimal string, when the feature is a return or volatility. */
  bps: string | null;
  note: string | null;
}

export interface FeatureSet {
  asOf: string;
  features: readonly MarketFeature[];
}

const CLOSE = "candle close";

export function computeFeatures(input: {
  candles: readonly Candle[];
  asOf: string;
  referenceDeviationBps: bigint | null;
  freshnessLabel: string | null;
}): FeatureSet {
  const candles = input.candles;
  const stamp = input.asOf;
  const features: MarketFeature[] = [
    returnFeature("return_15m", "15m return", "1 x 15m", candles, 1, stamp),
    returnFeature("return_1h", "1h return", "4 x 15m", candles, 4, stamp),
    returnFeature("return_4h", "4h return", "16 x 15m", candles, 16, stamp),
    priceFeature("sma_20", "SMA 20", "20 x 15m", sma(candles, 20), CLOSE, candles, stamp),
    priceFeature("ema_12", "EMA 12", "12 x 15m", ema(candles, 12), CLOSE, candles, stamp),
    volatilityFeature(candles, stamp),
    priceFeature("rolling_high_20", "Rolling high", "20 x 15m high", rollingHigh(candles, 20), "candle high", candles, stamp),
    priceFeature("rolling_low_20", "Rolling low", "20 x 15m low", rollingLow(candles, 20), "candle low", candles, stamp),
    rangeFeature(candles, stamp),
    volumeChangeFeature(candles, stamp),
    trendFeature(candles, stamp),
    returnFeature("momentum_1h", "Momentum", "4 x 15m close return", candles, 4, stamp),
    distanceFeature(candles, stamp),
    referenceFeature(input.referenceDeviationBps, stamp),
    freshnessFeature(input.freshnessLabel, stamp),
  ];
  return { asOf: input.asOf, features };
}

export function simpleReturnBps(newer: Scaled, older: Scaled): bigint | null {
  if (older === 0n) {
    return null;
  }
  return divRound((newer - older) * 10_000n, older);
}

export function sma(candles: readonly Candle[], period: number): Scaled | null {
  if (period < 1 || candles.length < period) {
    return null;
  }
  const window = candles.slice(candles.length - period);
  const sum = window.reduce((total, candle) => total + candle.close, 0n);
  return divRound(sum, BigInt(period));
}

/** SMA seed, then EMA with alpha = 2 / (period + 1), in scaled integers. */
export function ema(candles: readonly Candle[], period: number): Scaled | null {
  if (period < 1 || candles.length < period) {
    return null;
  }
  const seed = sma(candles.slice(0, period), period);
  if (seed === null) {
    return null;
  }
  let value = seed;
  const alphaNum = 2n;
  const alphaDen = BigInt(period + 1);
  const remain = alphaDen - alphaNum;
  for (const candle of candles.slice(period)) {
    value = divRound(candle.close * alphaNum + value * remain, alphaDen);
  }
  return value;
}

export function realizedVolBps(candles: readonly Candle[], period: number): bigint | null {
  if (period < 2 || candles.length < period + 1) {
    return null;
  }
  const window = candles.slice(candles.length - (period + 1));
  const returns: bigint[] = [];
  for (let index = 1; index < window.length; index += 1) {
    const value = simpleReturnBps(window[index].close, window[index - 1].close);
    if (value === null) {
      return null;
    }
    returns.push(value);
  }
  const mean = divRound(returns.reduce((total, value) => total + value, 0n), BigInt(returns.length));
  const squared = returns.reduce((total, value) => total + (value - mean) ** 2n, 0n);
  const variance = divRound(squared, BigInt(returns.length - 1));
  return isqrt(variance < 0n ? 0n : variance);
}

export function featureById(features: readonly MarketFeature[], id: string): MarketFeature | undefined {
  return features.find((feature) => feature.id === id);
}

function returnFeature(
  id: string,
  label: string,
  lookback: string,
  candles: readonly Candle[],
  bars: number,
  timestamp: string,
): MarketFeature {
  const base = emptyFeature(id, label, lookback, CLOSE, timestamp);
  if (candles.length < bars + 1) {
    return { ...base, note: `Needs ${bars + 1} candles.` };
  }
  const last = candles[candles.length - 1];
  const prior = candles[candles.length - 1 - bars];
  const bps = simpleReturnBps(last.close, prior.close);
  if (bps === null) {
    return { ...base, note: "Prior close is zero." };
  }
  return { ...base, sufficient: true, value: formatSignedBps(bps), bps: bps.toString() };
}

function priceFeature(
  id: string,
  label: string,
  lookback: string,
  value: Scaled | null,
  source: string,
  candles: readonly Candle[],
  timestamp: string,
): MarketFeature {
  const base = emptyFeature(id, label, lookback, source, timestamp);
  if (value === null) {
    return { ...base, note: candles.length === 0 ? "No candles." : "Not enough candles." };
  }
  return { ...base, sufficient: true, value: formatDecimal(value, 4) };
}

function volatilityFeature(candles: readonly Candle[], timestamp: string): MarketFeature {
  const base = emptyFeature("realized_volatility_20", "Volatility", "20 return sample", CLOSE, timestamp);
  const bps = realizedVolBps(candles, 20);
  if (bps === null) {
    return { ...base, note: "Needs 21 closes with non-zero priors." };
  }
  return { ...base, sufficient: true, value: formatAbsBps(bps), bps: bps.toString() };
}

function rangeFeature(candles: readonly Candle[], timestamp: string): MarketFeature {
  const base = emptyFeature("range_20", "Range", "20 x 15m high-low", "candle high and low", timestamp);
  const high = rollingHigh(candles, 20);
  const low = rollingLow(candles, 20);
  if (high === null || low === null) {
    return { ...base, note: "Not enough candles." };
  }
  return { ...base, sufficient: true, value: formatDecimal(high - low, 4) };
}

function volumeChangeFeature(candles: readonly Candle[], timestamp: string): MarketFeature {
  const base = emptyFeature("volume_change", "Volume change", "1 bar", "candle volume", timestamp);
  if (candles.length < 2) {
    return { ...base, note: "Needs 2 candles." };
  }
  const last = candles[candles.length - 1].volume;
  const prior = candles[candles.length - 2].volume;
  if (last === null || prior === null) {
    return { ...base, note: "Volume was not on the candle." };
  }
  if (prior === 0n) {
    return { ...base, note: "Previous volume is zero." };
  }
  const bps = simpleReturnBps(last, prior);
  if (bps === null) {
    return { ...base, note: "Previous volume is zero." };
  }
  return { ...base, sufficient: true, value: formatSignedBps(bps), bps: bps.toString() };
}

function trendFeature(candles: readonly Candle[], timestamp: string): MarketFeature {
  const base = emptyFeature("trend", "Trend", "SMA 8 vs SMA 20", CLOSE, timestamp);
  const fast = sma(candles, 8);
  const slow = sma(candles, 20);
  const last = candles.at(-1)?.close;
  if (fast === null || slow === null || last === undefined) {
    return { ...base, note: "Needs 20 candles." };
  }
  let label = "FLAT";
  if (fast > slow && last > slow) {
    label = "UP";
  } else if (fast < slow && last < slow) {
    label = "DOWN";
  }
  return { ...base, sufficient: true, value: label };
}

function distanceFeature(candles: readonly Candle[], timestamp: string): MarketFeature {
  const base = emptyFeature("distance_from_mean", "Distance from mean", "close vs SMA 20", CLOSE, timestamp);
  const mean = sma(candles, 20);
  const last = candles.at(-1)?.close;
  if (mean === null || last === undefined) {
    return { ...base, note: "Needs 20 candles." };
  }
  const bps = simpleReturnBps(last, mean);
  if (bps === null) {
    return { ...base, note: "Rolling mean is zero." };
  }
  return { ...base, sufficient: true, value: formatSignedBps(bps), bps: bps.toString() };
}

function referenceFeature(bps: bigint | null, timestamp: string): MarketFeature {
  const base = emptyFeature(
    "reference_deviation",
    "Reference deviation",
    "latest observation",
    "token price and reference price",
    timestamp,
  );
  if (bps === null) {
    return { ...base, note: "Reference price is missing." };
  }
  return { ...base, sufficient: true, value: formatSignedBps(bps), bps: bps.toString() };
}

function freshnessFeature(label: string | null, timestamp: string): MarketFeature {
  const base = emptyFeature("data_freshness", "Data freshness", "source timestamp", "observation freshness", timestamp);
  if (label === null) {
    return { ...base, note: "Freshness was not classified." };
  }
  return { ...base, sufficient: true, value: label };
}

function rollingHigh(candles: readonly Candle[], period: number): Scaled | null {
  if (candles.length < period) {
    return null;
  }
  return candles.slice(candles.length - period).reduce((max, candle) => (candle.high > max ? candle.high : max), candles[candles.length - period].high);
}

function rollingLow(candles: readonly Candle[], period: number): Scaled | null {
  if (candles.length < period) {
    return null;
  }
  return candles.slice(candles.length - period).reduce((min, candle) => (candle.low < min ? candle.low : min), candles[candles.length - period].low);
}

function emptyFeature(id: string, label: string, lookback: string, source: string, timestamp: string): MarketFeature {
  return {
    id,
    label,
    lookback,
    source,
    timestamp,
    sufficient: false,
    value: null,
    bps: null,
    note: null,
  };
}

export function formatSignedBps(bps: bigint): string {
  const negative = bps < 0n;
  const abs = negative ? -bps : bps;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  const sign = negative ? "-" : bps > 0n ? "+" : "";
  return `${sign}${whole.toString()}.${frac}%`;
}

function formatAbsBps(bps: bigint): string {
  const abs = bps < 0n ? -bps : bps;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${frac}%`;
}

function isqrt(value: bigint): bigint {
  if (value < 0n) {
    throw new Error("Square root of a negative integer.");
  }
  if (value < 2n) {
    return value;
  }
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}
