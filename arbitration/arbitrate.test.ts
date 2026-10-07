import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ArbitrationContext, PriorSelection, StrategyEvaluation } from "@/domain/arbitration";
import type { DataQuality } from "@/domain/quality";
import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { SignalAction } from "@/domain/signal";
import { arbitrateAsset } from "@/arbitration/arbitrate";
import { InMemoryArbitrationMemory } from "@/arbitration/memory";
import { MIN_STRATEGY_HOLD_TIME_MS, MIN_STRATEGY_SWITCH_DELTA } from "@/arbitration/policy";
import { StrategyArbitrator } from "@/arbitration/service";

const AS_OF = Date.parse("2026-04-10T15:00:00.000Z");

const quality = (status: DataQuality["status"] = "GOOD"): DataQuality => ({
  status,
  historyPoints: 48,
  latestAgeMs: 4000,
  referenceAgeMs: 4000,
  missingFields: [],
});

function context(overrides: Partial<ArbitrationContext> = {}): ArbitrationContext {
  return {
    userId: "user_a",
    asset: { id: "rep-nvda", ticker: "NVDA" },
    timestamp: new Date(AS_OF).toISOString(),
    asOfMs: AS_OF,
    regime: "TRENDING_UP",
    session: "OPEN",
    dataQuality: quality(),
    freshness: "FRESH",
    pricePresent: true,
    referencePresent: true,
    historyPoints: 48,
    featureIds: ["return_1h", "sma_20", "trend", "realized_volatility_20", "data_freshness", "distance_from_mean", "reference_deviation"],
    priorSelection: null,
    ...overrides,
  };
}

function evaluation(overrides: Partial<StrategyEvaluation> = {}): StrategyEvaluation {
  const strategyId = overrides.signalStrategyId ?? "momentum";
  return {
    signalStrategyId: strategyId,
    strategyName: overrides.strategyName ?? (strategyId === "mean-reversion" ? "Mean reversion" : strategyId === "weekend" ? "Weekend / off-hours" : "Momentum"),
    status: "implemented",
    supportedAssets: ["*"],
    supportedSessions: ["*"],
    minHistory: strategyId === "weekend" ? 0 : strategyId === "mean-reversion" ? 20 : 21,
    requiresReference: strategyId === "weekend",
    action: "BUY",
    evaluation: "SIGNAL",
    confidence: 0.76,
    evidence: ["1h return +1.20%.", "Close is above the 20-period average.", "Trend UP."],
    featuresUsed: strategyId === "weekend" ? ["reference_deviation", "data_freshness"] : ["return_1h", "sma_20", "trend"],
    tags: strategyId === "momentum" ? ["MOMENTUM"] : [],
    validUntil: new Date(AS_OF + 15 * 60 * 1000).toISOString(),
    signalTimestamp: new Date(AS_OF).toISOString(),
    signalQuality: "GOOD",
    ...overrides,
  };
}

function side(strategyId: string, action: SignalAction, confidence: number, extra: Partial<StrategyEvaluation> = {}): StrategyEvaluation {
  return evaluation({
    signalStrategyId: strategyId,
    action,
    confidence,
    evaluation: "SIGNAL",
    tags: action === "HOLD" ? ["OFF_HOURS_DISLOCATION", "REFERENCE_DEVIATION"] : strategyId === "momentum" ? ["MOMENTUM"] : [],
    ...extra,
  });
}

