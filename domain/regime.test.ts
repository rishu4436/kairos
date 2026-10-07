import { describe, expect, it } from "vitest";
import { classifyRegime } from "@/domain/regime";
import { candlesFromCloses } from "@/test/candles";

describe("market regime", () => {
  it("stays unknown without enough candles", () => {
    const regime = classifyRegime(candlesFromCloses(["100", "101"]), "2026-10-03T00:00:00.000Z");
    expect(regime.regime).toBe("UNKNOWN");
    expect(regime.sufficient).toBe(false);
  });

  it("classifies a flat series as low volatility", () => {
    const regime = classifyRegime(candlesFromCloses(Array.from({ length: 30 }, () => "100")), "2026-10-03T00:00:00.000Z");
    expect(regime.regime).toBe("LOW_VOLATILITY");
  });

  it("classifies a steady climb as trending up", () => {
    const closes = Array.from({ length: 30 }, (_, index) => (100 + index * 0.15).toFixed(2));
    const regime = classifyRegime(candlesFromCloses(closes), "2026-10-03T00:00:00.000Z");
    expect(regime.regime).toBe("TRENDING_UP");
  });

  it("classifies wide alternation as high volatility", () => {
    const closes = Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? "100" : "103"));
    const regime = classifyRegime(candlesFromCloses(closes), "2026-10-03T00:00:00.000Z");
    expect(regime.regime).toBe("HIGH_VOLATILITY");
  });
});
