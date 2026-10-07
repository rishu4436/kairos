import { asAccountId, asAgentId, asAssetId, asPolicyId, asUserId } from "@/domain/ids";
import type {
  Asset,
  PaperAccountState,
  PaperTrade,
  Quote,
  RiskPolicy,
  TradeIntent,
  WalletAccount,
} from "@/domain/models";
import { parseDecimal, type Scaled } from "@/domain/money";

export const ids = {
  userId: asUserId("user_a"),
  agentId: asAgentId("agent_a"),
  accountId: asAccountId("acct_a"),
  policyId: asPolicyId("policy_a"),
};

export const nvda: Asset = {
  id: asAssetId("asset_nvda"),
  ticker: "NVDA",
  name: "NVIDIA",
  tokenizedSymbol: "MOCK:NVDA",
  kind: "tokenized_equity",
  chain: "bnb",
};

export function policy(overrides: Partial<RiskPolicy> = {}): RiskPolicy {
  return {
    id: ids.policyId,
    userId: ids.userId,
    agentId: ids.agentId,
    liveTradingEnabled: false,
    paperTradingEnabled: true,
    maxPositionNotional: parseDecimal("2500"),
    maxAllocationBps: 5000,
    maxDailyLoss: parseDecimal("500"),
    maxSlippageBps: 50,
    allowedAssets: ["NVDA", "AAPL"],
    ...overrides,
  };
}

export function accountState(overrides: Partial<PaperAccountState> = {}): PaperAccountState {
  return {
    accountId: ids.accountId,
    userId: ids.userId,
    agentId: ids.agentId,
    cash: parseDecimal("10000"),
    positions: [],
    realizedPnl: 0n,
    sessionStartEquity: parseDecimal("10000"),
    trades: [],
    ...overrides,
  };
}

export function intent(overrides: Partial<TradeIntent> = {}): TradeIntent {
  return {
    id: "intent_1",
    userId: ids.userId,
    agentId: ids.agentId,
    accountId: ids.accountId,
    assetSymbol: "NVDA",
    side: "buy",
    quantity: parseDecimal("1"),
    limitPrice: parseDecimal("100"),
    slippageBps: 30,
    strategyId: "momentum",
    venue: "paper",
    confidence: 0.4,
    asOf: "2026-10-02T22:31:14.000Z",
    ...overrides,
  };
}

export function wallet(overrides: Partial<WalletAccount> = {}): WalletAccount {
  return {
    id: ids.accountId,
    userId: ids.userId,
    agentId: ids.agentId,
    kind: "paper",
    label: "Paper ledger",
    address: null,
    ...overrides,
  };
}

export function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    assetSymbol: "NVDA",
    side: "buy",
    price: parseDecimal("100"),
    liquidity: "healthy",
    quotedAt: "2026-10-02T22:31:14.000Z",
    source: "mock",
    ...overrides,
  };
}

export function lossTrade(amount: Scaled, at: string): PaperTrade {
  return {
    id: `loss_${at}`,
    accountId: ids.accountId,
    userId: ids.userId,
    agentId: ids.agentId,
    assetSymbol: "NVDA",
    side: "sell",
    quantity: parseDecimal("1"),
    price: parseDecimal("90"),
    fee: 0n,
    realizedPnl: amount,
    strategyId: "momentum",
    at,
    status: "paper_filled",
    venue: "paper",
    fidelity: "paper",
  };
}
