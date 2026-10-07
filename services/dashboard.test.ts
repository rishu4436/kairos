import { describe, expect, it } from "vitest";
import { NEUTRAL_EXTERNAL_POLICY, type ArbitrationDecision } from "@/domain/arbitration";
import type { ObservationBoard, ObservationRow, SignalView } from "@/domain/observation";
import type { AgenticWalletAccount } from "@/domain/agentic-wallet";
import { getCommandCenterModel } from "@/services/command-center";
import { buildProductionDashboard } from "@/services/dashboard";
import { emptyHeartbeat } from "@/runtime/store";
import type { KairosCycleResult } from "@/runtime/types";

const NOW = "2026-10-07T13:35:41.493Z";

describe("production dashboard read model", () => {
  it("shows OFFLINE, empty live trades, and does not copy paper equity into live portfolio", () => {
    const paper = getCommandCenterModel();
    const view = buildProductionDashboard({
      dataMode: "live",
      board: emptyBoard(),
      heartbeat: emptyHeartbeat(),
      cycles: [],
      audits: [],
      wallet: disconnected(),
      balances: [],
      tokenScope: "OPERATOR_ATTESTED",
      paper,
    });
    expect(view.agent.status).toBe("OFFLINE");
    expect(view.executionMode).toBe("LIVE_PREVIEW");
    expect(view.liveTrades).toEqual([]);
    expect(view.livePortfolio.usdt).toBe("—");
    expect(view.preview.quote).toBe("NOT RUN");
    expect(view.preview.build).toBe("NOT RUN");
    expect(view.wallet.tokenScope).toBe("OPERATOR_ATTESTED");
    expect(view.paper.disclaimer).toMatch(/paper/i);
  });

  it("maps watchlist, strategy, and arbitration from the observation board", () => {
    const view = buildProductionDashboard({
      dataMode: "live",
      board: boardWithRow(),
      heartbeat: { ...emptyHeartbeat(), runtimeStatus: "RUNNING", lastCycleCompleted: NOW, nextCycleAt: "2026-10-07T13:36:41.493Z" },
      cycles: [cycle({ status: "COMPLETED" })],
      audits: [{ id: "a1", at: NOW, userId: "user_demo", agentId: "agent_demo", cycleId: "c1", type: "CYCLE_COMPLETED", message: "COMPLETED" }],
      wallet: connected(),
      balances: [
        { symbol: "USDT", contractAddress: "0x55d398326f99059ff775485246999027b3197955", chainId: "56", amount: "109.89", valueUsd: null },
        { symbol: "BNB", contractAddress: null, chainId: "56", amount: "0.008", valueUsd: null },
      ],
      tokenScope: "OPERATOR_ATTESTED",
      paper: getCommandCenterModel(),
    });
    expect(view.agent.status).toBe("RUNNING");
    expect(view.watchlist[0]).toMatchObject({
      ticker: "TSLA",
      tokenizedSymbol: "TSLAB",
      platform: "bStock",
      chain: "BNB Smart Chain",
      contract: "0x5b1910eaad6450e50f816082aa078c41f10c292f",
      price: "430.12",
      session: "CLOSED",
      regime: "RANGE_BOUND",
      dataQuality: "GOOD",
    });
    expect(view.strategies).toEqual([
      expect.objectContaining({ strategyId: "momentum", action: "HOLD", reason: "No trend" }),
    ]);
    expect(view.arbitration[0]).toMatchObject({ ticker: "TSLA", decision: "NO_OPPORTUNITY", selectedAction: "—" });
    expect(view.livePortfolio.usdt).toBe("109.89");
    expect(view.livePortfolio.bnb).toBe("0.008");
    expect(view.wallet.highRiskHandling).toBe("NeedConfirmation");
    expect(view.activity.some((item) => item.kind === "CYCLE_COMPLETED")).toBe(true);
  });

  it("marks DEGRADED from the latest cycle and does not invent a quote", () => {
    const view = buildProductionDashboard({
      dataMode: "live",
      board: emptyBoard(),
      heartbeat: { ...emptyHeartbeat(), runtimeStatus: "RUNNING", lastCycleCompleted: NOW },
      cycles: [cycle({ status: "DEGRADED" })],
      audits: [],
      wallet: disconnected(),
      balances: [],
      tokenScope: "TOKEN_SCOPE_UNVERIFIED",
      paper: getCommandCenterModel(),
    });
    expect(view.agent.status).toBe("DEGRADED");
    expect(view.riskExecution[0]?.executionState).toBe("ABSTAINED");
    expect(view.preview.quote).toBe("NOT RUN");
  });
});

