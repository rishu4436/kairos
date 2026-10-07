import { describe, expect, it } from "vitest";
import { createUserWatchlist, normalizeTickers, platformLabel } from "@/domain/watchlist";

describe("watchlist normalization", () => {
  it("trims, uppercases, and drops duplicates without sharing state between users", () => {
    expect(normalizeTickers([" nvda ", "NVDA", "tsla"])).toEqual({
      tickers: ["NVDA", "TSLA"],
      rejected: [],
    });
    const first = createUserWatchlist("user_a", ["NVDA", "TSLA"]);
    const second = createUserWatchlist("user_b", ["AAPL", "MSFT", "AMD"]);
    expect(first.userId).toBe("user_a");
    expect(second.userId).toBe("user_b");
    expect(first.id).not.toBe(second.id);
    expect(first.tickers).toEqual(["NVDA", "TSLA"]);
    expect(second.tickers).toEqual(["AAPL", "MSFT", "AMD"]);
  });

  it("rejects tickers that are not symbols and unknown platforms stay literal", () => {
    expect(normalizeTickers(["NVDA", "not a ticker"])).toEqual({
      tickers: ["NVDA"],
      rejected: ["not a ticker"],
    });
    expect(() => createUserWatchlist("user_a", ["bad ticker"])).toThrow(/invalid tickers/);
    expect(platformLabel("ondo")).toBe("Ondo Finance");
    expect(platformLabel("bstock")).toBe("bStocks");
    expect(platformLabel("xstock")).toBe("xstock");
  });
});
