import { describe, expect, it } from "vitest";
import { PRODUCTION_CHAIN_ID } from "@/domain/network";
import {
  admitWatchlistItem,
  configuredWatchlist,
  createUserWatchlist,
  emptyWatchlist,
  LOCAL_RUNTIME_USER_ID,
  DEMO_USER_ID,
  normalizeTickers,
  platformLabel,
} from "@/domain/watchlist";

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
    expect(first.items.every((item) => item.chainId === PRODUCTION_CHAIN_ID && item.enabled)).toBe(true);
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

  it("admits listed assets and rejects unlisted, disabled, wrong-chain, and invalid contracts", () => {
    const universe = configuredWatchlist();
    expect(admitWatchlistItem(universe, { ticker: "TSLA" }).ok).toBe(true);
    expect(admitWatchlistItem(universe, { ticker: "XYZ" }).ok).toBe(false);
    expect(admitWatchlistItem(universe, { ticker: "TSLA", enabled: false }).ok).toBe(false);
    expect(admitWatchlistItem(universe, { ticker: "TSLA", chainId: "97" }).ok).toBe(false);
    expect(admitWatchlistItem(universe, { ticker: "TSLA", chainId: "56", contractAddress: "not-an-address" }).ok).toBe(false);
    expect(emptyWatchlist("user_a").tickers).toEqual([]);
    expect(admitWatchlistItem(emptyWatchlist("user_a"), { ticker: "TSLA" })).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("keeps persisted local runtime user id as the legacy literal", () => {
    expect(LOCAL_RUNTIME_USER_ID).toBe("user_demo");
    expect(DEMO_USER_ID).toBe("user_demo");
    expect(configuredWatchlist().userId).toBe("user_demo");
  });
});
