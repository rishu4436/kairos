import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_EXTERNAL_POLICY, type ArbitrationDecision } from "@/domain/arbitration";
import { issueLiveExecutionContext, resetExecutionAuthority } from "@/domain/execution-authority";
import type { QuoteResult, TransactionBuildResult } from "@/domain/execution-prep";
import type { ObservationBoard, ObservationRow } from "@/domain/observation";
import { asUserId } from "@/domain/ids";
import { paperAccountId } from "@/paper/store";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import { InMemoryKairosStateStore, resetAutonomousStore } from "@/runtime/store";
import { accountState, ids, policy } from "@/test/fixtures";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const WALLET = "0x1111111111111111111111111111111111111111";
const STOCK = "0x2222222222222222222222222222222222222222";

beforeEach(() => {
  resetExecutionAuthority();
  resetAutonomousStore();
});

describe("canonical live pipeline", () => {
  it("runs LIVE_PREVIEW through quote/build/simulation and never submits a wallet order", async () => {
    const quote = vi.fn(async () => validQuote());
    const build = vi.fn(async () => validBuild());
    const simulate = vi.fn(async () => passSimulation());
    const result = await runKairosAutonomousCycle({
      userId: ids.userId,
      agentId: ids.agentId,
      runtimeMode: "LOCAL",
      executionMode: "LIVE_PREVIEW",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW,
      ownerId: "preview-owner",
      store: new InMemoryKairosStateStore(),
      observeMarket: () => snapshot(),
      riskPolicy: policy({ liveTradingEnabled: true }),
      account: accountState({ accountId: paperAccountId(ids.userId) }),
      livePreparation: {
        capability: issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
        quote: { quote, build },
        simulation: { simulate },
        walletAddress: WALLET,
        chainId: "56",
        stockDecimals: 18,
        usdtDecimals: 6,
      },
    });
    expect(result.liveGate).toBe("TRANSACTION_SIMULATED");
    expect(result.signed).toBe(false);
    expect(result.broadcast).toBe(false);
    expect(result.walletOrderId).toBeNull();
    expect(result.walletSubmitted).toBe(false);
    expect(result.preparations[0]?.state).toBe("TRANSACTION_SIMULATED");
    expect(result.assetResults[0]?.executionState).toBe("TRANSACTION_SIMULATED");
    expect(quote).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledOnce();
    expect(simulate).toHaveBeenCalledOnce();
  });

  it("reaches READY_FOR_WALLET in LIVE without submitting", async () => {
    const result = await runKairosAutonomousCycle({
      userId: ids.userId,
      agentId: ids.agentId,
      runtimeMode: "LOCAL",
      executionMode: "LIVE",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW,
      ownerId: "live-owner",
      store: new InMemoryKairosStateStore(),
      observeMarket: () => snapshot(),
      riskPolicy: policy({ liveTradingEnabled: true }),
      account: accountState({ accountId: paperAccountId(ids.userId) }),
      livePreparation: {
        capability: issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
        quote: { quote: vi.fn(async () => validQuote()), build: vi.fn(async () => validBuild()) },
        simulation: { simulate: vi.fn(async () => passSimulation()) },
        walletAddress: WALLET,
        chainId: "56",
        stockDecimals: 18,
        usdtDecimals: 6,
      },
    });
    expect(result.liveGate).toBe("READY_FOR_WALLET");
    expect(result.assetResults[0]?.executionState).toBe("READY_FOR_WALLET");
    expect(result.signed).toBe(false);
    expect(result.broadcast).toBe(false);
    expect(result.walletSubmitted).toBe(false);
  });
});

function snapshot() {
  const userId = asUserId(ids.userId);
  const decision: ArbitrationDecision = {
    asset: { id: "56:nvda", ticker: "NVDA", userId },
    timestamp: new Date(NOW).toISOString(),
    decision: "SELECT_STRATEGY",
    selectedStrategy: "momentum",
    selectedStrategyName: "Momentum",
    selectedAction: "BUY",
    score: 0.8,
    confidence: 0.7,
    candidates: [],
    conflicts: [],
    evidence: { summary: "Momentum selected", supports: ["Trend up"], penalties: [], rejected: [] },
    dataQuality: "GOOD",
    marketRegime: "TRENDING_UP",
    marketSession: "OPEN",
    validUntil: new Date(NOW + 15 * 60 * 1000).toISOString(),
    version: "1.0",
    cooldownHeld: false,
    loopPhase: "WAITING_FOR_RISK",
    ...NEUTRAL_EXTERNAL_POLICY,
  };
  const row: ObservationRow = {
    id: "56:nvda",
    ticker: "NVDA",
    companyName: "NVIDIA",
    tokenSymbol: "NVDAon",
    platformLabel: "Ondo",
    chainLabel: "BNB Smart Chain",
    contractAddress: STOCK,
    chainId: "56",
    price: "100.00",
    referencePrice: "100.00",
    deviationPct: 0,
    change24hPct: null,
    session: "OPEN",
    sessionLabel: "OPEN",
    rawMarketStatus: "regular",
    freshness: "FRESH",
    freshnessLabel: "FRESH",
    ageMs: 1_000,
    sourceTimestamp: new Date(NOW).toISOString(),
    receivedAt: new Date(NOW).toISOString(),
    volume24hUsd: null,
    nextOpenAt: null,
    reasonMessage: null,
    fidelity: "live",
    representationId: "56:nvda",
    regime: "TRENDING_UP",
    regimeDetail: null,
    dataQuality: "GOOD",
    historyPoints: 48,
    features: [],
    signals: [],
    candles: [],
    arbitration: decision,
  };
  const board: ObservationBoard = {
    ok: true,
    dataMode: "live",
    refreshIntervalMs: 15_000,
    freshMaxMs: 30_000,
    agingMaxMs: 120_000,
    generatedAt: new Date(NOW).toISOString(),
    userId,
    watchlistId: "wl",
    health: {
      connection: "connected",
      reason: null,
      httpStatus: 200,
      lastSuccessAt: new Date(NOW).toISOString(),
      rwa: "ok",
      market: "ok",
      history: "ok",
    },
    rows: [row],
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: null,
  };
  return { board, candles: new Map() };
}

function validQuote(): QuoteResult {
  return {
    status: "VALID",
    quoteId: "quote-1",
    route: { quoteId: "quote-1", vendorName: "Lifi", executionMode: "RFQ" },
    inputAsset: "usdt",
    outputAsset: STOCK,
    inputAmount: "1000000",
    expectedOutput: "10",
    executionPrice: null,
    priceImpact: "0.10",
    slippage: null,
    fees: null,
    expiresAt: new Date(NOW + 30_000).toISOString(),
    source: "Lifi",
    timestamp: null,
    createdAt: new Date(NOW).toISOString(),
    reason: null,
  };
}

function validBuild(): TransactionBuildResult {
  return {
    chainId: "56",
    from: WALLET,
    to: "0x3333333333333333333333333333333333333333",
    data: "0x12aa",
    value: "0",
    gas: "200000",
    gasPrice: null,
    maxPriorityFeePerGas: null,
    minReceiveAmount: null,
    slippagePercent: "0.5",
    executionMode: "RFQ",
    quoteId: "quote-1",
    requestId: null,
  };
}

function passSimulation() {
  return {
    outcome: "PASS" as const,
    simulationId: null,
    timestamp: new Date(NOW).toISOString(),
    gas: null,
    failureReason: null,
    status: "SUCCESS",
    errorCategory: null,
  };
}

