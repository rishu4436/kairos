import { AGENT_STATE_LABEL } from "@/agent/states";
import { createDemoSession, type DemoSession } from "@/data/sample-session";
import type { AgentRuntimeState, StrategyMetadata, WatchStatus } from "@/domain/models";
import type { Scaled } from "@/domain/money";
import { summarizePortfolio } from "@/domain/portfolio";
import {
  directionOf,
  formatClock,
  formatConfidence,
  formatPercentFromBps,
  formatPrice,
  formatQuantity,
  formatScore,
  formatSignedUsdt,
  formatStamp,
  formatUsdt,
} from "@/lib/format";
import { readDataMode, type KairosDataMode } from "@/lib/mode";
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

export function getCommandCenterModel(): CommandCenterModel {
  const dataMode = readDataMode();
  const session = createDemoSession();
  const summary = summarizePortfolio(session.portfolio);
  const catalog = listStrategyCatalog(createStrategyRegistry());
  const names = new Map(catalog.map((strategy) => [strategy.id, strategy.name]));
  const assetNames = new Map(session.watchlist.map((item) => [item.asset.ticker, item.asset.name]));

  return {
    dataMode,
    disclaimer:
      dataMode === "live"
        ? "Market rows are requested from Binance Web3. The portfolio, decision, and paper ledger stay simulated. No order is sent."
        : "The portfolio card is the sample ledger. The paper cycle is a separate simulated book. This is simulated execution and does not broadcast blockchain transactions.",
    sampledAt: "2026-10-02T22:31:14.000Z",
    agent: {
      name: session.agent.name,
      mode: "Monitoring",
      runtimeLabel: AGENT_STATE_LABEL[session.agent.runtimeState],
      runtimeState: session.agent.runtimeState,
      strategy: "No live strategy selected yet",
      lastDecision: session.decision.committed ? session.decision.action : "None",
      nextEvaluation: "—",
    },
    portfolio: {
      equity: formatUsdt(summary.equity),
      cash: formatUsdt(summary.cash),
      invested: formatUsdt(summary.invested),
      todayPnl: formatSignedUsdt(summary.todayPnl),
      todayDirection: directionOf(summary.todayPnl),
      totalPnl: formatSignedUsdt(summary.totalPnl),
      totalDirection: directionOf(summary.totalPnl),
      sparkline: equityPath(summary.equity),
    },
    watchlist: session.watchlist.map((item) => ({
      ticker: item.asset.ticker,
      name: item.asset.name,
      tokenizedSymbol: item.asset.tokenizedSymbol,
      price: formatPrice(item.price),
      change: formatPercentFromBps(item.change24hBps),
      direction: item.change24hBps > 0 ? "up" : item.change24hBps < 0 ? "down" : "flat",
      status: item.status,
      signal: item.signal,
    })),
    decision: {
      symbol: session.decision.assetSymbol,
      name: assetNames.get(session.decision.assetSymbol) ?? session.decision.assetSymbol,
      posture: "Watch",
      action: session.decision.action,
      momentum: session.decision.momentum === null ? "—" : formatScore(session.decision.momentum),
      momentumPercent: session.decision.momentum === null ? 50 : 50 + session.decision.momentum * 50,
      liquidity: label(session.decision.liquidity),
      volatility: label(session.decision.volatility),
      eventRisk: label(session.decision.eventRisk),
      riskCheck: session.decision.riskCheck === "pass" ? "Pass" : session.decision.riskCheck === "fail" ? "Fail" : "Not run",
      confidence: formatConfidence(session.decision.confidence),
      confidencePercent: Math.round(session.decision.confidence * 100),
      note: session.decision.note,
    },
    events: session.events.map((item) => ({
      id: item.id,
      at: item.at,
      clock: formatClock(item.at),
      message: item.message,
    })),
    strategies: catalog.map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      status: strategy.status,
      riskLevel: strategy.riskLevel,
    })),
    risk: {
      maxPosition: formatUsdt(session.policy.maxPositionNotional),
      maxDailyLoss: formatUsdt(session.policy.maxDailyLoss),
      maxSlippage: formatPercentFromBps(session.policy.maxSlippageBps).replace("+", ""),
      allowedAssets: session.policy.allowedAssets.join(" · "),
      liveTrading: session.policy.liveTradingEnabled ? "Enabled" : "Disabled",
      paperTrading: session.policy.paperTradingEnabled ? "Enabled" : "Disabled",
    },
    missions: [...session.portfolio.trades]
      .sort((left, right) => (left.at < right.at ? 1 : -1))
      .map((trade) => ({
        id: trade.id,
        time: trade.at,
        stamp: formatStamp(trade.at),
        asset: trade.assetSymbol,
        action: trade.side === "buy" ? "Buy" : "Sell",
        strategy: names.get(trade.strategyId ?? "") ?? "Unattributed",
        size: formatQuantity(trade.quantity),
        result:
          trade.side === "buy" && trade.realizedPnl === 0n
            ? "Opened"
            : formatSignedUsdt(trade.realizedPnl),
        status: "Paper",
      })),
    lab: labSummary(session),
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

