import type { ObservationBoard, ObservationRow, SignalView } from "@/domain/observation";
import type { AgenticTokenBalance, AgenticWalletAccount } from "@/domain/agentic-wallet";
import type { PreparationRecord } from "@/domain/execution-prep";
import { formatClock } from "@/lib/format";
import { readDataMode, type KairosDataMode } from "@/lib/mode";
import { autonomousStore, type AuditRecord } from "@/runtime/store";
import type { AgentHeartbeatRecord, AutonomousExecutionMode, KairosCycleResult } from "@/runtime/types";
import { emptyLivePreview, previewFromPreparation, type LivePreviewModel } from "@/execution/preview";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";
import { readOperatorTokenScope, type TokenScopeAdmission } from "@/wallet/agentic/token-scope";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { disconnectedAccount } from "@/wallet/agentic/parse";
import { loadDemoObservationBoard } from "@/observation/load-board";
import { getCommandCenterModel, type CommandCenterModel } from "@/services/command-center";

const IMPLEMENTED = ["momentum", "mean-reversion", "weekend"] as const;

export type AgentFaceStatus = "RUNNING" | "OFFLINE" | "DEGRADED";

export interface DashboardWatchRow {
  ticker: string;
  tokenizedSymbol: string;
  platform: string;
  chain: string;
  contract: string;
  price: string;
  session: string;
  regime: string;
  dataQuality: string;
  representationId: string;
}

export interface DashboardStrategyEval {
  strategyId: string;
  strategyName: string;
  ticker: string;
  action: string;
  confidence: string;
  reason: string;
}

export interface DashboardArbitration {
  ticker: string;
  decision: string;
  selectedStrategy: string;
  selectedAction: string;
  reasons: string;
}

export interface DashboardRiskExecution {
  ticker: string;
  riskState: string;
  executionState: string;
}

export interface DashboardActivity {
  id: string;
  at: string;
  clock: string;
  kind: string;
  message: string;
}

export interface LiveTradeRow {
  orderId: string;
  txHash: string;
  explorerUrl: string;
  asset: string;
  side: string;
  amount: string;
  status: string;
}

export interface ProductionDashboard {
  dataMode: KairosDataMode;
  executionMode: AutonomousExecutionMode;
  board: ObservationBoard;
  disclaimer: string;
  agent: {
    status: AgentFaceStatus;
    runtimeStatus: string;
    lastHeartbeat: string;
    lastCompletedCycle: string;
    nextCycle: string;
    executionMode: AutonomousExecutionMode;
    lastCycleStatus: string;
  };
  wallet: {
    connected: boolean;
    address: string;
    chain: string;
    usdt: string;
    bnb: string;
    quotaUsed: string;
    quotaRemaining: string;
    highRiskHandling: string;
    tokenScope: TokenScopeAdmission | "UNAVAILABLE";
  };
  watchlist: DashboardWatchRow[];
  strategies: DashboardStrategyEval[];
  arbitration: DashboardArbitration[];
  riskExecution: DashboardRiskExecution[];
  preview: LivePreviewModel;
  activity: DashboardActivity[];
  livePortfolio: {
    address: string;
    usdt: string;
    bnb: string;
    holdings: { symbol: string; amount: string }[];
  };
  liveTrades: LiveTradeRow[];
  paper: CommandCenterModel;
}

export interface DashboardSources {
  dataMode: KairosDataMode;
  board: ObservationBoard;
  heartbeat: AgentHeartbeatRecord;
  cycles: readonly KairosCycleResult[];
  audits: readonly AuditRecord[];
  wallet: AgenticWalletAccount;
  balances: readonly AgenticTokenBalance[];
  tokenScope: TokenScopeAdmission | "UNAVAILABLE";
  paper: CommandCenterModel;
}

export function buildProductionDashboard(source: DashboardSources): ProductionDashboard {
  const latest = source.cycles[0] ?? null;
  const executionMode = latest?.executionMode ?? (source.dataMode === "live" ? "LIVE_PREVIEW" : "PAPER");
  const preparations = cyclePreparations(latest);
  const preview = livePreviewFrom(latest, preparations);
  const usdt = balanceAmount(source.balances, "USDT");
  const bnb = balanceAmount(source.balances, "BNB");
  const policy = source.wallet.securityPolicy;
  return {
    dataMode: source.dataMode,
    executionMode,
    board: source.board,
    disclaimer:
      "Live panels show the Agentic Wallet and canonical runtime. Paper/Strategy Lab is simulated and is not the live portfolio.",
    agent: {
      status: agentFace(source.heartbeat, latest),
      runtimeStatus: source.heartbeat.runtimeStatus,
      lastHeartbeat: source.heartbeat.lastCycleCompleted ?? source.heartbeat.lastCycleStarted ?? "—",
      lastCompletedCycle: source.heartbeat.lastCycleCompleted ?? "—",
      nextCycle: source.heartbeat.nextCycleAt ?? latest?.nextSuggestedRunAt ?? "—",
      executionMode,
      lastCycleStatus: latest?.status ?? "OFFLINE",
    },
    wallet: {
      connected: source.wallet.connectionStatus === "CONNECTED",
      address: source.wallet.walletAddress ?? "—",
      chain: "BSC 56",
      usdt,
      bnb,
      quotaUsed: policy?.quotaUsed == null ? "—" : String(policy.quotaUsed),
      quotaRemaining: policy?.quotaLeft == null ? "—" : String(policy.quotaLeft),
      highRiskHandling: policy?.highRiskHandling ?? "—",
      tokenScope: source.tokenScope,
    },
    watchlist: source.board.rows.map(watchRow),
    strategies: collectStrategies(source.board.rows),
    arbitration: source.board.rows.map(arbitrationRow),
    riskExecution: (latest?.assetResults ?? []).map((asset) => ({
      ticker: asset.ticker,
      riskState: asset.riskDecision ?? "NOT RUN",
      executionState: asset.executionState ?? "—",
    })),
    preview,
    activity: collectActivity(source.audits, latest),
    livePortfolio: {
      address: source.wallet.walletAddress ?? "—",
      usdt,
      bnb,
      holdings: source.balances
        .filter((item) => item.amount != null && item.amount !== "0")
        .map((item) => ({ symbol: item.symbol ?? "Token", amount: item.amount ?? "—" })),
    },
    liveTrades: [],
    paper: source.paper,
  };
}

