import { describe, expect, it } from "vitest";
import { NEUTRAL_EXTERNAL_POLICY, type ArbitrationDecision } from "@/domain/arbitration";
import type { ObservationRow } from "@/domain/observation";
import { parseDecimal } from "@/domain/money";
import { planAssetIntent } from "@/execution/plan";
import { applyAutoProfile, migrateOperatorConfig, writeOperatorConfig, readOperatorConfig } from "@/operator/store";
import { defaultOperatorConfig } from "@/operator/config";
import { requestOneCycle } from "@/operator/actions";
import { beginOperatorCycle } from "@/operator/cycle-lock";
import { operatorExecutionMode } from "@/operator/runtime-mode";
import { InMemoryKairosStateStore } from "@/runtime/store";
import { accountState, ids, policy } from "@/test/fixtures";
import { promoteThesis } from "@/research/promotion";
import { LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";

const NOW = Date.parse("2026-10-07T15:00:00.000Z");

describe("canonical mandate integration", () => {
  it("migrates PAPER operator state to preview and never to live", () => {
    const old = defaultOperatorConfig();
    old.runtime.executionMode = "PAPER";
    old.risk.liveTradingEnabled = true;
    const migrated = migrateOperatorConfig(old);
    expect(migrated.runtime.executionMode).toBe("LIVE_PREVIEW");
    expect(migrated.risk.liveTradingEnabled).toBe(false);
    expect(migrated.mandate.operatorMode).toBe("UNCONFIGURED");
    expect(operatorExecutionMode(migrated)).toBe("LIVE_PREVIEW");
  });

  it("persists AUTO LOW as percentage policy and profile version", () => {
    const store = new InMemoryKairosStateStore();
    const next = applyAutoProfile(defaultOperatorConfig(), "LOW", "2026-10-07T00:00:00.000Z");
    expect(writeOperatorConfig(next, store).ok).toBe(true);
    const saved = readOperatorConfig(store);
    expect(saved.mandate).toMatchObject({ operatorMode: "AUTO", autoProfile: "LOW", autoProfileVersion: "2026-10-07" });
    expect(saved.capital.deployableCapitalBps).toBe(3000);
    expect(saved.capital.perTradeBpsOfDeployable).toBe(800);
    expect(saved.runtime.executionMode).not.toBe("PAPER");
  });

  it("sizes the trade intent from deployable percentage and blocks assets outside a manual mandate", () => {
    const config = applyAutoProfile(defaultOperatorConfig(), "MEDIUM", "2026-10-07T00:00:00.000Z");
    config.mandate = {
      operatorMode: "MANUAL",
      autoProfile: null,
      autoProfileVersion: null,
      selectedManualStrategies: ["momentum"],
      selectedManualAssets: ["TSLA"],
    };
    config.capital.maxPerTradeNotional = "10000";
    const bought = planAssetIntent({
      userId: ids.userId,
      agentId: ids.agentId,
      nowMs: NOW,
      row: row("TSLA"),
      account: accountState({ cash: parseDecimal("1000"), sessionStartEquity: parseDecimal("1000") }),
      riskPolicy: policy({ allowedAssets: ["TSLA", "NVDA"] }),
      operatorConfig: config,
      venue: "paper",
    });
    expect(bought.kind === "NO_TRADE" ? bought.reason : bought.kind).toBe("READY");
    if (bought.kind === "READY") {
      expect(bought.sizing?.raw).toBe("50.00");
      expect(bought.sizing?.binding).toBe("PER_TRADE_PCT");
      expect(bought.intent.requestedNotional <= parseDecimal("50")).toBe(true);
      expect(bought.intent.requestedNotional > parseDecimal("49")).toBe(true);
    }
    const blocked = planAssetIntent({
      userId: ids.userId,
      agentId: ids.agentId,
      nowMs: NOW,
      row: row("NVDA"),
      account: accountState({ cash: parseDecimal("100") }),
      riskPolicy: policy(),
      operatorConfig: config,
      venue: "paper",
    });
    expect(blocked.kind).toBe("NO_TRADE");
  });

  it("returns a one-cycle to STOPPED and rejects a second while the lock is held", async () => {
    const store = new InMemoryKairosStateStore();
    expect(beginOperatorCycle(store, "holder")).toBe(true);
    await expect(requestOneCycle(store, NOW)).rejects.toThrow("CYCLE_IN_FLIGHT");
    const { endOperatorCycle } = await import("@/operator/cycle-lock");
    endOperatorCycle(store);
    const outcome = await requestOneCycle(store, NOW);
    expect(outcome.executionMode).toBe("LIVE_PREVIEW");
    expect(store.readControl(LOCAL_RUNTIME_USER_ID, "agent_demo")).toBe("STOPPED");
  });

  it("keeps a watchlist entry across a reloaded store", () => {
    const store = new InMemoryKairosStateStore();
    const config = defaultOperatorConfig();
    config.watchlist = {
      version: 2,
      entries: [{ ticker: "TSLA", representationId: "56:TSLA", chainId: "56", contractAddress: null, source: "USER", pinned: true }],
    };
    expect(writeOperatorConfig(config, store).ok).toBe(true);
    const record = store.get<typeof config>("kairos:v1:operator:config:user_demo:agent_demo");
    expect(record).toBeTruthy();
    const restarted = new InMemoryKairosStateStore();
    restarted.compareAndSet("kairos:v1:operator:config:user_demo:agent_demo", 0, record!.value, record!.updatedAt);
    expect(readOperatorConfig(restarted).watchlist.entries[0]?.pinned).toBe(true);
  });

  it("reports promotion eligibility without persisting a strategy", () => {
    const decision = promoteThesis({
      thesisId: "th_1",
      title: "TSLA Dip Recovery",
      metrics: { trades: 3, winRate: 0.66, expectancy: 1, maxDrawdownBps: 100, sampleSufficient: false, validationViolations: 0 },
    });
    expect(decision.status).toBe("INSUFFICIENT_SAMPLE");
    expect(decision.persisted).toBe(false);
  });
});

function row(ticker: string): ObservationRow {
  const decision: ArbitrationDecision = {
    asset: { id: `56:${ticker}`, ticker, userId: ids.userId },
    timestamp: "2026-10-07T15:00:00.000Z",
    decision: "SELECT_STRATEGY",
    selectedStrategy: "momentum",
    selectedStrategyName: "Momentum",
    selectedAction: "BUY",
    score: 0.8,
    confidence: 0.7,
    candidates: [],
    conflicts: [],
    evidence: { summary: "Momentum selected", supports: [], penalties: [], rejected: [] },
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
