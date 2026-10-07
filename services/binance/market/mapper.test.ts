import { describe, expect, it } from "vitest";
import { formatDecimal } from "@/domain/money";
import { KairosApiError } from "@/services/binance/errors";
import { mapCandles } from "@/services/binance/market/mapper";

describe("candle mapping", () => {
  it("maps the documented positional row", () => {
    const mapped = mapCandles([[1.0001, 1.0023, 0.9987, 1.001, 125000.5, 1748600000000, 42]]);
    expect(mapped.rejected).toBe(0);
    expect(mapped.candles).toHaveLength(1);
    expect(formatDecimal(mapped.candles[0].open, 4)).toBe("1.0001");
    expect(formatDecimal(mapped.candles[0].close, 4)).toBe("1.0010");
    expect(mapped.candles[0].timestampMs).toBe(1748600000000);
    expect(mapped.candles[0].tradeCount).toBe(42);
    expect(formatDecimal(mapped.candles[0].volume ?? 0n, 1)).toBe("125000.5");
  });

  it("drops rows that are missing required fields or inverted", () => {
    const mapped = mapCandles([
      ["1", "2", "0.5", "1.5", "10", "1000", "1"],
      ["nope", "1", "1", "1", "1", "1000"],
      ["1", "1", "2", "1", "1", "1000"],
      ["1", "1", "1"],
    ]);
    expect(mapped.candles).toHaveLength(1);
    expect(mapped.rejected).toBe(3);
  });

  it("keeps a candle when volume is absent and rejects a non-array payload", () => {
    const mapped = mapCandles([["2", "2", "2", "2", null, "2000"]]);
    expect(mapped.candles[0].volume).toBeNull();
    expect(() => mapCandles({ data: [] })).toThrow(KairosApiError);
  });
});
