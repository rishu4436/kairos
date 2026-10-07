import { createMockObservation } from "@/data/observations";
import { asAccountId, asAgentId, asAssetId, asPolicyId, asUserId } from "@/domain/ids";
import type {
  Agent,
  AgentDecision,
  AgentEvent,
  Asset,
  PaperAccountState,
  PaperTrade,
  Position,
  RiskPolicy,
  StrategyExperiment,
  User,
  WalletAccount,
  WatchlistItem,
} from "@/domain/models";
import { parseDecimal, sub, type Scaled } from "@/domain/money";
import { summarizePortfolio, sumRealized } from "@/domain/portfolio";

const userId = asUserId("user_demo");
const agentId = asAgentId("agent_demo");
const accountId = asAccountId("acct_paper_demo");
const policyId = asPolicyId("policy_demo");

export interface DemoSession {
  user: User;
  agent: Agent;
  account: WalletAccount;
  policy: RiskPolicy;
  portfolio: PaperAccountState;
  watchlist: WatchlistItem[];
  decision: AgentDecision;
  events: AgentEvent[];
  experiments: StrategyExperiment[];
  labCapital: Scaled;
}

interface QuoteMark {
  price: Scaled;
  change24hBps: number;
}

const quotes: Record<string, QuoteMark> = {
  NVDA: { price: parseDecimal("184.55"), change24hBps: 182 },
  TSLA: { price: parseDecimal("248.10"), change24hBps: -64 },
  AAPL: { price: parseDecimal("226.10"), change24hBps: -42 },
  MSFT: { price: parseDecimal("428.30"), change24hBps: 21 },
  AMD: { price: parseDecimal("164.75"), change24hBps: 240 },
  SPY: { price: parseDecimal("562.15"), change24hBps: 18 },
};

function asset(
  ticker: string,
  name: string,
  kind: Asset["kind"],
): Asset {
  return {
    id: asAssetId(`asset_${ticker.toLowerCase()}`),
    ticker,
    name,
    tokenizedSymbol: `MOCK:${ticker}`,
    kind,
    chain: "bnb",
  };
}

const assets = {
  NVDA: asset("NVDA", "NVIDIA", "tokenized_equity"),
  TSLA: asset("TSLA", "Tesla", "tokenized_equity"),
  AAPL: asset("AAPL", "Apple", "tokenized_equity"),
  MSFT: asset("MSFT", "Microsoft", "tokenized_equity"),
  AMD: asset("AMD", "Advanced Micro Devices", "tokenized_equity"),
  SPY: asset("SPY", "S&P 500 ETF", "tokenized_etf"),
};

function watch(
  ticker: keyof typeof assets,
  status: WatchlistItem["status"],
  signal: string,
): WatchlistItem {
  const mark = quotes[ticker];
  return {
    id: `watch_${ticker.toLowerCase()}`,
    userId,
    agentId,
    asset: assets[ticker],
    price: mark.price,
    change24hBps: mark.change24hBps,
    status,
    signal,
    fidelity: "mock",
  };
}

function trade(input: Omit<PaperTrade, "accountId" | "userId" | "agentId" | "status" | "venue" | "fidelity" | "fee"> & { fee?: Scaled }): PaperTrade {
  return {
    ...input,
    fee: input.fee ?? 0n,
    accountId,
    userId,
    agentId,
    status: "paper_filled",
    venue: "paper",
    fidelity: "paper",
  };
}

function position(ticker: "NVDA" | "AAPL", quantity: string, entry: string): Position {
  return {
    id: `pos_${ticker.toLowerCase()}`,
    accountId,
    userId,
    assetSymbol: ticker,
    quantity: parseDecimal(quantity),
    entryPrice: parseDecimal(entry),
    currentPrice: quotes[ticker].price,
    strategyId: ticker === "NVDA" ? "momentum" : "mean-reversion",
  };
}

