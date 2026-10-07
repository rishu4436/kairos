import { afterEach, describe, expect, it } from "vitest";
import { arbitrateAsset } from "@/arbitration/arbitrate";
import type { ArbitrationContext, StrategyEvaluation } from "@/domain/arbitration";
import type { DataQuality } from "@/domain/quality";
import { parseDecimal } from "@/domain/money";
import { transitionCandidate, registerStrategyCandidate, resetStrategyCandidates, activateLiveCandidate } from "@/lifecycle/candidates";
import { evaluateDeclarativeStrategy } from "@/lifecycle/evaluate";
import { healthFromRecord } from "@/lifecycle/health";
import { resetPromotionAudits, reviewPromotion } from "@/lifecycle/promote";
import { recordExperimentSummary, recordPaperFill } from "@/lifecycle/recorder";
import { evaluateShadow } from "@/lifecycle/shadow";
import { resetStrategyMemory, strategyMemory } from "@/lifecycle/store";
import { getStrategyVersion, publishStrategyVersion, resetStrategyVersions } from "@/lifecycle/version";
import type { StrategyContext } from "@/strategies/context";

afterEach(() => {
  resetStrategyMemory();
  resetStrategyVersions();
  resetStrategyCandidates();
  resetPromotionAudits();
});

const NOW = Date.parse("2026-04-10T15:00:00.000Z");

function outcome(userId: string, net: bigint, asset = "paper:NVDA", regime = "TRENDING_UP", session = "OPEN", offset = 1) {
  return recordPaperFill({
    userId,
    strategyId: "momentum",
    strategyVersion: "1",
    assetId: asset,
    session,
    regime,
    nowMs: NOW + offset,
    net,
    gross: net,
    correlationId: "corr",
    intentId: "intent",
    executionId: "exec",
  });
}

function context(): ArbitrationContext {
  return {
    userId: "user_a",
    asset: { id: "rep-nvda", ticker: "NVDA" },
    timestamp: new Date(NOW).toISOString(),
    asOfMs: NOW,
    regime: "TRENDING_UP",
    session: "OPEN",
    dataQuality: { status: "GOOD", historyPoints: 48, latestAgeMs: 1000, referenceAgeMs: 1000, missingFields: [] },
    freshness: "FRESH",
    pricePresent: true,
    referencePresent: true,
    historyPoints: 48,
    featureIds: ["return_1h", "sma_20", "trend"],
    priorSelection: null,
  };
}

function evaluation(): StrategyEvaluation {
  return {
    signalStrategyId: "momentum",
    strategyName: "Momentum",
    status: "implemented",
    supportedAssets: ["*"],
    supportedSessions: ["*"],
    minHistory: 21,
    requiresReference: false,
    action: "BUY",
    evaluation: "SIGNAL",
    confidence: 0.8,
    evidence: ["1h return +1.20%.", "Close is above the 20-period average.", "Trend UP."],
    featuresUsed: ["return_1h", "sma_20", "trend"],
    tags: ["MOMENTUM"],
    validUntil: new Date(NOW + 15 * 60 * 1000).toISOString(),
    signalTimestamp: new Date(NOW).toISOString(),
    signalQuality: "GOOD",
  };
}

