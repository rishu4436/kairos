import { AGENT_STATE_LABEL } from "@/agent/states";
import type { AgentRuntimeState, StrategyMetadata, WatchStatus } from "@/domain/models";
import { summarizePortfolio } from "@/domain/portfolio";
import { directionOf, formatClock, formatPercentFromBps, formatPrice, formatQuantity, formatSignedUsdt, formatStamp, formatUsdt } from "@/lib/format";
import { readDataMode, type KairosDataMode } from "@/lib/mode";
import { localPaperSession } from "@/paper/session";
import { readPaperBook } from "@/paper/store";
import { researchStore } from "@/research/store";
import { createStrategyRegistry, listStrategyCatalog } from "@/strategies";

export interface CommandCenterModel {
  dataMode: KairosDataMode;
  disclaimer: string;
  sampledAt: string;
  agent: {
    name: string;
    mode: string;
    runtimeLabel: string;
    runtimeState: AgentRuntimeState;
    strategy: string;
    lastDecision: string;
    nextEvaluation: string;
  };
  portfolio: {
    equity: string;
    cash: string;
    invested: string;
    todayPnl: string;
    todayDirection: "up" | "down" | "flat";
    totalPnl: string;
    totalDirection: "up" | "down" | "flat";
    sparkline: number[];
  };
  watchlist: {
    ticker: string;
    name: string;
    tokenizedSymbol: string;
    price: string;
    change: string;
    direction: "up" | "down" | "flat";
    status: WatchStatus;
    signal: string;
  }[];
  decision: {
    symbol: string;
    name: string;
    posture: string;
    action: string;
    momentum: string;
    momentumPercent: number;
    liquidity: string;
    volatility: string;
    eventRisk: string;
    riskCheck: string;
    confidence: string;
    confidencePercent: number;
    note: string;
  };
  events: {
    id: string;
    at: string;
    clock: string;
    message: string;
  }[];
  strategies: {
    id: string;
    name: string;
    description: string;
    status: StrategyMetadata["status"];
    riskLevel: string;
  }[];
  risk: {
    maxPosition: string;
    maxDailyLoss: string;
    maxSlippage: string;
    allowedAssets: string;
    liveTrading: "Disabled" | "Enabled";
    paperTrading: "Disabled" | "Enabled";
  };
  missions: {
    id: string;
    time: string;
    stamp: string;
    asset: string;
    action: string;
    strategy: string;
    size: string;
    result: string;
    status: string;
  }[];
  lab: {
    activeExperiments: number;
    paperCapital: string;
    underEvaluation: number;
    bestRecent: string;
  };
}

export interface PortfolioPageModel {
  equity: string;
  cash: string;
  invested: string;
  realized: string;
  unrealized: string;
  totalPnl: string;
  positions: {
    symbol: string;
    quantity: string;
    entry: string;
    mark: string;
    pnl: string;
    strategy: string;
  }[];
}

export interface RiskPageModel {
  owner: string;
  liveTrading: "Disabled" | "Enabled";
  paperTrading: "Disabled" | "Enabled";
  maxPosition: string;
  maxAllocation: string;
  maxDailyLoss: string;
  maxSlippage: string;
  allowedAssets: string[];
}

export interface StrategyPageRow {
  id: string;
  name: string;
  description: string;
  status: StrategyMetadata["status"];
  enabled: boolean;
  riskLevel: string;
  requiredData: string;
  supportedAssets: string;
}

export interface AgentPageModel {
  runtimeLabel: string;
  runtimeState: AgentRuntimeState;
  mode: string;
  user: string;
  account: string;
  address: string;
}

function currentPaperState() {
  const session = localPaperSession()!;
  const book = readPaperBook(session.user.id, session.agent.id);
  return { session, book, summary: book ? summarizePortfolio(book.account) : null };
}