export function createDemoSession(): DemoSession {
  const trades: PaperTrade[] = [
    trade({
      id: "paper_nvda_open",
      assetSymbol: "NVDA",
      side: "buy",
      quantity: parseDecimal("8"),
      price: parseDecimal("178.20"),
      realizedPnl: 0n,
      strategyId: "momentum",
      at: "2026-10-02T14:06:11.000Z",
    }),
    trade({
      id: "paper_aapl_open",
      assetSymbol: "AAPL",
      side: "buy",
      quantity: parseDecimal("15"),
      price: parseDecimal("228.40"),
      realizedPnl: 0n,
      strategyId: "mean-reversion",
      at: "2026-10-02T14:11:42.000Z",
    }),
    trade({
      id: "paper_tsla_close",
      assetSymbol: "TSLA",
      side: "sell",
      quantity: parseDecimal("4"),
      price: parseDecimal("251.30"),
      realizedPnl: parseDecimal("84.20"),
      strategyId: "momentum",
      at: "2026-10-01T19:42:08.000Z",
    }),
  ];

  const draft: PaperAccountState = {
    accountId,
    userId,
    agentId,
    cash: parseDecimal("42350"),
    positions: [position("NVDA", "8", "178.20"), position("AAPL", "15", "228.40")],
    realizedPnl: sumRealized(trades),
    sessionStartEquity: 0n,
    trades,
  };
  const equity = summarizePortfolio(draft).equity;

  const portfolio: PaperAccountState = {
    ...draft,
    sessionStartEquity: sub(equity, parseDecimal("127.40")),
  };

  const user: User = { id: userId, displayName: "Demo user" };
  const agent: Agent = {
    id: agentId,
    userId,
    name: "KAIROS",
    runtimeState: "OBSERVING",
    mode: "monitoring",
  };
  const account: WalletAccount = {
    id: accountId,
    userId,
    agentId,
    kind: "paper",
    label: "Paper ledger",
    address: null,
  };
  const policy: RiskPolicy = {
    id: policyId,
    userId,
    agentId,
    liveTradingEnabled: false,
    paperTradingEnabled: true,
    maxPositionNotional: parseDecimal("5000"),
    maxAllocationBps: 2500,
    maxDailyLoss: parseDecimal("500"),
    maxSlippageBps: 50,
    allowedAssets: ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "SPY"],
  };
  const decision: AgentDecision = {
    id: "decision_sample_nvda",
    userId,
    agentId,
    assetSymbol: "NVDA",
    posture: "WATCH",
    action: "WAIT",
    strategyId: "momentum",
    confidence: 0.72,
    momentum: 0.71,
    liquidity: "healthy",
    volatility: "elevated",
    eventRisk: "low",
    riskCheck: "pass",
    committed: false,
    fidelity: "mock",
    note: "Sample assessment. No order has been committed.",
  };
  const events: AgentEvent[] = [
    event("evt_1", "2026-10-02T22:31:04.000Z", "observation", "Market observation received"),
    event("evt_2", "2026-10-02T22:31:08.000Z", "analysis", "NVDA volatility increased"),
    event("evt_3", "2026-10-02T22:31:11.000Z", "strategy", "Momentum strategy evaluated"),
    event("evt_4", "2026-10-02T22:31:12.000Z", "risk", "Risk policy checked"),
    event("evt_5", "2026-10-02T22:31:14.000Z", "execution", "No execution — confidence threshold not met"),
  ];
  const experiments: StrategyExperiment[] = [
    experiment("exp_momentum", "Momentum sanity", "momentum", "paper"),
    experiment("exp_weekend", "Weekend session", "weekend", "paper"),
    experiment("exp_mean", "Mean reversion band", "mean-reversion", "draft"),
  ];

  return {
    user,
    agent,
    account,
    policy,
    portfolio,
    watchlist: [
      watch("NVDA", "OPPORTUNITY", "Momentum +0.71"),
      watch("TSLA", "WATCHING", "Neutral"),
      watch("AAPL", "PAPER_TEST", "Mean reversion"),
      watch("MSFT", "NO_ACTION", "Flat"),
      watch("AMD", "RISK_BLOCKED", "Size blocked"),
      watch("SPY", "WATCHING", "Neutral"),
    ],
    decision,
    events,
    experiments,
    labCapital: parseDecimal("10000"),
  };
}

export function createFeaturedObservation() {
  const session = createDemoSession();
  return createMockObservation({
    userId: session.user.id,
    agentId: session.agent.id,
    asset: assets.NVDA,
    price: quotes.NVDA.price,
    change24hBps: quotes.NVDA.change24hBps,
    liquidity: "healthy",
    session: "open",
    volatility: "elevated",
    asOf: "2026-10-02T22:31:04.000Z",
  });
}

function event(id: string, at: string, kind: AgentEvent["kind"], message: string): AgentEvent {
  return { id, userId, agentId, at, kind, message, fidelity: "sample" };
}

function experiment(
  id: string,
  name: string,
  strategyId: string,
  status: StrategyExperiment["status"],
): StrategyExperiment {
  return {
    id,
    userId,
    name,
    strategyId,
    status,
    paperCapital: parseDecimal("10000"),
    fidelity: "preview",
  };
}
