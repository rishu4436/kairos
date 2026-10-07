import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ObservationBoard, ObservationRow } from "@/domain/observation";
import { enrichBoard } from "@/observation/analyze";
import { observationUniverse } from "@/operator/active-universe";
import { mandateReady } from "@/operator/active-universe";
import { admitOperatorAction, controlFace } from "@/operator/mandate";
import { applyAutoProfile, readOperatorConfig, writeOperatorConfig } from "@/operator/store";
import { defaultOperatorConfig, riskPolicyFromOperator } from "@/operator/config";
import { saveMandate } from "@/operator/actions";
import { writeControl } from "@/operator/commands";
import { parseDecimal } from "@/domain/money";
import { bpsOf } from "@/operator/mandate";
import { planAssetIntent } from "@/execution/plan";
import { readDcaState } from "@/strategies/dca-state";
import { InMemoryKairosStateStore } from "@/runtime/store";
import { accountState, ids, policy } from "@/test/fixtures";
import { NEUTRAL_EXTERNAL_POLICY, type ArbitrationDecision } from "@/domain/arbitration";
import type { Candle } from "@/domain/candle";

describe("final canonical integration", () => {
  it("resolves live observation from the mandate instead of the static watchlist", () => {
    const source = readFileSync("observation/live.ts", "utf8");
    expect(source).toContain("observationUniverse");
    expect(source).toContain("operator: mandate");
    const manual = defaultOperatorConfig();
    manual.mandate = { ...manual.mandate, operatorMode: "MANUAL", selectedManualStrategies: ["momentum"], selectedManualAssets: ["TSLA"] };
    const universe = observationUniverse(manual);
    expect(universe.ok).toBe(true);
    if (universe.ok) {
      expect(universe.watchlist.tickers).toEqual(["TSLA"]);
    }
  });

  it("evaluates only the manually selected strategy", () => {
    const config = defaultOperatorConfig();
    config.mandate = { ...config.mandate, operatorMode: "MANUAL", selectedManualStrategies: ["momentum"], selectedManualAssets: ["TSLA"] };
    const board = enrichBoard(boardFor(["TSLA", "NVDA"]), { candles: candleMap(["TSLA", "NVDA"]), asOfMs: Date.parse("2026-10-07T15:00:00.000Z"), historyHealth: "ok", operator: config });
    const ids = new Set(board.recentEvaluations.map((signal) => signal.strategyId));
    expect(ids.has("momentum")).toBe(true);
    expect(ids.has("mean-reversion")).toBe(false);
    expect(ids.has("dca")).toBe(false);
    expect(board.rows.map((row) => row.ticker)).toEqual(["TSLA"]);
  });

  it("fills a bounded auto watchlist or reports it empty", () => {
    const filled = applyAutoProfile(defaultOperatorConfig(), "LOW", "2026-10-07T00:00:00.000Z");
    expect(filled.watchlist.entries.length).toBeGreaterThan(0);
    expect(filled.watchlist.entries.length).toBeLessThanOrEqual(5);
    expect(filled.watchlist.entries.every((entry) => entry.source === "AUTO" || entry.pinned)).toBe(true);
    expect(mandateReady(filled)).toBe(true);
    const empty = defaultOperatorConfig();
    empty.mandate.operatorMode = "AUTO";
    empty.mandate.autoProfile = "LOW";
    empty.mandate.autoProfileVersion = "2026-10-07";
    empty.watchlist.entries = [];
    expect(observationUniverse(empty)).toEqual({ ok: false, reason: "AUTO_WATCHLIST_EMPTY" });
  });

  it("rejects run and one-cycle until a mandate is ready, and saving a mandate does not start the agent", () => {
    const store = new InMemoryKairosStateStore();
    const initial = defaultOperatorConfig();
    expect(mandateReady(initial)).toBe(false);
    expect(admitOperatorAction("RUN", controlFace("STOPPED", false), mandateReady(initial)).ok).toBe(false);
    expect(admitOperatorAction("ONE_CYCLE", controlFace("STOPPED", false), mandateReady(initial)).ok).toBe(false);
    writeControl("STOPPED", store, "2026-10-07T00:00:00.000Z");
    const saved = saveMandate({ mode: "AUTO", profile: "HIGH" }, store, "2026-10-07T00:00:00.000Z");
    expect(saved.ok).toBe(true);
    expect(store.readControl("user_demo", "agent_demo")).toBe("STOPPED");
    if (saved.ok) {
      expect(saved.config.capital.deployableCapitalBps).toBe(7000);
      expect(saved.config.mandate.autoProfile).toBe("HIGH");
    }
  });

  it("derives DCA order and budget from deployable percentages and does not fill during preview planning", () => {
    const config = applyAutoProfile(defaultOperatorConfig(), "HIGH", "2026-10-07T00:00:00.000Z");
    config.mandate.operatorMode = "MANUAL";
    config.mandate.selectedManualStrategies = ["dca"];
    config.mandate.selectedManualAssets = ["TSLA"];
    config.strategies.dca.enabled = true;
    const deployable = bpsOf(parseDecimal("1000"), config.capital.deployableCapitalBps);
    const order = bpsOf(deployable, config.capital.dcaOrderBpsOfDeployable);
    const budget = bpsOf(deployable, config.capital.dcaMaxBudgetBpsOfDeployable);
    expect(order).toBe(bpsOf(deployable, 800));
    expect(budget).toBe(bpsOf(deployable, 3500));
    const before = readDcaState(ids.userId, ids.agentId, "56:TSLA");
    planAssetIntent({
      userId: ids.userId,
      agentId: ids.agentId,
      nowMs: Date.parse("2026-10-07T15:00:00.000Z"),
      row: buyRow("TSLA", "dca"),
      account: accountState({ cash: parseDecimal("1000") }),
      riskPolicy: policy({ allowedAssets: ["TSLA"] }),
      operatorConfig: config,
      venue: "live",
    });
    planAssetIntent({
      userId: ids.userId,
      agentId: ids.agentId,
      nowMs: Date.parse("2026-10-07T16:00:00.000Z"),
      row: buyRow("TSLA", "dca"),
      account: accountState({ cash: parseDecimal("1000") }),
      riskPolicy: policy({ allowedAssets: ["TSLA"] }),
      operatorConfig: config,
      venue: "live",
    });
    expect(readDcaState(ids.userId, ids.agentId, "56:TSLA")).toEqual(before);
  });

  it("connects percentage daily loss to the effective risk policy", () => {
    const config = applyAutoProfile(defaultOperatorConfig(), "LOW", "2026-10-07T00:00:00.000Z");
    const risk = riskPolicyFromOperator(config, parseDecimal("1000"));
    const deployable = bpsOf(parseDecimal("1000"), 3000);
    expect(risk.maxDailyLoss).toBe(bpsOf(deployable, config.capital.dailyLossBpsOfDeployable));
    expect(risk.paperTradingEnabled).toBe(false);
  });

  it("keeps manual strategy edits from clearing assets", () => {
    const store = new InMemoryKairosStateStore();
    const config = defaultOperatorConfig();
    config.mandate.operatorMode = "MANUAL";
    config.mandate.selectedManualStrategies = ["momentum"];
    config.mandate.selectedManualAssets = ["TSLA"];
    writeOperatorConfig(config, store);
    const current = readOperatorConfig(store);
    current.strategies.momentum.minReturnBps = 80;
    writeOperatorConfig(current, store);
    expect(readOperatorConfig(store).mandate.selectedManualAssets).toEqual(["TSLA"]);
    expect(readOperatorConfig(store).mandate.selectedManualStrategies).toEqual(["momentum"]);
  });
});

