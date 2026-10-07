import {
  BSC_CHAIN_ID,
  BSC_USDT_CONTRACT,
  type PreparationRecord,
  type QuoteRequest,
  type QuoteResult,
  type SimulationResult,
  type TransactionBuildResult,
} from "@/domain/execution-prep";
import {
  admitLiveCapability,
  type LiveExecutionCapability,
} from "@/domain/execution-authority";
import type { Scaled } from "@/domain/money";
import { assertWalletUse } from "@/domain/wallet-scope";
import { normalizeExecutionError } from "@/execution/errors";
import { quoteExpired } from "@/services/binance/trading/mapper";
import type { QuoteGateway } from "@/services/binance/trading/gateway";
import { refuseBroadcast, type TransactionSimulationGateway } from "@/services/binance/transaction/gateway";

export interface PreparationInput {
  capability: LiveExecutionCapability;
  userId: string;
  agentId: string;
  nowMs: number;
  riskPassed: boolean;
  side: "BUY" | "SELL";
  /** Scaled quantity or notional. Decimals come from the token listing, not a guess. */
  amount: Scaled;
  stockContract: string | null;
  stockDecimals: number | null;
  usdtDecimals: number | null;
  accountUserId: string;
  chainId: string;
  walletAddress: string | null;
  maxSlippageBps: number;
  quote: QuoteGateway;
  simulation: TransactionSimulationGateway;
}

export async function prepareLiveExecution(input: PreparationInput): Promise<PreparationRecord> {
  const admitted = admitLiveCapability(input.capability, {
    userId: input.userId,
    agentId: input.agentId,
    nowMs: input.nowMs,
  });
  if (!admitted.ok) {
    return stopped("QUOTE_REJECTED", admitted.code, null, null, null);
  }
  if (!input.riskPassed) {
    return stopped("QUOTE_REJECTED", "Risk did not pass. No quote was requested.", null, null, null);
  }
  const walletCode = assertWalletUse({
    userId: input.userId,
    accountUserId: input.accountUserId,
    address: input.walletAddress,
    chainId: input.chainId,
  });
  if (walletCode !== null) {
    return stopped("QUOTE_REJECTED", walletCode, null, null, null);
  }
  const request = buildQuoteRequest(input);
  if (typeof request === "string") {
    return stopped("QUOTE_REJECTED", request, null, null, null);
  }
  let quote: QuoteResult;
  try {
    quote = await input.quote.quote(request, input.nowMs);
  } catch (error) {
    const code = normalizeExecutionError(error);
    return stopped("QUOTE_REJECTED", code === "UNKNOWN_ERROR" ? "QUOTE_UNAVAILABLE" : code, null, null, null);
  }
  if (quote.status !== "VALID" || quote.quoteId === null) {
    return stopped("QUOTE_REJECTED", quote.reason ?? "The quote was not usable.", quote, null, null);
  }
  const slippage = slippageGate(quote.priceImpact, input.maxSlippageBps);
  if (slippage !== null) {
    return stopped("QUOTE_REJECTED", slippage, { ...quote, status: "INVALID", reason: slippage }, null, null);
  }
  if (quoteExpired(quote.expiresAt, input.nowMs)) {
    return stopped("QUOTE_REJECTED", "QUOTE_EXPIRED", { ...quote, status: "EXPIRED", reason: "QUOTE_EXPIRED" }, null, null);
  }
  let build: TransactionBuildResult;
  try {
    build = await input.quote.build(request, quote.quoteId);
  } catch (error) {
    const code = normalizeExecutionError(error);
    return stopped("TRANSACTION_REJECTED", code === "UNKNOWN_ERROR" ? "TRANSACTION_BUILD_FAILED" : code, quote, null, null);
  }
  if (quoteExpired(quote.expiresAt, input.nowMs)) {
    return stopped("QUOTE_REJECTED", "QUOTE_EXPIRED", { ...quote, status: "EXPIRED", reason: "QUOTE_EXPIRED" }, build, null);
  }
  const simulation = await input.simulation.simulate(build, request.binanceChainId);
  if (simulation.outcome !== "PASS") {
    return stopped("TRANSACTION_REJECTED", "SIMULATION_FAILED", quote, build, simulation);
  }
  return {
    state: "TRANSACTION_SIMULATED",
    reason: null,
    quote,
    build,
    simulation,
    broadcast: false,
    signature: null,
  };
}

export function refuseLiveSigning(): { code: "EXECUTION_NOT_AVAILABLE"; broadcast: false; signature: null } {
  return refuseBroadcast();
}

function slippageGate(priceImpact: string | null, maxSlippageBps: number): string | null {
  if (priceImpact === null) {
    return "PRICE_IMPACT_UNAVAILABLE";
  }
  const impact = Number(priceImpact);
  if (!Number.isFinite(impact)) {
    return "PRICE_IMPACT_UNAVAILABLE";
  }
  const limitPercent = maxSlippageBps / 100;
  if (impact > limitPercent) {
    return "SLIPPAGE_LIMIT_EXCEEDED";
  }
  return null;
}

function buildQuoteRequest(input: PreparationInput): QuoteRequest | string {
  if (input.chainId !== BSC_CHAIN_ID) {
    return "INVALID_REQUEST";
  }
  if (input.walletAddress === null || !/^0x[0-9a-fA-F]{40}$/.test(input.walletAddress)) {
    return "WALLET_UNAVAILABLE";
  }
  if (input.stockContract === null) {
    return "The stock token contract is not available.";
  }
  const decimals = input.side === "BUY" ? input.usdtDecimals : input.stockDecimals;
  if (decimals === null) {
    return "Token decimals were not provided. The amount was not converted.";
  }
  const amount = toSmallestUnit(input.amount, decimals);
  if (amount === null || amount === "0") {
    return "The amount is not a positive smallest-unit integer.";
  }
  const fromTokenAddress = input.side === "BUY" ? BSC_USDT_CONTRACT : input.stockContract;
  const toTokenAddress = input.side === "BUY" ? input.stockContract : BSC_USDT_CONTRACT;
  return {
    binanceChainId: BSC_CHAIN_ID,
    fromTokenAddress,
    toTokenAddress,
    amount,
    userWalletAddress: input.walletAddress,
    slippagePercent: slippagePercent(input.maxSlippageBps),
  };
}

export function toSmallestUnit(scaled: bigint, decimals: number): string | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || scaled <= 0n) {
    return null;
  }
  const scale = 6;
  if (decimals >= scale) {
    return (scaled * 10n ** BigInt(decimals - scale)).toString();
  }
  const divisor = 10n ** BigInt(scale - decimals);
  if (scaled % divisor !== 0n) {
    return null;
  }
  return (scaled / divisor).toString();
}

export function slippagePercent(maxSlippageBps: number): string {
  if (!Number.isFinite(maxSlippageBps) || maxSlippageBps < 0) {
    return "0";
  }
  const whole = Math.trunc(maxSlippageBps / 100);
  const fraction = Math.trunc(maxSlippageBps % 100);
  if (fraction === 0) {
    return String(whole);
  }
  return `${whole}.${String(fraction).padStart(2, "0")}`.replace(/0$/, "");
}

function stopped(
  state: PreparationRecord["state"],
  reason: string,
  quote: QuoteResult | null,
  build: TransactionBuildResult | null,
  simulation: SimulationResult | null,
): PreparationRecord {
  return { state, reason, quote, build, simulation, broadcast: false, signature: null };
}
