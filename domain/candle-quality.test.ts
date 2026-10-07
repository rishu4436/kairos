import { describe, expect, it } from "vitest";
import { scaleDecimal } from "@/domain/candle";
import { classifyCandleBar, classifySeries } from "@/domain/candle-quality";
import { assessDataQuality } from "@/domain/quality";
import { mapCandles } from "@/services/binance/market/mapper";

function bar(open: string, high: string, low: string, close: string, ts = 1_700_000_000_000) {
  return {
    timestampMs: ts,
    open: scaleDecimal(open)!,
    high: scaleDecimal(high)!,
    low: scaleDecimal(low)!,
    close: scaleDecimal(close)!,
    volume: scaleDecimal("10"),
    tradeCount: 1,
  };
}

describe("candle quality", () => {
  it("enforces OHLC invariants", () => {
    expect(classifyCandleBar(bar("10", "11", "9", "10.5")).classification).toBe("VALID");
    expect(classifyCandleBar(bar("10", "9", "8", "9")).classification).toBe("INVALID");
    expect(classifyCandleBar(bar("10", "12", "11", "11")).classification).toBe("INVALID");
  });

  it("classifies the documented extreme wick as suspicious and never GOOD", () => {
    const extreme = bar("380", "16044", "370", "380");
    expect(classifyCandleBar(extreme).classification).toBe("SUSPICIOUS");
    expect(classifySeries([extreme])).toBe("SUSPICIOUS");
    const quality = assessDataQuality({
      historyPoints: 48,
      requiredPoints: 21,
      freshness: "FRESH",
      latestAgeMs: 1_000,
      referenceAgeMs: 1_000,
      missingFields: [],
      fidelity: "live",
      barClass: "SUSPICIOUS",
    });
    expect(quality.status).toBe("DEGRADED");
    expect(quality.status).not.toBe("GOOD");
  });

  it("drops invalid rows from market mapping and counts suspicious extremes", () => {
    const mapped = mapCandles([
      [380, 16044, 370, 380, 10, 1_700_000_000_000, 1],
      [10, 9, 8, 9, 10, 1_700_000_000_001, 1],
      [1, 1.1, 0.9, 1.05, 10, 1_700_000_000_002, 1],
    ]);
    expect(mapped.rejected).toBe(1);
    expect(mapped.suspicious).toBe(1);
    expect(mapped.candles).toHaveLength(2);
  });
});
