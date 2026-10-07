/** Official quote TTL. The quote response does not return an expiry field. */
export const DOCUMENTED_QUOTE_TTL_MS = 30_000;

/** BSC USDT contract cited in the Trading API examples. */
export const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

export const BSC_CHAIN_ID = "56";

export type QuoteStatus = "VALID" | "EXPIRED" | "INVALID" | "ERROR";

export type PreparationState =
  | "QUOTE_PENDING"
  | "QUOTE_RECEIVED"
  | "QUOTE_REJECTED"
  | "TRANSACTION_BUILD_PENDING"
  | "TRANSACTION_BUILT"
  | "SIMULATION_PENDING"
  | "TRANSACTION_SIMULATED"
  | "TRANSACTION_REJECTED";

export interface QuoteRequest {
  binanceChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  /** Smallest-unit integer string, as required by GET /quote. */
  amount: string;
  userWalletAddress: string;
  /** Percentage string sent to /swap. One of slippagePercent or autoSlippage is required there. */
  slippagePercent: string;
}

export interface Route {
  quoteId: string;
  vendorName: string | null;
  executionMode: string | null;
}

export interface QuoteResult {
  status: QuoteStatus;
  quoteId: string | null;
  route: Route | null;
  inputAsset: string | null;
  outputAsset: string | null;
  inputAmount: string | null;
  expectedOutput: string | null;
  /** The quote schema does not return an execution price. */
  executionPrice: null;
  priceImpact: string | null;
  /** Slippage is a /swap input, not a /quote output. */
  slippage: null;
  fees: string | null;
  /** Derived from the documented 30s TTL. The payload does not include this field. */
  expiresAt: string;
  source: string | null;
  timestamp: string | null;
  createdAt: string;
  reason: string | null;
}

export interface SwapPreview {
  quoteId: string;
  vendorName: string | null;
  executionMode: string | null;
  inputAmount: string | null;
  expectedOutput: string | null;
  priceImpact: string | null;
  fees: string | null;
}

export interface TransactionBuildResult {
  chainId: string | null;
  from: string | null;
  to: string | null;
  data: string | null;
  value: string | null;
  gas: string | null;
  gasPrice: string | null;
  maxPriorityFeePerGas: string | null;
  minReceiveAmount: string | null;
  slippagePercent: string | null;
  executionMode: string | null;
  quoteId: string | null;
  /** /swap does not return a separate request id. */
  requestId: null;
}

export type SimulationOutcome = "PASS" | "FAIL" | "UNKNOWN";

export interface SimulationResult {
  outcome: SimulationOutcome;
  /** The simulate response does not return an id. */
  simulationId: null;
  timestamp: string | null;
  gas: null;
  failureReason: string | null;
  status: string | null;
  errorCategory: string | null;
}

export interface WalletBalance {
  chainId: string | null;
  contractAddress: string | null;
  symbol: string | null;
  amount: string | null;
  riskFlagged: boolean | null;
}

export interface WalletPosition {
  chainId: string | null;
  contractAddress: string | null;
  symbol: string | null;
  amount: string | null;
}

export interface WalletPortfolio {
  address: string;
  balances: readonly WalletBalance[];
  positions: readonly WalletPosition[];
  /** The balance endpoint used here does not return a portfolio USD total. */
  exposureUsd: null;
}

export interface PreparationRecord {
  state: PreparationState;
  reason: string | null;
  quote: QuoteResult | null;
  build: TransactionBuildResult | null;
  simulation: SimulationResult | null;
  broadcast: false;
  signature: null;
}
