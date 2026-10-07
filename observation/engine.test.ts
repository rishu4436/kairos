import { describe, expect, it } from "vitest";
import { demoWatchlist } from "@/domain/watchlist";
import { observeWatchlist } from "@/observation/engine";
import type { RwaGateway } from "@/services/binance/gateway";
import type { BinanceListedToken, BinanceRwaPrice, BinanceSearchHit } from "@/services/binance/types";

const listed: BinanceListedToken = {
  binanceChainId: "56",
  tokenContractAddress: "0xaaa",
  tokenName: "NVIDIA token",
  decimals: "18",
  volume24H: "10",
  marketCap: "20",
  statusInfo: {
    openState: true,
    marketStatus: "regular",
    reasonCode: "TRADING",
    reasonMsg: null,
    nextOpenTime: null,
    nextCloseTime: 1_779_134_340_000,
  },
};

const price: BinanceRwaPrice = {
  binanceChainId: "56",
  tokenContractAddress: "0xaaa",
  platformId: "bstock",
  tokenPrice: "184.10",
  referencePrice: "184.00",
  tokenPriceUpdatedAt: 1_700_000_000_000,
};

function gateway(): RwaGateway {
  const hits: Record<string, BinanceSearchHit[]> = {
    NVDA: [
      {
        ticker: "NVDA",
        companyName: "NVIDIA Corporation",
        assets: [
          { platformId: "bstock", binanceChainId: "56", tokenContractAddress: "0xaaa", tokenSymbol: "NVDAB", assetType: 1 },
          { platformId: "ondo", binanceChainId: "56", tokenContractAddress: "0xbbb", tokenSymbol: "NVDAon", assetType: 1 },
          { platformId: "ondo", binanceChainId: "56", tokenSymbol: "missing" },
        ],
      },
    ],
    TSLA: [{ ticker: "TSL", companyName: "Not Tesla", assets: [] }],
  };
  return {
    async listPlatforms() {
      return [{ platformId: "bstock", website: "https://example.invalid", logoUrl: null }];
    },
    async search(keyword: string) {
      return hits[keyword] ?? [];
    },
    async listTokens() {
      return [listed];
    },
    async getPrices() {
      return [price];
    },
  };
}

describe("observation engine", () => {
  it("resolves only exact tickers and keeps each representation", async () => {
    const watchlist = demoWatchlist("user_demo");
    const run = await observeWatchlist({
      watchlist: { ...watchlist, tickers: ["NVDA", "TSLA"] },
      gateway: gateway(),
      receivedAtMs: 1_700_000_004_000,
      policy: { freshMaxMs: 30_000, agingMaxMs: 120_000 },
    });
    expect(run.observations.map((item) => item.representation.tokenSymbol).sort()).toEqual(["NVDAB", "NVDAon"]);
    expect(run.observations[0]?.underlying.ticker).toBe("NVDA");
    expect(run.observations.find((item) => item.representation.tokenSymbol === "NVDAB")?.marketSession).toBe("OPEN");
    expect(run.unresolved.some((item) => item.ticker === "TSLA")).toBe(true);
    expect(run.unresolved.some((item) => item.reason.includes("contract"))).toBe(true);
    expect(run.observations.every((item) => item.userId === "user_demo")).toBe(true);
  });
});