export async function loadProductionDashboard(): Promise<ProductionDashboard> {
  const dataMode = readDataMode();
  const board = await loadDemoObservationBoard();
  const store = autonomousStore();
  const userId = LOCAL_RUNTIME_USER_ID;
  const agentId = DEFAULT_AGENT_ID;
  const walletGateway = new CliAgenticWalletGateway();
  const wallet = await walletGateway.getStatus(userId, agentId).catch(() => disconnectedAccount(userId, agentId, new Date().toISOString()));
  const balances =
    wallet.connectionStatus === "CONNECTED" ? await walletGateway.getBalances(userId, "56").catch(() => []) : [];
  const scope = readOperatorTokenScope();
  return buildProductionDashboard({
    dataMode,
    board,
    heartbeat: store.readHeartbeat(userId, agentId),
    cycles: store.listCycles(userId, agentId).slice(-8).reverse(),
    audits: store.listAudits(userId, agentId).slice(-40).reverse(),
    wallet,
    balances,
    tokenScope: scope ? "OPERATOR_ATTESTED" : "TOKEN_SCOPE_UNVERIFIED",
    paper: getCommandCenterModel(),
  });
}

function agentFace(heartbeat: AgentHeartbeatRecord, latest: KairosCycleResult | null): AgentFaceStatus {
  if (latest?.status === "DEGRADED" || latest?.status === "FAILED") {
    return "DEGRADED";
  }
  if (heartbeat.runtimeStatus === "RUNNING" && heartbeat.lastCycleCompleted) {
    return "RUNNING";
  }
  return "OFFLINE";
}

function watchRow(row: ObservationRow): DashboardWatchRow {
  return {
    ticker: row.ticker,
    tokenizedSymbol: row.tokenSymbol,
    platform: row.platformLabel,
    chain: row.chainLabel,
    contract: row.contractAddress ?? "—",
    price: row.price ?? "—",
    session: row.sessionLabel,
    regime: row.regime,
    dataQuality: row.dataQuality ?? "—",
    representationId: row.representationId,
  };
}

function collectStrategies(rows: readonly ObservationRow[]): DashboardStrategyEval[] {
  const out: DashboardStrategyEval[] = [];
  for (const row of rows) {
    for (const signal of row.signals) {
      if (!IMPLEMENTED.includes(signal.strategyId as (typeof IMPLEMENTED)[number])) {
        continue;
      }
      out.push(evalFromSignal(signal));
    }
  }
  return out;
}

function evalFromSignal(signal: SignalView): DashboardStrategyEval {
  return {
    strategyId: signal.strategyId,
    strategyName: signal.strategyName,
    ticker: signal.ticker,
    action: signal.action,
    confidence: `${Math.round(signal.confidence * 100)}%`,
    reason: signal.reasons[0] ?? signal.evaluation,
  };
}

function arbitrationRow(row: ObservationRow): DashboardArbitration {
  const decision = row.arbitration;
  return {
    ticker: row.ticker,
    decision: decision?.decision ?? "—",
    selectedStrategy: decision?.selectedStrategyName ?? "—",
    selectedAction: decision?.selectedAction ?? "—",
    reasons: decision?.evidence.summary ?? "—",
  };
}

function collectActivity(audits: readonly AuditRecord[], latest: KairosCycleResult | null): DashboardActivity[] {
  const fromAudit = audits.map((item) => ({
    id: item.id,
    at: item.at,
    clock: formatClock(item.at),
    kind: item.type,
    message: item.message,
  }));
  const fromCycle =
    latest?.transitions.map((step, index) => ({
      id: `${latest.cycleId}:${step.state}:${index}`,
      at: step.at,
      clock: formatClock(step.at),
      kind: step.state,
      message: `${step.state} · ${latest.executionMode}`,
    })) ?? [];
  return [...fromCycle, ...fromAudit].slice(0, 40);
}

function cyclePreparations(cycle: KairosCycleResult | null): readonly PreparationRecord[] {
  if (cycle == null) {
    return [];
  }
  const extra = cycle as KairosCycleResult & { preparations?: readonly PreparationRecord[] };
  return extra.preparations ?? [];
}

function livePreviewFrom(cycle: KairosCycleResult | null, preparations: readonly PreparationRecord[]): LivePreviewModel {
  const first = preparations[0];
  if (!first || cycle == null) {
    return emptyLivePreview();
  }
  const asset = cycle.assetResults.find((item) => item.executionState === first.state);
  return previewFromPreparation(first, asset?.ticker ?? "—", asset?.positionDecision ?? "—", "—");
}

function balanceAmount(balances: readonly AgenticTokenBalance[], symbol: string): string {
  const match = balances.find((item) => (item.symbol ?? "").toUpperCase() === symbol);
  return match?.amount ?? "—";
}


