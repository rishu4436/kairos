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
import { defaultOperatorConfig } from "@/operator/config";
import { applyAutoProfile } from "@/operator/store";

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
      operatorConfig: liveMandate(),
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

  it("does not quote after risk rejection", async () => {
    const quote = vi.fn(async () => validQuote());
    const result = await runLive("LIVE_PREVIEW", {
      quote,
      build: vi.fn(),
      simulate: vi.fn(),
      riskPolicy: policy({ liveTradingEnabled: false }),
    });
    expect(quote).toHaveBeenCalledTimes(0);
    expect(result.assetResults[0]?.executionState).toBe("RISK_REJECTED");
    expect(result.walletSubmitted).toBe(false);
  });

  it("does not quote on a suspicious candle series even with a strong BUY", async () => {
    const quote = vi.fn(async () => validQuote());
    const extreme = {
      timestampMs: NOW,
      open: 380_000_000n,
      high: 16_044_000_000n,
      low: 370_000_000n,
      close: 380_000_000n,
      volume: 10_000_000n,
      tradeCount: 1,
    };
    const result = await runLive("LIVE_PREVIEW", {
      quote,
      build: vi.fn(),
      simulate: vi.fn(),
      candles: new Map([["56:nvda", [extreme]]]),
      confidence: 0.99,
    });
    expect(quote).toHaveBeenCalledTimes(0);
    expect(result.createdIntentIds).toEqual([]);
    expect(result.assetResults[0]?.executionState).toBe("MARKET_DATA_SUSPICIOUS");
    expect(result.assetResults[0]?.arbitrationDecision).toBe("SELECT_STRATEGY");
  });

  it("does not quote on stale or insufficient data", async () => {
    const quote = vi.fn(async () => validQuote());
    const stale = await runLive("LIVE_PREVIEW", { quote, build: vi.fn(), simulate: vi.fn(), dataQuality: "STALE" });
    expect(quote).toHaveBeenCalledTimes(0);
    expect(stale.createdIntentIds).toEqual([]);
    const missing = await runLive("LIVE_PREVIEW", { quote, build: vi.fn(), simulate: vi.fn(), dataQuality: "INSUFFICIENT" });
    expect(quote).toHaveBeenCalledTimes(0);
    expect(missing.createdIntentIds).toEqual([]);
  });

  it("does not build when the quote is expired", async () => {
    const build = vi.fn();
    const expired = validQuote();
    expired.expiresAt = new Date(NOW - 1).toISOString();
    const result = await runLive("LIVE", {
      quote: vi.fn(async () => expired),
      build,
      simulate: vi.fn(),
    });
    expect(build).toHaveBeenCalledTimes(0);
    expect(result.walletSubmitted).toBe(false);
    expect(result.preparations[0]?.quote?.status).toBe("EXPIRED");
  });

  it("does not submit a wallet after simulation failure", async () => {
    const result = await runLive("LIVE", {
      quote: vi.fn(async () => validQuote()),
      build: vi.fn(async () => validBuild()),
      simulate: vi.fn(async () => ({
        outcome: "FAIL" as const,
        simulationId: null,
        timestamp: null,
        gas: null,
        failureReason: "reverted",
        status: "FAILED",
        errorCategory: "SIMULATION_FAILED",
      })),
    });
    expect(result.liveGate).not.toBe("READY_FOR_WALLET");
    expect(result.walletSubmitted).toBe(false);
    expect(result.signed).toBe(false);
    expect(result.preparations[0]?.state).toBe("TRANSACTION_REJECTED");
  });

  it("stops when lease renewal fails before quoting", async () => {
    const store = new InMemoryKairosStateStore();
    store.renewLease = () => ({ ok: false, reason: "LEASE_NOT_OWNER" });
    const quote = vi.fn(async () => validQuote());
    const result = await runLive("LIVE_PREVIEW", { quote, build: vi.fn(), simulate: vi.fn(), store });
    expect(quote).toHaveBeenCalledTimes(0);
    expect(result.errors.some((error) => error.code === "LEASE_UNAVAILABLE")).toBe(true);
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
      operatorConfig: liveMandate("LIVE"),
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

function liveMandate(mode: "LIVE" | "LIVE_PREVIEW" = "LIVE_PREVIEW") {
  const config = applyAutoProfile(defaultOperatorConfig(new Date(NOW).toISOString()), "MEDIUM", new Date(NOW).toISOString());
  config.runtime.executionMode = mode;
  config.risk.liveTradingEnabled = mode === "LIVE";
  config.watchlist = {
    version: 1,
    entries: [{ ticker: "NVDA", representationId: "56:nvda", chainId: "56", contractAddress: null, source: "AUTO", pinned: false }],
  };
  return config;
}

async function runLive(
  executionMode: "LIVE" | "LIVE_PREVIEW",
  extra: {
    quote: ReturnType<typeof vi.fn>;
    build: ReturnType<typeof vi.fn>;
    simulate: ReturnType<typeof vi.fn>;
    riskPolicy?: ReturnType<typeof policy>;
    candles?: Map<string, readonly { timestampMs: number; open: bigint; high: bigint; low: bigint; close: bigint; volume: bigint | null; tradeCount: number | null }[]>;
    confidence?: number;
    dataQuality?: "GOOD" | "STALE" | "INSUFFICIENT" | "DEGRADED";
    store?: InMemoryKairosStateStore;
  },
) {
  return runKairosAutonomousCycle({
    userId: ids.userId,
    agentId: ids.agentId,
    runtimeMode: "LOCAL",
    executionMode,
    cycleTrigger: "MANUAL",
    startedAtMs: NOW,
    ownerId: "live-test",
    store: extra.store ?? new InMemoryKairosStateStore(),
    observeMarket: () => snapshot({ candles: extra.candles, confidence: extra.confidence, dataQuality: extra.dataQuality }),
    riskPolicy: extra.riskPolicy ?? policy({ liveTradingEnabled: true }),
    account: accountState({ accountId: paperAccountId(ids.userId) }),
    operatorConfig: liveMandate(executionMode),
    livePreparation: {
      capability: issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
      quote: { quote: extra.quote, build: extra.build },
      simulation: { simulate: extra.simulate },
      walletAddress: WALLET,
      chainId: "56",
      stockDecimals: 18,
      usdtDecimals: 6,
    },
  });
}

function snapshot(overrides: { candles?: Map<string, readonly { timestampMs: number; open: bigint; high: bigint; low: bigint; close: bigint; volume: bigint | null; tradeCount: number | null }[]>; confidence?: number; dataQuality?: "GOOD" | "STALE" | "INSUFFICIENT" | "DEGRADED" } = {}) {
  const userId = asUserId(ids.userId);
  const decision: ArbitrationDecision = {
    asset: { id: "56:nvda", ticker: "NVDA", userId },
    timestamp: new Date(NOW).toISOString(),
    decision: "SELECT_STRATEGY",
    selectedStrategy: "momentum",
    selectedStrategyName: "Momentum",
    selectedAction: "BUY",
    score: 0.8,
    confidence: overrides.confidence ?? 0.7,
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
    dataQuality: overrides.dataQuality ?? "GOOD",
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
  return { board, candles: overrides.candles ?? new Map() };
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

