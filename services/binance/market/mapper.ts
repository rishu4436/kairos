import { countUnknown, epochUnknown, scaleUnknown, type Candle } from "@/domain/candle";
import { KairosApiError } from "@/services/binance/errors";

export interface CandleMapResult {
  candles: Candle[];
  rejected: number;
}

/** Map a Market API candle payload into domain candles. Invalid rows are counted and dropped. */
export function mapCandles(payload: unknown): CandleMapResult {
  if (!Array.isArray(payload)) {
    throw new KairosApiError({
      category: "MALFORMED_RESPONSE",
      safeMessage: "The market history response was not usable.",
      technicalMessage: "Candle payload was not an array.",
    });
  }
  const candles: Candle[] = [];
  let rejected = 0;
  for (const row of payload) {
    const mapped = mapRow(row);
    if (mapped === null) {
      rejected += 1;
      continue;
    }
    candles.push(mapped);
  }
  return { candles, rejected };
}

function mapRow(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 6) {
    return null;
  }
  const open = scaleUnknown(row[0]);
  const high = scaleUnknown(row[1]);
  const low = scaleUnknown(row[2]);
  const close = scaleUnknown(row[3]);
  const timestampMs = epochUnknown(row[5]);
  if (open === null || high === null || low === null || close === null || timestampMs === null) {
    return null;
  }
  if (high < low) {
    return null;
  }
  const volume = row[4] === null || row[4] === undefined || row[4] === "" ? null : scaleUnknown(row[4]);
  if (row[4] !== null && row[4] !== undefined && row[4] !== "" && volume === null) {
    return null;
  }
  return {
    timestampMs,
    open,
    high,
    low,
    close,
    volume,
    tradeCount: row.length > 6 && row[6] !== null && row[6] !== undefined ? countUnknown(row[6]) : null,
  };
}
