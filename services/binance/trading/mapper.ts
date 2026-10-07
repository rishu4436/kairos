import {
  DOCUMENTED_QUOTE_TTL_MS,
  type QuoteResult,
  type Route,
  type SwapPreview,
  type TransactionBuildResult,
} from "@/domain/execution-prep";

export interface QuoteRoutePayload {
  quoteId?: unknown;
  vendorName?: unknown;
  binanceChainId?: unknown;
  fromTokenAmount?: unknown;
  toTokenAmount?: unknown;
  tradeFee?: unknown;
  priceImpactPercent?: unknown;
  executionMode?: unknown;
}

export interface SwapPayload {
  tx?: unknown;
  executionMode?: unknown;
  quoteId?: unknown;
}

export interface SwapTxPayload {
  from?: unknown;
  to?: unknown;
  data?: unknown;
  value?: unknown;
  gas?: unknown;
  gasPrice?: unknown;
  maxPriorityFeePerGas?: unknown;
  minReceiveAmount?: unknown;
  slippagePercent?: unknown;
}

export function mapQuoteRoute(
  route: QuoteRoutePayload,
  input: { inputAsset: string; outputAsset: string; createdAtMs: number; responseTimestamp: number | null },
): QuoteResult | null {
  const quoteId = text(route.quoteId);
  if (quoteId === null) {
    return null;
  }
  const createdAt = new Date(input.createdAtMs).toISOString();
  const mapped: Route = {
    quoteId,
    vendorName: text(route.vendorName),
    executionMode: text(route.executionMode),
  };
  return {
    status: "VALID",
    quoteId,
    route: mapped,
    inputAsset: input.inputAsset,
    outputAsset: input.outputAsset,
    inputAmount: text(route.fromTokenAmount),
    expectedOutput: text(route.toTokenAmount),
    executionPrice: null,
    priceImpact: nullableText(route.priceImpactPercent),
    slippage: null,
    fees: nullableText(route.tradeFee),
    expiresAt: new Date(input.createdAtMs + DOCUMENTED_QUOTE_TTL_MS).toISOString(),
    source: mapped.vendorName,
    timestamp: input.responseTimestamp === null ? null : new Date(input.responseTimestamp).toISOString(),
    createdAt,
    reason: null,
  };
}

export function toSwapPreview(quote: QuoteResult): SwapPreview | null {
  if (quote.quoteId === null) {
    return null;
  }
  return {
    quoteId: quote.quoteId,
    vendorName: quote.route?.vendorName ?? null,
    executionMode: quote.route?.executionMode ?? null,
    inputAmount: quote.inputAmount,
    expectedOutput: quote.expectedOutput,
    priceImpact: quote.priceImpact,
    fees: quote.fees,
  };
}

export function mapSwapBuild(payload: SwapPayload, quoteId: string, chainId: string): TransactionBuildResult {
  const tx = isRecord(payload.tx) ? (payload.tx as SwapTxPayload) : null;
  return {
    chainId: text(chainId),
    from: tx ? text(tx.from) : null,
    to: tx ? text(tx.to) : null,
    data: tx ? text(tx.data) : null,
    value: tx ? text(tx.value) : null,
    gas: tx ? nullableText(tx.gas) : null,
    gasPrice: tx ? nullableText(tx.gasPrice) : null,
    maxPriorityFeePerGas: tx ? nullableText(tx.maxPriorityFeePerGas) : null,
    minReceiveAmount: tx ? nullableText(tx.minReceiveAmount) : null,
    slippagePercent: tx ? nullableText(tx.slippagePercent) : null,
    executionMode: text(payload.executionMode),
    quoteId,
    requestId: null,
  };
}

export function quoteExpired(expiresAt: string, nowMs: number): boolean {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || nowMs >= expiry;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return text(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
