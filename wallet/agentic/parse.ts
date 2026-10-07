import {
  HIGH_RISK_HANDLING,
  WALLET_CONNECTION_STATUSES,
  type AgenticTokenBalance,
  type AgenticWalletAccount,
  type AgenticWalletExecutionResult,
  type AgenticWalletSecurityPolicy,
  type HighRiskHandling,
  type WalletConnectionStatus,
} from "@/domain/agentic-wallet";

export function parseCliJson(stdout: string): { success: boolean; data: unknown; errorName: string | null } {
  try {
    const body = JSON.parse(stdout) as { success?: unknown; data?: unknown; error?: { name?: unknown } };
    return {
      success: body.success === true,
      data: body.data,
      errorName: typeof body.error?.name === "string" ? body.error.name : null,
    };
  } catch {
    return { success: false, data: null, errorName: "MALFORMED_RESPONSE" };
  }
}

export function parseConnectionStatus(data: unknown): WalletConnectionStatus {
  const status = isRecord(data) && typeof data.status === "string" ? data.status : "";
  return (WALLET_CONNECTION_STATUSES as readonly string[]).includes(status) ? (status as WalletConnectionStatus) : "UNCONNECTED";
}

export function parseSecurityPolicy(data: unknown): AgenticWalletSecurityPolicy | null {
  if (!isRecord(data)) {
    return null;
  }
  const handling = typeof data.abnormalTxnHandling === "string" ? data.abnormalTxnHandling : null;
  return {
    dailyLimit: numberOrNull(data.dailyLimit),
    quotaUsed: numberOrNull(data.quotaUsed),
    quotaLeft: numberOrNull(data.quotaLeft),
    quotaDate: stringOrNull(data.quotaDate),
    tradeAllTokens: typeof data.tradeAllTokens === "boolean" ? data.tradeAllTokens : null,
    highRiskHandling: (HIGH_RISK_HANDLING as readonly string[]).includes(handling ?? "") ? (handling as HighRiskHandling) : null,
  };
}

export function parseBscAddress(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.addresses)) {
    return null;
  }
  const row = data.addresses.find((item) => isRecord(item) && item.binanceChainId === "56");
  return isRecord(row) ? stringOrNull(row.address) : null;
}

export function parseChains(data: unknown): { binanceChainId: string; name: string }[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((item) => {
    if (!isRecord(item) || typeof item.binanceChainId !== "string") {
      return [];
    }
    return [{ binanceChainId: item.binanceChainId, name: typeof item.name === "string" ? item.name : item.binanceChainId }];
  });
}

export function parseBalances(data: unknown): AgenticTokenBalance[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((item) => {
    const row = isRecord(item) ? item : {};
    return {
      symbol: stringOrNull(row.symbol),
      contractAddress: stringOrNull(row.address),
      chainId: stringOrNull(row.binanceChainId),
      amount: stringOrNull(row.balance),
      valueUsd: stringOrNull(row.value),
    };
  });
}

export function parseSwapSubmission(data: unknown, walletAddress: string | null): AgenticWalletExecutionResult {
  const orderId = isRecord(data) ? stringOrNull(data.orderId) : null;
  return {
    status: orderId === null ? "ERROR" : "SUBMITTED",
    walletAddress,
    transactionHash: null,
    orderId,
    timestamp: null,
    broadcasted: false,
    chainId: "56",
    errorCategory: orderId === null ? "EXECUTION_ERROR" : null,
    providerMetadata: { orderId },
  };
}

export function parseOrderStatus(data: unknown, walletAddress: string | null): AgenticWalletExecutionResult {
  const list = isRecord(data) && Array.isArray(data.list) ? data.list : [];
  const row = isRecord(list[0]) ? list[0] : null;
  const status = row ? stringOrNull(row.status) : null;
  const mapped = status === "FINISHED" ? "CONFIRMED" : status === "FAILED" ? "REJECTED" : status === "PENDING" ? "SUBMITTED" : "ERROR";
  return {
    status: mapped,
    walletAddress,
    transactionHash: row ? stringOrNull(row.txHash) : null,
    orderId: row ? stringOrNull(row.orderId) : null,
    timestamp: row ? stringOrNull(row.updatedTime) : null,
    broadcasted: mapped === "CONFIRMED" || mapped === "SUBMITTED",
    chainId: row ? stringOrNull(row.chain) : "56",
    errorCategory: mapped === "REJECTED" ? "EXECUTION_REJECTED" : mapped === "ERROR" ? "VERIFICATION_FAILED" : null,
    providerMetadata: { providerStatus: status },
  };
}

export function disconnectedAccount(userId: string, agentId: string, at: string): AgenticWalletAccount {
  return {
    userId,
    agentId,
    provider: "binance-agentic-wallet",
    accountId: null,
    walletAddress: null,
    supportedChains: [],
    connectionStatus: "UNCONNECTED",
    securityPolicy: null,
    lastUpdated: at,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
