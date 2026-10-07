import { scaleDecimal, type Candle } from "@/domain/candle";
import { SCALE } from "@/domain/money";

export function candlesFromCloses(closes: readonly string[], volume: string | null = "1000"): Candle[] {
  return closes.map((close, index) => {
    const price = scaleDecimal(close);
    if (price === null) {
      throw new Error(`Bad close ${close}`);
    }
    return {
      timestampMs: index * 900_000,
      open: price,
      high: price + SCALE,
      low: price > SCALE ? price - SCALE : price,
      close: price,
      volume: volume === null ? null : scaleDecimal(volume),
      tradeCount: 3,
    };
  });
}
