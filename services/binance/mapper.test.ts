import { describe, expect, it } from "vitest";
import { DEFAULT_FRESHNESS_POLICY } from "@/domain/freshness";
import { mapRepresentation } from "@/services/binance/mapper";
import type { BinanceListedToken, BinanceRwaPrice, BinanceSearchAsset } from "@/services/binance/types";

const receivedAtMs = 1_779_111_060_000;

const asset: BinanceSearchAsset = {
  platformId: "ondo",
  binanceChainId: "56",
  tokenContractAddress: "0xabc",
  tokenSymbol: "NVDAon",
  assetType: 1,
};

const listed: BinanceListedToken = {
  binanceChainId: "56",
  tokenContractAddress: "0xabc",
  tokenName: "NVIDIA Ondo",
  decimals: "18",
  tokenToShareRatio: "1.000000",
  volume24H: "1200.50",
  marketCap: "10",
  statusInfo: {
    openState: false,
    marketStatus: "closed",
    reasonCode: "MARKET_CLOSED",
    reasonMsg: "Weekend or Holiday",
    nextOpenTime: 1_779_111_060_000,
    nextCloseTime: null,
  },
};

const price: BinanceRwaPrice = {
  binanceChainId: "56",
  tokenContractAddress: "0xabc",
  platformId: "ondo",
  tokenPrice: "101.00",
  referencePrice: "100.00",
  tokenPriceUpdatedAt: receivedAtMs - 4_000,
};

describe("Binance response mapping", () => {
  it("maps a tokenized representation without leaking transport field names", () => {
    const mapped = mapRepresentation({
      userId: "user_demo",
      draft: { ticker: "NVDA", companyName: "NVIDIA", asset },
      listed,
      price,
      platform: { platformId: "ondo", website: "https://ondo.finance", logoUrl: null },
      receivedAtMs,
      policy: DEFAULT_FRESHNESS_POLICY,
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) {
      return;
    }
    expect(mapped.observation.underlying).toEqual({ ticker: "NVDA", name: "NVIDIA", kind: "stock" });
    expect(mapped.observation.representation.platformLabel).toBe("Ondo Finance");
    expect(mapped.observation.representation.chainLabel).toBe("BNB Smart Chain");
    expect(mapped.observation.representation.contractAddress).toBe("0xabc");
    expect(mapped.observation.priceDeviation).toEqual({ percent: 1, label: "reference_deviation" });
    expect(mapped.observation.change24hPct).toBeNull();
    expect(mapped.observation.marketSession).toBe("CLOSED");
    expect(mapped.observation.freshness.status).toBe("FRESH");
    expect(mapped.observation.nextOpenAt).toBe(new Date(1_779_111_060_000).toISOString());
    expect(mapped.observation.liquidity.volume24hUsd).toBe("1200.50");
    expect("binanceChainId" in mapped.observation.representation).toBe(false);
  });

  it("rejects a search row that is missing a contract address", () => {
    const mapped = mapRepresentation({
      userId: "user_demo",
      draft: { ticker: "NVDA", companyName: "NVIDIA", asset: { ...asset, tokenContractAddress: " " } },
      listed: null,
      price: null,
      platform: null,
      receivedAtMs,
      policy: DEFAULT_FRESHNESS_POLICY,
    });
    expect(mapped.ok).toBe(false);
  });

  it("does not invent a deviation from a non-numeric price", () => {
    const mapped = mapRepresentation({
      userId: "user_demo",
      draft: { ticker: "NVDA", companyName: "NVIDIA", asset },
      listed,
      price: { ...price, tokenPrice: "not-a-price", referencePrice: "100" },
      platform: null,
      receivedAtMs,
      policy: DEFAULT_FRESHNESS_POLICY,
    });
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.observation.price).toBeNull();
      expect(mapped.observation.priceDeviation).toBeNull();
    }
  });
});
