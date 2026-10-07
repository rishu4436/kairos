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
import { getCommandCenterModel, type CommandCenterModel } from "@/services/command-center";
import { readObservationSnapshot, readWalletSnapshot } from "@/operator/snapshots";
import { failureBoard } from "@/observation/live";
import { KairosApiError } from "@/services/binance/errors";

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
  stateBackend: "MEMORY" | "REDIS" | "UNAVAILABLE";
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
  const executionMode =
    source.dataMode === "live"
      ? latest?.executionMode === "LIVE" || latest?.executionMode === "LIVE_PREVIEW"
        ? latest.executionMode
        : "LIVE_PREVIEW"
      : (latest?.executionMode ?? "PAPER");
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
      source.dataMode === "live"
        ? "Operating mode is live market data. LIVE_PREVIEW stops before signing. Paper is only the thesis lab."
        : "Data mode is paper. Thesis generation and paper experiments stay in Paper Lab. Set KAIROS_DATA_MODE=live for the operating dashboard.",
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
    stateBackend: "MEMORY",
  };
}

export async function loadProductionDashboard(): Promise<ProductionDashboard> {
  const dataMode = readDataMode();
  const store = autonomousStore();
  const userId = LOCAL_RUNTIME_USER_ID;
  const agentId = DEFAULT_AGENT_ID;
  const walletSnap = readWalletSnapshot(store);
  const observed = readObservationSnapshot(store);
  const board = boardFromSnapshot(observed);
  const scope = walletSnap.tokenScope === "UNAVAILABLE" ? (readOperatorTokenScope() ? "OPERATOR_ATTESTED" : "TOKEN_SCOPE_UNVERIFIED") : walletSnap.tokenScope;
  const view = buildProductionDashboard({
    dataMode,
    board,
    heartbeat: store.readHeartbeat(userId, agentId),
    cycles: store.listCycles(userId, agentId).slice(-8).reverse(),
    audits: store.listAudits(userId, agentId).slice(-40).reverse(),
    wallet: {
      userId,
      agentId,
      provider: "binance-agentic-wallet",
      accountId: null,
      walletAddress: walletSnap.address,
      supportedChains: [{ binanceChainId: walletSnap.chainId, name: "BSC" }],
      connectionStatus: walletSnap.connectionStatus === "CONNECTED" ? "CONNECTED" : "UNCONNECTED",
      securityPolicy:
        walletSnap.quotaRemaining == null && walletSnap.quotaUsed == null && walletSnap.highRiskHandling == null
          ? null
          : {
              dailyLimit: null,
              quotaUsed: walletSnap.quotaUsed == null ? null : Number(walletSnap.quotaUsed),
              quotaLeft: walletSnap.quotaRemaining == null ? null : Number(walletSnap.quotaRemaining),
              quotaDate: null,
              tradeAllTokens: false,
              highRiskHandling: walletSnap.highRiskHandling === "NeedConfirmation" || walletSnap.highRiskHandling === "AutoReject" ? walletSnap.highRiskHandling : null,
            },
      lastUpdated: walletSnap.observedAt,
    },
    balances: [
      ...(walletSnap.usdt ? [{ symbol: "USDT", contractAddress: null, chainId: "56", amount: walletSnap.usdt, valueUsd: null }] : []),
      ...(walletSnap.bnb ? [{ symbol: "BNB", contractAddress: null, chainId: "56", amount: walletSnap.bnb, valueUsd: null }] : []),
      ...walletSnap.tokens
        .filter((item) => {
          const symbol = (item.symbol ?? "").toUpperCase();
          return symbol !== "USDT" && symbol !== "BNB";
        })
        .map((item) => ({ symbol: item.symbol, contractAddress: null, chainId: "56", amount: item.amount, valueUsd: null })),
    ],
    tokenScope: scope,
    paper: getCommandCenterModel(),
  });
  view.stateBackend = store.backend;
  if (store.backend === "MEMORY") {
    view.disclaimer = `${view.disclaimer} This process is using ephemeral memory. The runner and this dashboard share cycles only when KAIROS_STATE_BACKEND=redis.`;
  }
  if (!observed) {
    view.disclaimer = `${view.disclaimer} No observation snapshot is stored yet. The public page waits for the runner to publish a cycle.`;
  }
  return view;
}

