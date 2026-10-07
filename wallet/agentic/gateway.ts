import type {
  AgenticTokenBalance,
  AgenticWalletAccount,
  AgenticWalletExecutionResult,
  AgenticWalletSecurityPolicy,
} from "@/domain/agentic-wallet";

export interface AgenticSwapRequest {
  userId: string;
  agentId: string;
  fromToken: string;
  toToken: string;
  fromTokenQty: string;
  binanceChainId: "56";
  slippagePercent: string;
}

/**
 * Documented `baw` operations only. Implementations must not accept a shell string.
 */
export interface AgenticWalletGateway {
  getStatus(userId: string, agentId: string): Promise<AgenticWalletAccount>;
  getSecurityPolicy(userId: string): Promise<AgenticWalletSecurityPolicy | null>;
  getBalances(userId: string, chainId: "56"): Promise<readonly AgenticTokenBalance[]>;
  executeSwap(request: AgenticSwapRequest): Promise<AgenticWalletExecutionResult>;
  getOrderStatus(userId: string, orderId: string): Promise<AgenticWalletExecutionResult>;
}
