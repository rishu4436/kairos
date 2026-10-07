import type { BinanceWeb3Client } from "@/services/binance/client";
import { getRwaPrices, listRwaPlatforms, listRwaTokens, searchRwaTokens } from "@/services/binance/rwa-data";
import type { BinanceListedToken, BinancePlatform, BinanceRwaPrice, BinanceSearchHit } from "@/services/binance/types";

export interface RwaGateway {
  listPlatforms(signal?: AbortSignal): Promise<BinancePlatform[]>;
  search(keyword: string, signal?: AbortSignal): Promise<BinanceSearchHit[]>;
  listTokens(chainId: string, signal?: AbortSignal): Promise<BinanceListedToken[]>;
  getPrices(chainId: string, addresses: readonly string[], signal?: AbortSignal): Promise<BinanceRwaPrice[]>;
}

export function createBinanceGateway(client: BinanceWeb3Client): RwaGateway {
  return {
    listPlatforms: (signal) => listRwaPlatforms(client, signal),
    search: (keyword, signal) => searchRwaTokens(client, keyword, signal),
    listTokens: (chainId, signal) => listRwaTokens(client, chainId, signal),
    getPrices: (chainId, addresses, signal) => getRwaPrices(client, chainId, addresses, signal),
  };
}
