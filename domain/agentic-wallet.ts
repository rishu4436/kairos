export const WALLET_CONNECTION_STATUSES = ["UNCONNECTED", "CREATING", "CONNECTED"] as const;
export type WalletConnectionStatus = (typeof WALLET_CONNECTION_STATUSES)[number];

/** Documented `abnormalTxnHandling` values. There is no third mode. */
export const HIGH_RISK_HANDLING = ["AutoReject", "NeedConfirmation"] as const;
export type HighRiskHandling = (typeof HIGH_RISK_HANDLING)[number];

export const LIVE_EXECUTION_PHASES = [
  "READY_FOR_WALLET",
  "WALLET_PRECHECK",
  "WALLET_EXECUTION",
  "SUBMITTED",
  "VERIFYING",
  "CONFIRMED",
  "WALLET_POLICY_BLOCKED",
  "EXECUTION_REJECTED",
  "EXECUTION_ERROR",
  "VERIFICATION_FAILED",
] as const;
export type LiveExecutionPhase = (typeof LIVE_EXECUTION_PHASES)[number];

export interface AgenticWalletSecurityPolicy {
  dailyLimit: number | null;
  quotaUsed: number | null;
  quotaLeft: number | null;
  quotaDate: string | null;
  tradeAllTokens: boolean | null;
  /** Null when the wallet did not return a documented value. */
  highRiskHandling: HighRiskHandling | null;
}

export interface AgenticChain {
  binanceChainId: string;
  name: string;
}

/**
 * One user's wallet view. `accountId` stays null because `wallet status` does not return one.
 * This object never contains key material.
 */
export interface AgenticWalletAccount {
  userId: string;
  agentId: string;
  provider: "binance-agentic-wallet";
  accountId: null;
  walletAddress: string | null;
  supportedChains: readonly AgenticChain[];
  connectionStatus: WalletConnectionStatus;
  securityPolicy: AgenticWalletSecurityPolicy | null;
  lastUpdated: string;
}

export interface AgenticTokenBalance {
  symbol: string | null;
  contractAddress: string | null;
  chainId: string | null;
  amount: string | null;
  valueUsd: string | null;
}

export interface AgenticWalletExecutionResult {
  status: "SUBMITTED" | "CONFIRMED" | "REJECTED" | "REQUIRES_CONFIRMATION" | "ERROR";
  walletAddress: string | null;
  transactionHash: string | null;
  orderId: string | null;
  timestamp: string | null;
  broadcasted: boolean;
  chainId: string | null;
  errorCategory: string | null;
  /** Non-secret fields echoed from the CLI. */
  providerMetadata: Readonly<Record<string, string | null>>;
}

export interface WalletPolicyDecision {
  allowed: boolean;
  reason: "PASS" | "BLOCKED BY WALLET LIMIT" | "TOKEN_SCOPE_UNVERIFIED" | "REQUIRES APP CONFIRMATION" | "WALLET_UNAVAILABLE";
  remainingUsd: number | null;
}
