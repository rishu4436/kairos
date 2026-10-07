import type { Candle } from "@/domain/candle";

export type CandleBarClass = "VALID" | "SUSPICIOUS" | "INVALID";

export interface CandleBarAssessment {
  classification: CandleBarClass;
  reasons: readonly string[];
}

/**
 * OHLC must be internally consistent. Extreme range vs the body is flagged as
 * SUSPICIOUS rather than discarded, so provenance can still be inspected.
 */
export function classifyCandleBar(candle: Candle): CandleBarAssessment {
  const reasons: string[] = [];
  if (!Number.isFinite(candle.timestampMs) || !Number.isSafeInteger(candle.timestampMs) || candle.timestampMs < 0) {
    reasons.push("TIMESTAMP_INVALID");
  }
  if (candle.open <= 0n || candle.high <= 0n || candle.low <= 0n || candle.close <= 0n) {
    reasons.push("NON_POSITIVE_PRICE");
  }
  if (candle.high < candle.low) {
    reasons.push("HIGH_BELOW_LOW");
  }
  if (candle.high < candle.open) {
    reasons.push("HIGH_BELOW_OPEN");
  }
  if (candle.high < candle.close) {
    reasons.push("HIGH_BELOW_CLOSE");
  }
  if (candle.low > candle.open) {
    reasons.push("LOW_ABOVE_OPEN");
  }
  if (candle.low > candle.close) {
    reasons.push("LOW_ABOVE_CLOSE");
  }
  if (reasons.length > 0) {
    return { classification: "INVALID", reasons };
  }
  const bodyHigh = candle.open > candle.close ? candle.open : candle.close;
  const bodyLow = candle.open < candle.close ? candle.open : candle.close;
  if (bodyHigh > 0n && candle.high > bodyHigh * 5n) {
    reasons.push("EXTREME_HIGH_WICK");
  }
  if (bodyLow > 0n && candle.low * 5n < bodyLow) {
    reasons.push("EXTREME_LOW_WICK");
  }
  if (candle.close > 0n && candle.high - candle.low > candle.close * 4n) {
    reasons.push("EXTREME_RANGE");
  }
  if (reasons.length > 0) {
    return { classification: "SUSPICIOUS", reasons };
  }
  return { classification: "VALID", reasons: [] };
}

export function classifySeries(candles: readonly Candle[]): CandleBarClass {
  let suspicious = false;
  for (const candle of candles) {
    const classified = classifyCandleBar(candle);
    if (classified.classification === "INVALID") {
      return "INVALID";
    }
    if (classified.classification === "SUSPICIOUS") {
      suspicious = true;
    }
  }
  return suspicious ? "SUSPICIOUS" : "VALID";
}

export function validOrderedCandles(candles: readonly Candle[]): { candles: Candle[]; invalid: number; suspicious: number } {
  const kept: Candle[] = [];
  let invalid = 0;
  let suspicious = 0;
  let lastTs = -1;
  for (const candle of candles) {
    const classified = classifyCandleBar(candle);
    if (classified.classification === "INVALID" || candle.timestampMs <= lastTs) {
      invalid += 1;
      continue;
    }
    if (classified.classification === "SUSPICIOUS") {
      suspicious += 1;
    }
    lastTs = candle.timestampMs;
    kept.push(candle);
  }
  return { candles: kept, invalid, suspicious };
}