function emptyBoard(): ObservationBoard {
  return {
    ok: true,
    dataMode: "live",
    refreshIntervalMs: 15_000,
    freshMaxMs: 30_000,
    agingMaxMs: 120_000,
    generatedAt: NOW,
    userId: "user_demo",
    watchlistId: "wl",
    health: {
      connection: "connected",
      reason: null,
      httpStatus: null,
      lastSuccessAt: NOW,
      rwa: "ok",
      market: "ok",
      history: "ok",
    },
    rows: [],
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: null,
  };
}

function boardWithRow(): ObservationBoard {
  const signal: SignalView = {
    id: "sig-1",
    strategyId: "momentum",
    strategyName: "Momentum",
    ticker: "TSLA",
    tokenSymbol: "TSLAB",
    representationId: "56:tslab",
    timestamp: NOW,
    action: "HOLD",
    evaluation: "VALID",
    confidence: 0.4,
    reasons: ["No trend"],
    evidence: [],
    featuresUsed: [],
    riskHints: [],
    validUntil: NOW,
    dataQuality: "GOOD",
    historyPoints: 20,
    tags: [],
    executable: false,
  };
  const arbitration: ArbitrationDecision = {
    asset: { id: "56:tslab", ticker: "TSLA", userId: "user_demo" },
    timestamp: NOW,
    decision: "NO_OPPORTUNITY",
    selectedStrategy: null,
    selectedStrategyName: null,
    selectedAction: null,
    score: null,
    confidence: null,
    candidates: [],
    conflicts: [],
    evidence: { summary: "No executable candidate", supports: [], penalties: [], rejected: [] },
    dataQuality: "GOOD",
    marketRegime: "RANGE_BOUND",
    marketSession: "CLOSED",
    validUntil: NOW,
    version: "1.0",
    cooldownHeld: false,
    loopPhase: "WAITING_FOR_RISK",
    ...NEUTRAL_EXTERNAL_POLICY,
  };
  const row: ObservationRow = {
    id: "56:tslab",
    ticker: "TSLA",
    companyName: "Tesla",
    tokenSymbol: "TSLAB",
    platformLabel: "bStock",
    chainLabel: "BNB Smart Chain",
    contractAddress: "0x5b1910eaad6450e50f816082aa078c41f10c292f",
    chainId: "56",
    price: "430.12",
    referencePrice: "430.00",
    deviationPct: 0.03,
    change24hPct: null,
    session: "CLOSED",
    sessionLabel: "CLOSED",
    rawMarketStatus: "closed",
    freshness: "FRESH",
    freshnessLabel: "FRESH",
    ageMs: 1000,
    sourceTimestamp: NOW,
    receivedAt: NOW,
    volume24hUsd: null,
    nextOpenAt: null,
    reasonMessage: null,
    fidelity: "live",
    representationId: "56:tslab",
    regime: "RANGE_BOUND",
    regimeDetail: null,
    dataQuality: "GOOD",
    historyPoints: 20,
    features: [],
    signals: [signal],
    candles: [],
    arbitration,
  };
  return { ...emptyBoard(), rows: [row] };
}

function cycle(overrides: Partial<KairosCycleResult>): KairosCycleResult {
  return {
    cycleId: "cycle_1",
    userId: "user_demo",
    agentId: "agent_demo",
    startedAt: NOW,
    completedAt: NOW,
    runtimeMode: "LOCAL",
    executionMode: "LIVE_PREVIEW",
    status: "COMPLETED",
    assetResults: [
      {
        assetId: "56:tslab",
        ticker: "TSLA",
        contextId: null,
        positionState: null,
        strategyDecision: null,
        arbitrationDecision: "NO_OPPORTUNITY",
        positionDecision: null,
        riskDecision: null,
        executionState: "ABSTAINED",
        status: "OK",
      },
    ],
    researchResults: [],
    errors: [],
    warnings: [],
    nextSuggestedRunAt: "2026-10-07T13:36:41.493Z",
    createdIntentIds: [],
    transitions: [{ state: "OBSERVING", at: NOW }, { state: "COMPLETED", at: NOW }],
    ...overrides,
  };
}

function disconnected(): AgenticWalletAccount {
  return {
    userId: "user_demo",
    agentId: "agent_demo",
    provider: "binance-agentic-wallet",
    accountId: null,
    walletAddress: null,
    supportedChains: [],
    connectionStatus: "UNCONNECTED",
    securityPolicy: null,
    lastUpdated: NOW,
  };
}

function connected(): AgenticWalletAccount {
  return {
    ...disconnected(),
    walletAddress: "0xc44edDcFfA4227d38bc92a7cA5990953AA7Ff0cF",
    connectionStatus: "CONNECTED",
    supportedChains: [{ binanceChainId: "56", name: "BSC" }],
    securityPolicy: {
      dailyLimit: 100,
      quotaUsed: 0,
      quotaLeft: 100,
      quotaDate: "2026-10-07",
      tradeAllTokens: false,
      highRiskHandling: "NeedConfirmation",
    },
  };
}
