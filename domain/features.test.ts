import { describe, expect, it } from "vitest";
import { scaleDecimal } from "@/domain/candle";
import { computeFeatures, ema, featureById, simpleReturnBps, sma } from "@/domain/features";
import { candlesFromCloses } from "@/test/candles";

describe("feature engine", () => {
  it("computes a one-bar return and a simple average", () => {
    expect(simpleReturnBps(scaleDecimal("101") ?? 0n, scaleDecimal("100") ?? 0n)).toBe(100n);
    const average = sma(candlesFromCloses(["10", "11", "12", "13", "14"]), 5);
    expect(average).toBe(scaleDecimal("12"));
  });

  it("computes an EMA from an SMA seed", () => {
    const value = ema(candlesFromCloses(["10", "10", "10", "14"]), 3);
    expect(value).toBe(scaleDecimal("12"));
  });

  it("does not treat missing history as zero", () => {
    const set = computeFeatures({ candles: [], asOf: "2026-10-03T00:00:00.000Z", referenceDeviationBps: null, freshnessLabel: null });
    expect(set.features.every((feature) => feature.value === null && feature.sufficient === false)).toBe(true);
    const one = computeFeatures({
      candles: candlesFromCloses(["100"]),
      asOf: "2026-10-03T00:00:00.000Z",
      referenceDeviationBps: null,
      freshnessLabel: "FRESH",
    });
    expect(featureById(one.features, "return_15m")?.value).toBeNull();
    expect(featureById(one.features, "data_freshness")?.value).toBe("FRESH");
  });

  it("leaves volume change unknown when the previous volume is zero", () => {
    const candles = candlesFromCloses(["100", "101"], "0");
    candles[1].volume = scaleDecimal("10");
    const set = computeFeatures({
      candles,
      asOf: "2026-10-03T00:00:00.000Z",
      referenceDeviationBps: null,
      freshnessLabel: "FRESH",
    });
    const change = featureById(set.features, "volume_change");
    expect(change?.sufficient).toBe(false);
    expect(change?.value).toBeNull();
    expect(change?.note).toMatch(/zero/);
  });

  it("returns null when the prior close is zero", () => {
    expect(simpleReturnBps(scaleDecimal("5") ?? 0n, 0n)).toBeNull();
  });
});