export function getPortfolioPageModel(): PortfolioPageModel {
  readDataMode();
  const session = createDemoSession();
  const summary = summarizePortfolio(session.portfolio);
  const names = strategyNames();
  return {
    equity: formatUsdt(summary.equity),
    cash: formatUsdt(summary.cash),
    invested: formatUsdt(summary.invested),
    realized: formatSignedUsdt(summary.realizedPnl),
    unrealized: formatSignedUsdt(summary.unrealizedPnl),
    totalPnl: formatSignedUsdt(summary.totalPnl),
    positions: summary.positions.map((position) => ({
      symbol: position.assetSymbol,
      quantity: formatQuantity(position.quantity),
      entry: formatPrice(position.entryPrice),
      mark: formatPrice(position.currentPrice),
      pnl: formatSignedUsdt(position.unrealizedPnl),
      strategy: names.get(position.strategyId ?? "") ?? "Unattributed",
    })),
  };
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

export function getRiskPageModel(): RiskPageModel {
  readDataMode();
  const session = createDemoSession();
  return {
    owner: session.user.displayName,
    liveTrading: session.policy.liveTradingEnabled ? "Enabled" : "Disabled",
    paperTrading: session.policy.paperTradingEnabled ? "Enabled" : "Disabled",
    maxPosition: formatUsdt(session.policy.maxPositionNotional),
    maxAllocation: formatPercentFromBps(session.policy.maxAllocationBps).replace("+", ""),
    maxDailyLoss: formatUsdt(session.policy.maxDailyLoss),
    maxSlippage: formatPercentFromBps(session.policy.maxSlippageBps).replace("+", ""),
    allowedAssets: [...session.policy.allowedAssets],
  };
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

export function getStrategyPageModel(): StrategyPageRow[] {
  readDataMode();
  return listStrategyCatalog(createStrategyRegistry()).map((strategy) => ({
    id: strategy.id,
    name: strategy.name,
    description: strategy.description,
    status: strategy.status,
    enabled: strategy.enabled,
    riskLevel: strategy.riskLevel,
    requiredData: strategy.requiredData.join(", "),
    supportedAssets: strategy.supportedAssets.length === 0 ? "—" : strategy.supportedAssets.join(", "),
  }));
}

export interface AgentPageModel {
  runtimeLabel: string;
  runtimeState: AgentRuntimeState;
  mode: string;
  user: string;
  account: string;
  address: string;
}

export function getAgentPageModel(): AgentPageModel {
  readDataMode();
  const session = createDemoSession();
  return {
    runtimeLabel: AGENT_STATE_LABEL[session.agent.runtimeState],
    runtimeState: session.agent.runtimeState,
    mode: "Monitoring",
    user: session.user.displayName,
    account: session.account.label,
    address: session.account.address ?? "Not connected",
  };
}

function strategyNames(): Map<string, string> {
  return new Map(listStrategyCatalog(createStrategyRegistry()).map((strategy) => [strategy.id, strategy.name]));
}

function labSummary(session: DemoSession): CommandCenterModel["lab"] {
  const activeExperiments = session.experiments.filter((item) => item.status === "paper").length;
  const underEvaluation = session.experiments.filter((item) => item.status !== "archived").length;
  return {
    activeExperiments,
    paperCapital: formatUsdt(session.labCapital),
    underEvaluation,
    bestRecent: "—",
  };
}

function equityPath(equity: Scaled): number[] {
  const end = Number(equity) / 1_000_000;
  return [0.972, 0.968, 0.975, 0.981, 0.978, 0.986, 0.99, 0.994, 1].map((weight) => end * weight);
}

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
