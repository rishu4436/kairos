import { CANDLE_INTERVAL_MS, scaleDecimal, type Candle } from "@/domain/candle";
import { divRound, SCALE } from "@/domain/money";

/** Deterministic sample candles for paper mode. Not a market replay. */
export function buildPaperSeries(ticker: string, priceText: string | null, asOfMs: number): Candle[] {
  if (priceText === null) {
    return [];
  }
  const price = scaleDecimal(priceText);
  if (price === null || price <= 0n) {
    return [];
  }
  const seed = [...ticker].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const end = Math.floor(asOfMs / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
  const count = 48;
  const candles: Candle[] = [];
  let previous = price;
  for (let index = 0; index < count; index += 1) {
    const wave = ((index + seed) % 12) - 6;
    const drift = (index - 24) * ((seed % 3) - 1);
    let close = price + divRound(price * BigInt(wave + drift), 500n);
    if (close <= 0n) {
      close = price;
    }
    const spread = divRound(price, 1_000n) || SCALE;
    const open = previous;
    const upper = open > close ? open : close;
    const lower = open < close ? open : close;
    candles.push({
      timestampMs: end - (count - 1 - index) * CANDLE_INTERVAL_MS,
      open,
      high: upper + spread,
      low: lower > spread ? lower - spread : 1n,
      close,
      volume: (1_000n + BigInt((index % 5) * 100)) * SCALE,
      tradeCount: 10 + (index % 4),
    });
    previous = close;
  }
  return candles;
}