/** Current stored paper state only; an uninitialized book is an empty state. */
export function getCommandCenterModel(): CommandCenterModel {
  const dataMode = readDataMode();
  const { session, book, summary } = currentPaperState();
  const catalog = listStrategyCatalog(createStrategyRegistry());
  const names = new Map(catalog.map(strategy => [strategy.id, strategy.name]));
  const experiments = researchStore().listExperiments(session.user.id);
  const runtimeState = book?.loopState ?? "OFFLINE";
  const events = book?.events ?? [];
  return {
    dataMode,
    disclaimer: "Portfolio and missions show the current paper book. Paper results are simulated and do not represent wallet balances or live trades.",
    sampledAt: events.at(-1)?.at ?? "",
    agent: {
      name: session.agent.name, mode: "Paper monitoring", runtimeState,
      runtimeLabel: AGENT_STATE_LABEL[runtimeState], strategy: "No live strategy selected yet",
      lastDecision: book?.records.at(-1)?.intent.action ?? "None", nextEvaluation: "—",
    },
    portfolio: {
      equity: summary ? formatUsdt(summary.equity) : "—", cash: summary ? formatUsdt(summary.cash) : "—",
      invested: summary ? formatUsdt(summary.invested) : "—", todayPnl: summary ? formatSignedUsdt(summary.todayPnl) : "—",
      todayDirection: summary ? directionOf(summary.todayPnl) : "flat", totalPnl: summary ? formatSignedUsdt(summary.totalPnl) : "—",
      totalDirection: summary ? directionOf(summary.totalPnl) : "flat", sparkline: [],
    },
    watchlist: [],
    decision: {
      symbol: "—", name: "No current decision", posture: "Unavailable", action: "WAIT", momentum: "—", momentumPercent: 0,
      liquidity: "Unavailable", volatility: "Unavailable", eventRisk: "Unavailable", riskCheck: "Not run",
      confidence: "—", confidencePercent: 0, note: "No current decision is available. See the runtime observation and arbitration panels.",
    },
    events: events.map(item => ({ id: item.id, at: item.at, clock: formatClock(item.at), message: item.message })),
    strategies: catalog.map(strategy => ({ id: strategy.id, name: strategy.name, description: strategy.description, status: strategy.status, riskLevel: strategy.riskLevel })),
    risk: {
      maxPosition: formatUsdt(session.policy.maxPositionNotional), maxDailyLoss: formatUsdt(session.policy.maxDailyLoss),
      maxSlippage: formatPercentFromBps(session.policy.maxSlippageBps).replace("+", ""), allowedAssets: session.policy.allowedAssets.join(" · "),
      liveTrading: session.policy.liveTradingEnabled ? "Enabled" : "Disabled", paperTrading: session.policy.paperTradingEnabled ? "Enabled" : "Disabled",
    },
    missions: [...(book?.account.trades ?? [])].sort((a,b) => b.at.localeCompare(a.at)).map(trade => ({
      id: trade.id, time: trade.at, stamp: formatStamp(trade.at), asset: trade.assetSymbol,
      action: trade.side === "buy" ? "Buy" : "Sell", strategy: names.get(trade.strategyId ?? "") ?? "Unattributed",
      size: formatQuantity(trade.quantity), result: trade.side === "buy" && trade.realizedPnl === 0n ? "Opened" : formatSignedUsdt(trade.realizedPnl), status: "Paper",
    })),
    lab: {
      activeExperiments: experiments.filter(item => item.status === "RUNNING" || item.status === "QUEUED").length,
      underEvaluation: experiments.length, paperCapital: experiments.length ? formatUsdt(BigInt(experiments.at(-1)!.initialCapital)) : "—", bestRecent: "—",
    },
  };
}

export function getPortfolioPageModel(): PortfolioPageModel {
  const { summary } = currentPaperState();
  const names = strategyNames();
  return {
    equity: summary ? formatUsdt(summary.equity) : "—", cash: summary ? formatUsdt(summary.cash) : "—", invested: summary ? formatUsdt(summary.invested) : "—",
    realized: summary ? formatSignedUsdt(summary.realizedPnl) : "—", unrealized: summary ? formatSignedUsdt(summary.unrealizedPnl) : "—", totalPnl: summary ? formatSignedUsdt(summary.totalPnl) : "—",
    positions: (summary?.positions ?? []).map(position => ({ symbol: position.assetSymbol, quantity: formatQuantity(position.quantity), entry: formatPrice(position.entryPrice), mark: formatPrice(position.currentPrice), pnl: formatSignedUsdt(position.unrealizedPnl), strategy: names.get(position.strategyId ?? "") ?? "Unattributed" })),
  };
}

export function getRiskPageModel(): RiskPageModel {
  const { session } = currentPaperState();
  return {
    owner: session.user.displayName, liveTrading: session.policy.liveTradingEnabled ? "Enabled" : "Disabled", paperTrading: session.policy.paperTradingEnabled ? "Enabled" : "Disabled",
    maxPosition: formatUsdt(session.policy.maxPositionNotional), maxAllocation: formatPercentFromBps(session.policy.maxAllocationBps).replace("+", ""),
    maxDailyLoss: formatUsdt(session.policy.maxDailyLoss), maxSlippage: formatPercentFromBps(session.policy.maxSlippageBps).replace("+", ""), allowedAssets: [...session.policy.allowedAssets],
  };
}

export function getStrategyPageModel(): StrategyPageRow[] {
  readDataMode();
  return listStrategyCatalog(createStrategyRegistry()).map(strategy => ({
    id: strategy.id, name: strategy.name, description: strategy.description, status: strategy.status, enabled: strategy.enabled,
    riskLevel: strategy.riskLevel, requiredData: strategy.requiredData.join(", "), supportedAssets: strategy.supportedAssets.length ? strategy.supportedAssets.join(", ") : "—",
  }));
}

export function getAgentPageModel(): AgentPageModel {
  const { session, book } = currentPaperState();
  const runtimeState = book?.loopState ?? "OFFLINE";
  return { runtimeLabel: AGENT_STATE_LABEL[runtimeState], runtimeState, mode: "Paper monitoring", user: session.user.displayName, account: book ? "Current paper ledger" : "Paper ledger not initialized", address: "Not connected" };
}

function strategyNames(): Map<string, string> {
  return new Map(listStrategyCatalog(createStrategyRegistry()).map(strategy => [strategy.id, strategy.name]));
}