describe("strategy lifecycle", () => {
  it("versions a strategy without overwriting and keeps sources apart", () => {
    expect(getStrategyVersion("momentum", "1")?.source).toBe("BUILT_IN");
    const next = publishStrategyVersion({
      strategyId: "momentum",
      source: "BUILT_IN",
      createdAt: new Date(NOW).toISOString(),
      parameters: { minReturnBps: 60 },
      definition: "A later momentum version.",
      status: "IMPLEMENTED",
    });
    expect(next.version).toBe("2");
    expect(getStrategyVersion("momentum", "1")?.parameters.minReturnBps).toBe(50);
    expect(() => publishStrategyVersion({ ...next, version: "2" })).toThrow(/STRATEGY_VERSION_EXISTS/);
    expect(() =>
      publishStrategyVersion({
        strategyId: "momentum",
        source: "RESEARCH_GENERATED",
        createdAt: new Date(NOW).toISOString(),
        parameters: {},
        definition: "no",
        status: "PROPOSED",
      }),
    ).toThrow(/STRATEGY_SOURCE_MISMATCH/);
  });

  it("keeps a research candidate off the live state", () => {
    const candidate = registerStrategyCandidate({
      candidateId: "cand-1",
      thesisId: "thesis-1",
      proposalId: "proposal-1",
      strategyId: "offhours-recovery",
      assetScope: ["NVDA"],
      sessionScope: ["CLOSED"],
      regimeScope: ["ANY"],
      conditions: [{ feature: "return_1h", operator: "GT", threshold: 50 }],
      action: "BUY",
      createdAt: new Date(NOW).toISOString(),
      userId: "user_a",
    });
    expect(candidate.status).toBe("PROPOSED");
    transitionCandidate("user_a", "cand-1", "VALIDATING");
    transitionCandidate("user_a", "cand-1", "EXPERIMENTING");
    transitionCandidate("user_a", "cand-1", "CANDIDATE");
    const shadow = transitionCandidate("user_a", "cand-1", "SHADOW");
    expect(shadow.status).toBe("SHADOW");
    expect(activateLiveCandidate().activated).toBe(false);
    expect(() => transitionCandidate("user_a", "cand-1", "LIVE_ACTIVE" as "SHADOW")).toThrow();
  });

  it("evaluates a declarative strategy and keeps shadow from creating an intent", () => {
    const candidate = registerStrategyCandidate({
      candidateId: "cand-2",
      thesisId: "thesis-2",
      proposalId: "proposal-2",
      strategyId: "offhours-recovery",
      assetScope: ["NVDA"],
      sessionScope: ["OPEN"],
      regimeScope: ["TRENDING_UP"],
      conditions: [{ feature: "return_1h", operator: "GT", threshold: 50 }],
      action: "BUY",
      createdAt: new Date(NOW).toISOString(),
      userId: "user_a",
    });
    const signal = evaluateDeclarativeStrategy(candidate, strategyContext(), NOW);
    expect(signal.executable).toBe(false);
    expect(signal.action).toBe("BUY");
    const shadow = transitionCandidate("user_a", "cand-2", "VALIDATING");
    transitionCandidate("user_a", shadow.candidateId, "EXPERIMENTING");
    transitionCandidate("user_a", shadow.candidateId, "CANDIDATE");
    const ready = transitionCandidate("user_a", shadow.candidateId, "SHADOW");
    const watched = evaluateShadow(ready, strategyContext(), NOW);
    expect(watched.tradeIntent).toBeNull();
    expect(watched.executable).toBe(false);
    expect(strategyMemory().list("user_a", "SHADOW")).toHaveLength(7);
  });

  it("records paper and experiment outcomes separately and isolates users", () => {
    outcome("user_a", parseDecimal("2"), "paper:NVDA", "TRENDING_UP", "OPEN", 1);
    outcome("user_a", parseDecimal("-1"), "paper:NVDA", "TRENDING_UP", "OPEN", 2);
    const paper = strategyMemory().get("user_a", "momentum", "1", "PAPER", { assetId: null, regime: null, session: null });
    expect(paper?.tradeCount).toBe(2);
    expect(paper?.wins).toBe(1);
    expect(paper?.losses).toBe(1);
    expect(paper?.expectancy).toBe("0.50");
    expect(strategyMemory().get("user_b", "momentum", "1", "PAPER", { assetId: null, regime: null, session: null })).toBeNull();
    expect(strategyMemory().getByContext("user_a", "momentum", "1", "PAPER", { assetId: "paper:NVDA", regime: "TRENDING_UP", session: null })?.tradeCount).toBe(2);
    recordExperimentSummary({
      userId: "user_a",
      strategyId: "momentum",
      strategyVersion: "1",
      assetId: "paper:NVDA",
      experimentId: "experiment-1",
      nowMs: NOW + 10,
      net: parseDecimal("4"),
      gross: parseDecimal("4.2"),
    });
    expect(strategyMemory().get("user_a", "momentum", "1", "EXPERIMENT", { assetId: null, regime: null, session: null })?.tradeCount).toBe(1);
    expect(strategyMemory().get("user_a", "momentum", "1", "PAPER", { assetId: null, regime: null, session: null })?.tradeCount).toBe(2);
  });

  it("refuses future and backdated outcomes", () => {
    outcome("user_a", parseDecimal("1"));
    expect(() =>
      recordPaperFill({
        userId: "user_a",
        strategyId: "momentum",
        strategyVersion: "1",
        assetId: "paper:NVDA",
        session: "OPEN",
        regime: "TRENDING_UP",
        nowMs: NOW,
        net: parseDecimal("1"),
        gross: parseDecimal("1"),
        correlationId: null,
        intentId: null,
        executionId: null,
      }),
    ).toThrow(/FUTURE_OUTCOME_REJECTED|BACKDATED_OUTCOME_REJECTED/);
  });

  it("does not call a small sample healthy and keeps regime health separate", () => {
    outcome("user_a", parseDecimal("1"), "paper:NVDA", "TRENDING_UP", "OPEN", 1);
    outcome("user_a", parseDecimal("1"), "paper:NVDA", "HIGH_VOLATILITY", "CLOSED", 2);
    const global = strategyMemory().get("user_a", "momentum", "1", "PAPER", { assetId: null, regime: null, session: null });
    expect(healthFromRecord(global)).toBe("INSUFFICIENT_DATA");
    const health = strategyMemory().getHealth("user_a", "momentum", "1", "PAPER");
    expect(health.status).not.toBe("HEALTHY");
    expect(health.regimeCoverage.map((row) => row.regime).sort()).toEqual(["HIGH_VOLATILITY", "TRENDING_UP"]);
    expect(health.sessionCoverage.map((row) => row.session).sort()).toEqual(["CLOSED", "OPEN"]);
  });

  it("rates an established positive sample healthy and a deteriorating sample degraded", () => {
    for (let index = 0; index < 30; index += 1) {
      recordPaperFill({
        userId: "user_a",
        strategyId: "momentum",
        strategyVersion: "1",
        assetId: "paper:NVDA",
        session: "OPEN",
        regime: "TRENDING_UP",
        nowMs: NOW + index,
        net: parseDecimal("1"),
        gross: parseDecimal("1"),
        correlationId: null,
        intentId: null,
        executionId: `exec-${index}`,
      });
    }
    expect(strategyMemory().getHealth("user_a", "momentum", "1", "PAPER").status).toBe("HEALTHY");
    for (let index = 0; index < 4; index += 1) {
      recordPaperFill({
        userId: "user_a",
        strategyId: "mean-reversion",
        strategyVersion: "1",
        assetId: "paper:NVDA",
        session: "OPEN",
        regime: "RANGE_BOUND",
        nowMs: NOW + index,
        net: parseDecimal("-1"),
        gross: parseDecimal("-1"),
        correlationId: null,
        intentId: null,
        executionId: `mr-${index}`,
      });
    }
    expect(strategyMemory().getHealth("user_a", "mean-reversion", "1", "PAPER").status).toBe("INSUFFICIENT_DATA");
  });

  it("records promotion without activating the candidate", () => {
    const candidate = registerStrategyCandidate({
      candidateId: "cand-3",
      thesisId: "thesis-3",
      proposalId: "proposal-3",
      strategyId: "offhours-recovery",
      assetScope: ["NVDA"],
      sessionScope: ["ANY"],
      regimeScope: ["ANY"],
      conditions: [],
      action: "OBSERVE",
      createdAt: new Date(NOW).toISOString(),
      userId: "user_a",
    });
    const audit = reviewPromotion({
      candidateId: candidate.candidateId,
      strategyVersion: candidate.strategyVersion,
      nowMs: NOW,
      tradeCount: 4,
      outOfSampleTrades: 1,
      expectancy: null,
      maxDrawdown: null,
      baselineDifference: null,
      warnings: [],
      overfitting: "UNKNOWN",
    });
    expect(audit.result).toBe("INSUFFICIENT_EVIDENCE");
    expect(getStrategyVersion(candidate.strategyId, candidate.strategyVersion)?.status).toBe("PROPOSED");
    const pass = reviewPromotion({
      candidateId: candidate.candidateId,
      strategyVersion: candidate.strategyVersion,
      nowMs: NOW + 1,
      tradeCount: 40,
      outOfSampleTrades: 12,
      expectancy: "0.200000",
      maxDrawdown: "1.000000",
      baselineDifference: "0.050000",
      warnings: [],
      overfitting: "LOW",
    });
    expect(pass.result).toBe("PROMOTION_PASS");
    expect(getStrategyVersion(candidate.strategyId, candidate.strategyVersion)?.status).toBe("PROPOSED");
  });

  it("keeps historical health from replacing the current signal or a security block", () => {
    const plain = arbitrateAsset(context(), [evaluation()]);
    const healthy = arbitrateAsset(
      context(),
      [evaluation()],
    );
    const withMemory = arbitrateAsset(
      {
        ...context(),
        historicalHealth: { momentum: { status: "HEALTHY", sample: "ESTABLISHED" } },
      },
      [evaluation()],
    );
    const degraded = arbitrateAsset(
      {
        ...context(),
        historicalHealth: { momentum: { status: "DEGRADED", sample: "ESTABLISHED" } },
      },
      [evaluation()],
    );
    const blocked = arbitrateAsset(
      {
        ...context(),
        historicalHealth: { momentum: { status: "HEALTHY", sample: "ESTABLISHED" } },
        securityAssessment: { available: true, supported: true, riskLevel: 5, riskLevelEnum: "HIGH" },
      },
      [evaluation()],
    );
    expect(withMemory.score).toBe(plain.score);
    expect(withMemory.candidates[0]?.components.signalStrength).toBe(healthy.candidates[0]?.components.signalStrength);
    expect(degraded.candidates[0]?.components.signalStrength).toBe(plain.candidates[0]?.components.signalStrength);
    expect(degraded.candidates[0]?.components.strategyHealth).toBeLessThan(plain.candidates[0]?.components.strategyHealth ?? 0);
    expect(blocked.decision).toBe("DATA_BLOCKED");
    expect(blocked.selectedAction).toBeNull();
    expect(degraded.historicalHealth).toBe("DEGRADED");
    expect(plain.historicalHealth).toBe("NONE");
  });
});

function strategyContext(): StrategyContext {
  return {
    ticker: "NVDA",
    assetName: "NVIDIA",
    representationId: "rep-nvda",
    tokenSymbol: "NVDA",
    price: null,
    referencePrice: null,
    referenceDeviationBps: null,
    session: "OPEN",
    freshness: "FRESH",
    latestAgeMs: 1000,
    referenceAgeMs: null,
    candles: [],
    features: {
      asOf: new Date(NOW).toISOString(),
      features: [
        {
          id: "return_1h",
          label: "1h",
          lookback: "4",
          source: "close",
          timestamp: new Date(NOW).toISOString(),
          sufficient: true,
          value: "0.80",
          bps: "80",
          note: null,
        },
      ],
    },
    regime: { regime: "TRENDING_UP", asOf: new Date(NOW).toISOString(), sufficient: true, reasons: [] },
    dataQuality: { status: "GOOD", historyPoints: 30, latestAgeMs: 1000, referenceAgeMs: null, missingFields: [] } satisfies DataQuality,
    fidelity: "paper",
    asOfMs: NOW,
  };
}