function boardFromSnapshot(snapshot: ReturnType<typeof readObservationSnapshot>): ObservationBoard {
  if (!snapshot) {
    return failureBoard(
      new KairosApiError({
        category: "DATA_UNAVAILABLE",
        safeMessage: "No observation snapshot is stored.",
        technicalMessage: "Public dashboard reads persisted snapshots only.",
      }),
      "live",
    );
  }
  return {
    ok: snapshot.ok,
    dataMode: "live",
    refreshIntervalMs: 15_000,
    freshMaxMs: 30_000,
    agingMaxMs: 120_000,
    generatedAt: snapshot.generatedAt,
    userId: LOCAL_RUNTIME_USER_ID,
    watchlistId: "snapshot",
    health: {
      connection: snapshot.ok ? "connected" : "offline",
      reason: snapshot.ok ? null : "Observation snapshot unavailable",
      httpStatus: null,
      lastSuccessAt: snapshot.observedAt,
      rwa: snapshot.ok ? "ok" : "error",
      market: snapshot.ok ? "ok" : "error",
      history: snapshot.ok ? "ok" : "skipped",
    },
    rows: snapshot.rows.map((row) => ({
      id: row.representationId,
      ticker: row.ticker,
      companyName: row.ticker,
      tokenSymbol: row.tokenSymbol,
      platformLabel: row.platform,
      chainLabel: row.chain,
      contractAddress: row.contract,
      price: row.price,
      referencePrice: row.referencePrice,
      deviationPct: null,
      change24hPct: null,
      session: "UNKNOWN",
      sessionLabel: row.session,
      rawMarketStatus: null,
      freshness: "FRESH",
      freshnessLabel: "SNAPSHOT",
      ageMs: null,
      sourceTimestamp: snapshot.generatedAt,
      receivedAt: snapshot.observedAt,
      volume24hUsd: null,
      nextOpenAt: null,
      reasonMessage: null,
      fidelity: "live",
      representationId: row.representationId,
      regime: row.regime,
      regimeDetail: null,
      dataQuality: row.dataQuality === "GOOD" || row.dataQuality === "DEGRADED" || row.dataQuality === "INSUFFICIENT" || row.dataQuality === "STALE" ? row.dataQuality : null,
      historyPoints: 0,
      features: [],
      signals: (row.signals ?? []).map((signal) => ({
        id: `${signal.strategyId}:${row.representationId}`,
        strategyId: signal.strategyId,
        strategyName: signal.strategyName,
        ticker: row.ticker,
        tokenSymbol: row.tokenSymbol,
        representationId: row.representationId,
        timestamp: snapshot.generatedAt,
        action: signal.action as "BUY" | "SELL" | "HOLD" | "NO_SIGNAL",
        evaluation: "VALID" as const,
        confidence: signal.confidence,
        reasons: [signal.reason],
        evidence: [signal.reason],
        featuresUsed: [],
        riskHints: [],
        validUntil: snapshot.generatedAt,
        dataQuality: "GOOD" as const,
        historyPoints: 0,
        tags: [],
        executable: false as const,
      })),
      candles: [],
      arbitration: row.arbitration
        ? ({
            asset: { id: row.representationId, ticker: row.ticker, userId: LOCAL_RUNTIME_USER_ID },
            timestamp: snapshot.generatedAt,
            decision: row.arbitration,
            selectedStrategy: null,
            selectedStrategyName: row.selectedStrategy,
            selectedAction: row.selectedAction,
            score: null,
            confidence: null,
            candidates: [],
            conflicts: [],
            evidence: { summary: row.reasons ?? "", supports: [], penalties: [], rejected: [] },
            dataQuality: "INSUFFICIENT",
            marketRegime: "UNKNOWN",
            marketSession: "UNKNOWN",
            validUntil: snapshot.generatedAt,
            version: "1.0",
            cooldownHeld: false,
            loopPhase: "WAITING_FOR_RISK",
            externalConfirmation: "NO_SIGNAL",
            externalConflict: "NONE",
            securityGate: "NOT_EVALUATED",
            externalFreshness: "NONE",
            historicalHealth: "NONE",
            historicalSample: "NONE",
          } as ObservationRow["arbitration"])
        : null,
    })),
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: snapshot.ok ? null : { category: "DATA_UNAVAILABLE", message: "Observation snapshot unavailable", httpStatus: null },
  };
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


