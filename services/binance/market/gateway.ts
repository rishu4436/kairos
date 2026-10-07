import type { Candle } from "@/domain/candle";
import { BinanceWeb3Client } from "@/services/binance/client";
import { mapCandles } from "@/services/binance/market/mapper";
import { MARKET_BAR, CANDLE_LIMIT } from "@/strategies/parameters";

export interface CandleQuery {
  binanceChainId: string;
  tokenContractAddress: string;
  bar?: typeof MARKET_BAR;
  limit?: number;
}

export interface MarketCandleGateway {
  getCandles(query: CandleQuery, signal?: AbortSignal): Promise<Candle[]>;
}

export const CANDLE_ENDPOINT = "/api/v1/dex/market/candles";

export function createMarketCandleGateway(client: BinanceWeb3Client): MarketCandleGateway {
  return {
    async getCandles(query, signal) {
      const limit = query.limit ?? CANDLE_LIMIT;
      const result = await client.get<unknown>(
        CANDLE_ENDPOINT,
        {
          binanceChainId: query.binanceChainId,
          tokenContractAddress: query.tokenContractAddress,
          bar: query.bar ?? MARKET_BAR,
          limit: String(limit),
        },
        signal,
      );
      return mapCandles(result.data).candles;
    },
  };
}
