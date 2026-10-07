import type { QuoteRequest, QuoteResult, TransactionBuildResult } from "@/domain/execution-prep";
import { BinanceWeb3Client } from "@/services/binance/client";
import { mapQuoteRoute, mapSwapBuild, type QuoteRoutePayload, type SwapPayload } from "@/services/binance/trading/mapper";

const QUOTE_PATH = "/api/v1/dex/aggregator/quote";
const SWAP_PATH = "/api/v1/dex/aggregator/swap";

export interface QuoteGateway {
  quote(request: QuoteRequest, nowMs: number): Promise<QuoteResult>;
  build(request: QuoteRequest, quoteId: string): Promise<TransactionBuildResult>;
}

export class BinanceQuoteGateway implements QuoteGateway {
  constructor(private readonly client: BinanceWeb3Client) {}

  async quote(request: QuoteRequest, nowMs: number): Promise<QuoteResult> {
    const result = await this.client.get<QuoteRoutePayload[]>(QUOTE_PATH, {
      binanceChainId: request.binanceChainId,
      fromTokenAddress: request.fromTokenAddress,
      toTokenAddress: request.toTokenAddress,
      amount: request.amount,
      userWalletAddress: request.userWalletAddress,
    });
    const routes = Array.isArray(result.data) ? result.data : [];
    const first = routes[0];
    const mapped = first
      ? mapQuoteRoute(first, {
          inputAsset: request.fromTokenAddress,
          outputAsset: request.toTokenAddress,
          createdAtMs: nowMs,
          responseTimestamp: result.responseTimestamp,
        })
      : null;
    if (!mapped) {
      return {
        status: "INVALID",
        quoteId: null,
        route: null,
        inputAsset: request.fromTokenAddress,
        outputAsset: request.toTokenAddress,
        inputAmount: request.amount,
        expectedOutput: null,
        executionPrice: null,
        priceImpact: null,
        slippage: null,
        fees: null,
        expiresAt: new Date(nowMs).toISOString(),
        source: null,
        timestamp: null,
        createdAt: new Date(nowMs).toISOString(),
        reason: "The quote response did not include a route.",
      };
    }
    return mapped;
  }

  async build(request: QuoteRequest, quoteId: string): Promise<TransactionBuildResult> {
    const result = await this.client.get<SwapPayload>(SWAP_PATH, {
      binanceChainId: request.binanceChainId,
      quoteId,
      fromTokenAddress: request.fromTokenAddress,
      toTokenAddress: request.toTokenAddress,
      amount: request.amount,
      userWalletAddress: request.userWalletAddress,
      slippagePercent: request.slippagePercent,
    });
    return mapSwapBuild(result.data, quoteId, request.binanceChainId);
  }
}