function boardFor(tickers: string[]): ObservationBoard {
  return {
    ok: true,
    dataMode: "live",
    refreshIntervalMs: 15000,
    freshMaxMs: 30000,
    agingMaxMs: 120000,
    generatedAt: "2026-10-07T15:00:00.000Z",
    userId: "user_demo",
    watchlistId: "wl",
    health: { connection: "connected", reason: null, httpStatus: null, lastSuccessAt: "2026-10-07T15:00:00.000Z", rwa: "ok", market: "ok", history: "ok" },
    rows: tickers.map((ticker) => row(ticker)),
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: null,
  };
}

function candleMap(tickers: string[]): Map<string, Candle[]> {
  const candles = Array.from({ length: 30 }, (_, index) => ({
    timestampMs: Date.parse("2026-10-07T15:00:00.000Z") - (30 - index) * 900_000,
    open: parseDecimal(String(100 + index)),
    high: parseDecimal(String(101 + index)),
    low: parseDecimal(String(99 + index)),
    close: parseDecimal(String(100 + index)),
    volume: null,
    tradeCount: null,
  }));
  return new Map(tickers.map((ticker) => [`56:${ticker}`, candles]));
}

function row(ticker: string): ObservationRow {
  return buyRow(ticker, "momentum");
}

function buyRow(ticker: string, strategyId: string): ObservationRow {
  const decision: ArbitrationDecision = {
    asset: { id: `56:${ticker}`, ticker, userId: ids.userId },
    timestamp: "2026-10-07T15:00:00.000Z",
    decision: "SELECT_STRATEGY",
    selectedStrategy: strategyId,
    selectedStrategyName: strategyId,
    selectedAction: "BUY",
    score: 0.8,
    confidence: 0.7,
    candidates: [],
    conflicts: [],
    evidence: { summary: "selected", supports: [], penalties: [], rejected: [] },
    dataQuality: "GOOD",
    marketRegime: "TRENDING_UP",
    marketSession: "OPEN",
    validUntil: "2026-10-07T15:15:00.000Z",
    version: "1.0",
    cooldownHeld: false,
    loopPhase: "WAITING_FOR_RISK",
    ...NEUTRAL_EXTERNAL_POLICY,
  };
  return {
    id: `56:${ticker}`,
    ticker,
    companyName: ticker,
    tokenSymbol: ticker,
    platformLabel: "bStock",
    chainLabel: "BNB Smart Chain",
    contractAddress: null,
    price: "100",
    referencePrice: "100",
    deviationPct: 0,
    change24hPct: null,
    session: "OPEN",
    sessionLabel: "OPEN",
    rawMarketStatus: "open",
    freshness: "FRESH",
    freshnessLabel: "FRESH",
    ageMs: 1000,
    sourceTimestamp: "2026-10-07T15:00:00.000Z",
    receivedAt: "2026-10-07T15:00:00.000Z",
    volume24hUsd: null,
    nextOpenAt: null,
    reasonMessage: null,
    fidelity: "paper",
    representationId: `56:${ticker}`,
    regime: "TRENDING_UP",
    regimeDetail: null,
    dataQuality: "GOOD",
    historyPoints: 30,
    features: [],
    signals: [],
    candles: [],
    arbitration: decision,
  } as ObservationRow;
}
