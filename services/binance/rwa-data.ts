import type { BinanceWeb3Client } from "@/services/binance/client";
import type { BinanceListedToken, BinancePlatform, BinanceRwaPrice, BinanceSearchHit } from "@/services/binance/types";

const SEARCH = "/api/v1/dex/market/rwa/search";
const PLATFORMS = "/api/v1/dex/market/rwa/platforms";
const TOKENS = "/api/v1/dex/market/rwa/tokens";
const PRICE = "/api/v1/dex/market/rwa/price";

export const RWA_ENDPOINTS = { SEARCH, PLATFORMS, TOKENS, PRICE } as const;

export async function searchRwaTokens(
  client: BinanceWeb3Client,
  keyword: string,
  signal?: AbortSignal,
): Promise<BinanceSearchHit[]> {
  const result = await client.get<BinanceSearchHit[]>(SEARCH, { keyword }, signal);
  return asArray(result.data);
}

export async function listRwaPlatforms(
  client: BinanceWeb3Client,
  signal?: AbortSignal,
): Promise<BinancePlatform[]> {
  const result = await client.get<BinancePlatform[]>(PLATFORMS, {}, signal);
  return asArray(result.data);
}

export async function listRwaTokens(
  client: BinanceWeb3Client,
  binanceChainId: string,
  signal?: AbortSignal,
): Promise<BinanceListedToken[]> {
  const result = await client.get<BinanceListedToken[]>(TOKENS, { binanceChainId }, signal);
  return asArray(result.data);
}

const PRICE_BATCH = 100;

export async function getRwaPrices(
  client: BinanceWeb3Client,
  binanceChainId: string,
  tokenContractAddresses: readonly string[],
  signal?: AbortSignal,
): Promise<BinanceRwaPrice[]> {
  const prices: BinanceRwaPrice[] = [];
  for (let index = 0; index < tokenContractAddresses.length; index += PRICE_BATCH) {
    const batch = tokenContractAddresses.slice(index, index + PRICE_BATCH);
    const result = await client.get<BinanceRwaPrice[]>(
      PRICE,
      { binanceChainId, tokenContractAddresses: batch.join(",") },
      signal,
    );
    prices.push(...asArray(result.data));
  }
  return prices;
}

function asArray<T>(value: T[] | T): T[] {
  return Array.isArray(value) ? value : [];
}