describe("strategy arbitration", () => {
  it("selects the only eligible strategy", () => {
    const decision = arbitrateAsset(context(), [
      evaluation(),
      evaluation({ signalStrategyId: "mean-reversion", action: "HOLD", evaluation: "VALID", confidence: 0.4, tags: [] }),
      evaluation({ signalStrategyId: "weekend", action: "NO_SIGNAL", evaluation: "NO_SIGNAL", confidence: 0, tags: [] }),
    ]);
    expect(decision.decision).toBe("SELECT_STRATEGY");
    expect(decision.selectedStrategy).toBe("momentum");
    expect(decision.selectedAction).toBe("BUY");
    expect(decision.loopPhase).toBe("WAITING_FOR_RISK");
    expect(decision.version).toBe("1.0");
  });

  it("confirms two strategies that agree on a side", () => {
    const decision = arbitrateAsset(context({ regime: "RANGE_BOUND" }), [
      side("momentum", "BUY", 0.8),
      side("mean-reversion", "BUY", 0.74),
      evaluation({ signalStrategyId: "weekend", action: "NO_SIGNAL", evaluation: "NO_SIGNAL", confidence: 0 }),
    ]);
    expect(decision.decision).toBe("MULTI_STRATEGY_CONFIRMATION");
    expect(decision.selectedAction).toBe("BUY");
    expect(decision.evidence.supports.join(" ")).toMatch(/confirms/);
    expect(decision.evidence.supports.join(" ")).toMatch(/not doubled/i);
    expect(decision.evidence.summary).not.toMatch(/order/i);
  });

  it("abstains when the top two scores are inside the margin", () => {
    const decision = arbitrateAsset(context({ session: "CLOSED", regime: "TRENDING_UP" }), [
      side("momentum", "BUY", 0.76),
      side("weekend", "HOLD", 0.76),
    ]);
    expect(decision.decision).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.selectedStrategy).toBeNull();
    expect(decision.selectedAction).toBeNull();
  });

  it("selects a clear leader over a much weaker candidate", () => {
    const decision = arbitrateAsset(context(), [
      side("momentum", "BUY", 0.84),
      evaluation({
        signalStrategyId: "mean-reversion",
        action: "HOLD",
        evaluation: "VALID",
        confidence: 0.4,
        evidence: ["Distance is inside the band."],
      }),
    ]);
    expect(decision.decision).toBe("SELECT_STRATEGY");
    expect(decision.selectedStrategy).toBe("momentum");
    const leader = decision.score ?? 0;
    const other = decision.candidates.find((candidate) => candidate.strategyId === "mean-reversion")?.score ?? 0;
    expect(leader - other).toBeGreaterThanOrEqual(0.08);
  });

  it("represents a buy against a sell as a conflict and does not pick a winner", () => {
    const decision = arbitrateAsset(context(), [side("momentum", "BUY", 0.8), side("mean-reversion", "SELL", 0.76)]);
    expect(decision.decision).toBe("CONFLICT");
    expect(decision.selectedStrategy).toBeNull();
    expect(decision.selectedAction).toBeNull();
    expect(decision.conflicts).toHaveLength(1);
    expect(decision.conflicts[0]?.summary).toMatch(/NO ACTION/);
    expect(decision.candidates.filter((candidate) => candidate.candidateStatus === "CONFLICTED").length).toBe(2);
  });

  it("blocks selection when the observation is stale", () => {
    const decision = arbitrateAsset(context({ freshness: "STALE", dataQuality: quality("STALE") }), [side("momentum", "BUY", 0.9)]);
    expect(decision.decision).toBe("DATA_BLOCKED");
    expect(decision.selectedStrategy).toBeNull();
    expect(decision.candidates.every((candidate) => candidate.candidateStatus !== "SELECTED")).toBe(true);
  });

  it("rejects a stale strategy even when another candidate is fresh", () => {
    const decision = arbitrateAsset(context(), [
      side("momentum", "BUY", 0.8),
      side("mean-reversion", "BUY", 0.8, { evaluation: "STALE_DATA", action: "NO_SIGNAL", confidence: 0, signalQuality: "STALE" }),
    ]);
    expect(decision.selectedStrategy).not.toBe("mean-reversion");
    expect(decision.candidates.find((candidate) => candidate.strategyId === "mean-reversion")?.candidateStatus).toBe("STALE");
  });

  it("does not select regime strategies when the regime is unknown", () => {
    const decision = arbitrateAsset(context({ regime: "UNKNOWN" satisfies MarketRegime }), [
      side("momentum", "BUY", 0.9),
      side("mean-reversion", "BUY", 0.9),
    ]);
    expect(decision.decision).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.selectedStrategy).toBeNull();
  });

  it("rejects the weekend strategy during an open session", () => {
    const decision = arbitrateAsset(context({ session: "OPEN" satisfies MarketSessionState }), [
      side("weekend", "HOLD", 0.8),
      evaluation({ action: "HOLD", evaluation: "VALID", confidence: 0.4 }),
    ]);
    expect(decision.selectedStrategy).not.toBe("weekend");
    expect(decision.candidates.find((candidate) => candidate.strategyId === "weekend")?.rejectionReason).toMatch(/Session/);
  });

  it("allows the weekend strategy during a closed session when it is the only signal", () => {
    const decision = arbitrateAsset(context({ session: "CLOSED", regime: "UNKNOWN" }), [side("weekend", "HOLD", 0.8)]);
    expect(decision.decision).toBe("SELECT_STRATEGY");
    expect(decision.selectedStrategy).toBe("weekend");
    expect(decision.selectedAction).toBe("HOLD");
  });

  it("does not treat a below-minimum signal as a selection", () => {
    const decision = arbitrateAsset(context({ regime: "HIGH_VOLATILITY", dataQuality: quality("DEGRADED"), freshness: "SAMPLE" }), [
      side("momentum", "BUY", 0.55, { evidence: ["short"] }),
    ]);
    expect(decision.decision === "SELECT_STRATEGY" || decision.decision === "MULTI_STRATEGY_CONFIRMATION").toBe(false);
    expect(decision.selectedStrategy).toBeNull();
  });

  it("holds the incumbent inside the window and switches after it", () => {
    const rows = [side("momentum", "BUY", 0.6), side("weekend", "HOLD", 0.99)];
    const held = context({
      session: "CLOSED",
      priorSelection: {
        userId: "user_a",
        assetId: "rep-nvda",
        strategyId: "momentum",
        action: "BUY",
        score: 0.9,
        selectedAtMs: AS_OF - 60_000,
      },
    });
    const during = arbitrateAsset(held, rows);
    const after = arbitrateAsset(
      context({
        session: "CLOSED",
        priorSelection: {
          userId: "user_a",
          assetId: "rep-nvda",
          strategyId: "momentum",
          action: "BUY",
          score: 0.9,
          selectedAtMs: AS_OF - MIN_STRATEGY_HOLD_TIME_MS - 1,
        },
      }),
      rows,
    );
    expect(during.decision).toBe("SELECT_STRATEGY");
    expect(during.cooldownHeld).toBe(true);
    expect(during.selectedStrategy).toBe("momentum");
    expect(after.cooldownHeld).toBe(false);
    expect(after.selectedStrategy).toBe("weekend");
    expect(MIN_STRATEGY_SWITCH_DELTA).toBe(0.08);
  });

  it("arbitrates each asset on its own and ignores another user's prior selection", () => {
    const shared: PriorSelection = {
      userId: "user_b",
      assetId: "rep-nvda",
      strategyId: "mean-reversion",
      action: "SELL",
      score: 0.99,
      selectedAtMs: AS_OF - 1000,
    };
    const nvda = arbitrateAsset(context({ priorSelection: shared }), [side("momentum", "BUY", 0.8)]);
    const tsla = arbitrateAsset(context({ asset: { id: "rep-tsla", ticker: "TSLA" }, regime: "RANGE_BOUND" }), [
      side("mean-reversion", "BUY", 0.8),
    ]);
    expect(nvda.selectedStrategy).toBe("momentum");
    expect(nvda.cooldownHeld).toBe(false);
    expect(tsla.asset.ticker).toBe("TSLA");
    expect(tsla.selectedStrategy).toBe("mean-reversion");
    expect(nvda.asset.id).not.toBe(tsla.asset.id);
  });

  it("never lets a coming-soon strategy win", () => {
    const decision = arbitrateAsset(context(), [
      evaluation({
        signalStrategyId: "arbitrage",
        strategyName: "Cross-representation arbitrage",
        status: "coming_soon",
        confidence: 0.99,
        action: "BUY",
        evaluation: "SIGNAL",
        supportedAssets: ["*"],
        minHistory: 0,
        featuresUsed: ["return_1h"],
      }),
    ]);
    expect(decision.selectedStrategy).toBeNull();
    expect(decision.decision).not.toBe("SELECT_STRATEGY");
    expect(decision.candidates[0]?.rejectionReason).toMatch(/Coming-soon/);
  });

  it("does not turn insufficient data into a selected strategy", () => {
    const decision = arbitrateAsset(context({ historyPoints: 2 }), [
      evaluation({ evaluation: "INSUFFICIENT_DATA", action: "NO_SIGNAL", confidence: 0, signalQuality: "INSUFFICIENT", evidence: [] }),
    ]);
    expect(decision.selectedStrategy).toBeNull();
    expect(decision.decision === "SELECT_STRATEGY" || decision.decision === "MULTI_STRATEGY_CONFIRMATION").toBe(false);
    expect(decision.candidates[0]?.candidateStatus).toBe("INSUFFICIENT_DATA");
  });

  it("returns the same decision for the same input", () => {
    const input = context();
    const rows = [side("momentum", "BUY", 0.8), side("mean-reversion", "SELL", 0.74)];
    expect(JSON.stringify(arbitrateAsset(input, rows))).toBe(JSON.stringify(arbitrateAsset(input, rows)));
  });

  it("keeps per-user memory separate and does not touch a risk policy", () => {
    const policy = Object.freeze({ maxPosition: 1n, liveTrading: false });
    const before = { ...policy };
    const memory = new InMemoryArbitrationMemory();
    const arbitrator = new StrategyArbitrator(memory);
    const first = arbitrator.arbitrate(context(), [evaluation()]);
    const other = arbitrator.arbitrate(context({ userId: "user_b", asset: { id: "rep-tsla", ticker: "TSLA" }, regime: "RANGE_BOUND" }), [
      side("mean-reversion", "BUY", 0.8),
    ]);
    const again = arbitrator.arbitrate(context(), [evaluation()]);
    expect(first.selectedStrategy).toBe("momentum");
    expect(other.selectedStrategy).toBe("mean-reversion");
    expect(again.asset.userId).toBe("user_a");
    expect(again.selectedStrategy).toBe("momentum");
    expect(memory.read("user_b", "rep-nvda")).toBeNull();
    expect(policy).toEqual(before);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toMatch(/signature|broadcast|privateKey|tradeIntent|orderId/i);
  });

  it("does not import execution, wallets, or a model client", () => {
    const files = readdirSync(new URL(".", import.meta.url)).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/wallet\/|execution\/|signPrehash|broadcast|privateKey|createHmac|openai|fetch\(/);
    }
    const reasoning = readFileSync(new URL("./reasoning.ts", import.meta.url), "utf8");
    expect(reasoning).toMatch(/does not receive authority/);
    expect(reasoning).not.toMatch(/explain\(request\) \{/);
  });
});

