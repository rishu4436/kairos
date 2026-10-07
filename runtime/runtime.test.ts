import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { arbitrateAsset } from "@/arbitration/arbitrate";
import type { ArbitrationContext, StrategyEvaluation } from "@/domain/arbitration";
import { asAgentId, asUserId } from "@/domain/ids";
import { parseDecimal } from "@/domain/money";
import { activateLiveCandidate, registerStrategyCandidate, resetStrategyCandidates, transitionCandidate } from "@/lifecycle/candidates";
import { resetTestMarketStores as resetMarketStores } from "@/test/paper-market";
import { applyPaperFillOnce } from "@/paper/idempotency";
import { exportPaperBook, importPaperBook } from "@/paper/snapshot";
import { readPaperBook } from "@/paper/store";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { runManualPaperCycle } from "@/observation/autonomous-board";
import { acquireAssetMutation, releaseAssetMutation, runKairosAutonomousCycle } from "@/runtime/cycle";
import { researchDue } from "@/runtime/research-schedule";
import { InMemoryKairosStateStore, openStateStore, resetAutonomousStore } from "@/runtime/store";
import { buildStrategyContext } from "@/strategies/context";
import { deterministicPositionManager } from "@/context/position-manager";
import type { KAIROSContext } from "@/context/types";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");

beforeEach(() => resetMarketStores());

afterEach(() => {
  resetMarketStores();
  resetStrategyCandidates();
  resetAutonomousStore();
  delete process.env.KAIROS_STATE_BACKEND;
  delete process.env.REDIS_URL;
});

describe("autonomous runtime", () => {
  it("buys once and then holds the open position", () => {
    runManualPaperCycle(new Date(NOW));
    const opened = readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"));
    expect(opened?.account.positions).toHaveLength(1);
    const quantity = opened?.account.positions[0]?.quantity;
    runManualPaperCycle(new Date(NOW + 15 * 60 * 1000));
    const held = readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"));
    expect(held?.account.positions).toHaveLength(1);
    expect(held?.account.positions[0]?.quantity).toBe(quantity);
    expect(held?.metas.get("TSLA")?.lastDecision).toBe("HOLD");
  });

  it("reloads a paper position into a new runtime and does not open another", () => {
    runManualPaperCycle(new Date(NOW));
    const snapshot = exportPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"));
    expect(snapshot?.account.positions).toHaveLength(1);
    resetMarketStores();
    expect(readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"))).toBeNull();
    importPaperBook(snapshot!);
    const store = new InMemoryKairosStateStore();
    let calls = 0;
    runKairosAutonomousCycle({
      userId: DEMO_USER_ID,
      agentId: "agent_demo",
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW + 15 * 60 * 1000,
      ownerId: "recovered-runtime",
      store,
      runPaper: () => {
        calls += 1;
        runManualPaperCycle(new Date(NOW + 15 * 60 * 1000));
        return { ran: true, reason: "recovered", events: [], view: null, createdIntentIds: [], executionMode: "PAPER", authorityCode: null, executionContextId: null, loopState: "MONITORING_POSITION", transitions: [] };
      },
    });
    expect(calls).toBe(1);
    expect(readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"))?.account.positions).toHaveLength(1);
  });

  it("applies one paper fill when the same intent is processed twice", () => {
    let cash = parseDecimal("10000");
    const first = applyPaperFillOnce("intent_same", "exec_1", () => {
      cash -= parseDecimal("100");
    });
    const second = applyPaperFillOnce("intent_same", "exec_2", () => {
      cash -= parseDecimal("100");
    });
    expect(first.repeated).toBe(false);
    expect(second.repeated).toBe(true);
    expect(second.executionId).toBe("exec_1");
    expect(cash).toBe(parseDecimal("9900"));
  });

  it("lets one runtime hold the lease", () => {
    const store = new InMemoryKairosStateStore();
    let calls = 0;
    const runPaper = () => {
      calls += 1;
      return { ran: false, reason: "idle", events: [], view: null, createdIntentIds: [], executionMode: null, authorityCode: null, executionContextId: null, loopState: null, transitions: [] };
    };
    store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-a", nowMs: NOW, ttlMs: 60_000 });
    const blocked = runKairosAutonomousCycle({
      userId: "user_a",
      agentId: "agent_a",
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "SCHEDULER",
      startedAtMs: NOW,
      ownerId: "runtime-b",
      store,
      runPaper,
    });
    expect(blocked.status).toBe("FAILED");
    expect(blocked.errors[0]?.code).toBe("LEASE_UNAVAILABLE");
    expect(calls).toBe(0);
  });

  it("marks an unfinished cycle interrupted and does not fill its intent again", () => {
    const store = new InMemoryKairosStateStore();
    store.saveCycle({
      cycleId: "cycle_open",
      userId: "user_a",
      agentId: "agent_a",
      startedAt: new Date(NOW).toISOString(),
      completedAt: new Date(NOW).toISOString(),
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      status: "EXECUTING_PAPER",
      assetResults: [],
      researchResults: [],
      errors: [],
      warnings: [],
      nextSuggestedRunAt: new Date(NOW).toISOString(),
      createdIntentIds: ["intent_open"],
      transitions: [],
    });
    applyPaperFillOnce("intent_open", "exec_open", () => undefined);
    runKairosAutonomousCycle({
      userId: "user_a",
      agentId: "agent_a",
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW + 1_000,
      ownerId: "runtime-a",
      store,
      runPaper: () => ({ ran: false, reason: "recovered", events: [], view: null, createdIntentIds: [], executionMode: "PAPER", authorityCode: null, executionContextId: null, loopState: null, transitions: [] }),
    });
    expect(store.listCycles("user_a", "agent_a").some((cycle) => cycle.cycleId === "cycle_open" && cycle.status === "INTERRUPTED")).toBe(true);
    expect(applyPaperFillOnce("intent_open", "exec_again", () => {
      throw new Error("second fill");
    }).repeated).toBe(true);
  });

  it("keeps a shadow candidate off execution and a paper candidate out of live mode", () => {
    const candidate = registerStrategyCandidate({
      candidateId: "cand-rt",
      thesisId: "thesis-rt",
      proposalId: "proposal-rt",
      strategyId: "research-momentum",
      assetScope: ["*"],
      sessionScope: ["ANY"],
      regimeScope: ["ANY"],
      conditions: [{ feature: "return_1h", operator: "GT", threshold: 1 }],
      action: "BUY",
      createdAt: new Date(NOW).toISOString(),
      userId: "user_a",
    });
    transitionCandidate("user_a", candidate.candidateId, "VALIDATING");
    transitionCandidate("user_a", candidate.candidateId, "EXPERIMENTING");
    transitionCandidate("user_a", candidate.candidateId, "CANDIDATE");
    transitionCandidate("user_a", candidate.candidateId, "SHADOW");
    const shadow = runKairosAutonomousCycle({
      userId: "user_a",
      agentId: "agent_a",
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW,
      ownerId: "runtime-shadow",
      shadowContext: buildStrategyContext({
        ticker: "NVDA",
        assetName: "NVIDIA",
        representationId: "paper:NVDA",
        tokenSymbol: "NVDA",
        price: "100",
        referencePrice: null,
        session: "UNKNOWN",
        freshness: "SAMPLE",
        latestAgeMs: null,
        candles: [],
        fidelity: "paper",
        asOfMs: NOW,
        requiredPoints: 21,
      }),
      runPaper: () => ({ ran: false, reason: "shadow", events: [], view: null, createdIntentIds: [], executionMode: "PAPER", authorityCode: null, executionContextId: null, loopState: null, transitions: [] }),
    });
    expect(shadow.researchResults.every((item) => item.intentCreated === false)).toBe(true);
    transitionCandidate("user_a", candidate.candidateId, "PAPER_ACTIVE");
    const evaluation: StrategyEvaluation = {
      signalStrategyId: "research-momentum",
      strategyName: "Research",
      status: "research_candidate",
      supportedAssets: ["*"],
      supportedSessions: ["*"],
      minHistory: 0,
      requiresReference: false,
      action: "BUY",
      evaluation: "SIGNAL",
      confidence: 0.9,
      evidence: ["research"],
      featuresUsed: ["return_1h"],
      tags: ["PAPER_ACTIVE", "RESEARCH", `candidate:${candidate.candidateId}`, `thesis:${candidate.thesisId}`, "version:1"],
      validUntil: new Date(NOW + 60_000).toISOString(),
      signalTimestamp: new Date(NOW).toISOString(),
      signalQuality: "DEGRADED",
    };
    const admitted = arbitrateAsset(arbContext({ paperResearchEligible: true }), [evaluation]);
    expect(admitted.candidates[0]?.rejectionReason ?? "").not.toMatch(/not eligible/);
    const liveExcluded = arbitrateAsset(arbContext({ paperResearchEligible: false }), [evaluation]);
    expect(liveExcluded.candidates[0]?.rejectionReason).toMatch(/not eligible/);
    let liveCalls = 0;
    const live = runKairosAutonomousCycle({
      userId: "user_a",
      agentId: "agent_a",
      runtimeMode: "LOCAL",
      executionMode: "LIVE",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW + 10_000,
      ownerId: "runtime-live",
      runPaper: () => {
        liveCalls += 1;
        return { ran: true, reason: "no", events: [], view: null, createdIntentIds: ["intent_live"], executionMode: "PAPER", authorityCode: null, executionContextId: null, loopState: null, transitions: [] };
      },
    });
    expect(liveCalls).toBe(0);
    expect(live.liveBlocked).toBe(true);
    expect(live.createdIntentIds).toEqual([]);
    expect(activateLiveCandidate().activated).toBe(false);
  });

  it("fails closed without redis configuration and rejects a stale revision", () => {
    process.env.KAIROS_STATE_BACKEND = "redis";
    expect(() => openStateStore()).toThrow(/STATE_BACKEND_NOT_CONFIGURED/);
    const memory = openStateStore({ ...process.env, KAIROS_STATE_BACKEND: "memory", REDIS_URL: "" });
    expect(memory.durable).toBe(false);
    expect(memory.backend).toBe("MEMORY");
    const wrote = memory.compareAndSet("kairos:v1:user_a:agent_a:position", 0, { quantity: "1" }, new Date(NOW).toISOString());
    expect(wrote.ok).toBe(true);
    if (wrote.ok) {
      expect(memory.compareAndSet("kairos:v1:user_a:agent_a:position", 0, { quantity: "2" }, new Date(NOW).toISOString()).ok).toBe(false);
      expect(memory.compareAndSet("kairos:v1:user_a:agent_a:position", wrote.record.revision, { quantity: "2" }, new Date(NOW).toISOString()).ok).toBe(true);
    }
    expect(() => memory.compareAndSet("kairos:v1:secret", 0, { apiKey: "nope" }, new Date(NOW).toISOString())).toThrow(/STATE_INVALID/);
  });

  it("does not let a client execution mode create a paper fill from live", () => {
    let calls = 0;
    const result = runKairosAutonomousCycle({
      userId: "user_a",
      agentId: "agent_a",
      runtimeMode: "LOCAL",
      executionMode: "LIVE_PREVIEW",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW,
      ownerId: "preview",
      runPaper: () => {
        calls += 1;
        return { ran: true, reason: "paper", events: [], view: null, createdIntentIds: ["intent_x"], executionMode: "PAPER", authorityCode: null, executionContextId: null, loopState: null, transitions: [] };
      },
    });
    expect(calls).toBe(0);
    expect(result.createdIntentIds).toEqual([]);
  });

  it("continues the cycle when research throws and blocks a second asset mutation", () => {
    const result = runKairosAutonomousCycle({
      userId: "user_a",
      agentId: "agent_a",
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW,
      ownerId: "research",
      researchAvailable: true,
      researchStep: () => {
        throw new Error("MODEL_ERROR");
      },
      runPaper: () => ({ ran: true, reason: "paper", events: [], view: null, createdIntentIds: [], executionMode: "PAPER", authorityCode: null, executionContextId: null, loopState: "MONITORING_POSITION", transitions: [] }),
    });
    expect(result.errors.some((error) => error.code === "RESEARCH_ERROR")).toBe(true);
    expect(result.status === "DEGRADED" || result.status === "COMPLETED" || result.status === "FAILED").toBe(true);
    expect(acquireAssetMutation("user_a", "paper:NVDA")).toBe(true);
    expect(acquireAssetMutation("user_a", "paper:NVDA")).toBe(false);
    releaseAssetMutation("user_a", "paper:NVDA");
    expect(researchDue({ nowMs: NOW, lastResearchAtMs: NOW, hasThesis: true, regimeChanged: false, majorEventChanged: false, healthDegraded: false, intervalMs: 60_000 }).due).toBe(false);
  });

  it("replays a position decision from the same context", () => {
    const context = {
      userId: "user_a",
      agentId: "agent_a",
      assetId: "paper:NVDA",
      cycleId: "cycle-replay",
      timestamp: new Date(NOW).toISOString(),
      quality: "DEGRADED",
      market: { status: "AVAILABLE", freshness: "UNKNOWN", value: { price: "100.00" } },
      features: { value: { features: [{ id: "trend", value: "UP" }] } },
      regime: { value: { regime: "TRENDING_UP" } },
      session: { value: { session: "UNKNOWN" } },
      strategySignals: { value: { signals: [{ strategyId: "momentum", strategyName: "Momentum", version: "1", action: "BUY", evaluation: "SIGNAL", confidence: 0.7, timestamp: new Date(NOW).toISOString(), validUntil: new Date(NOW + 60_000).toISOString(), source: "replay" }] } },
      strategyHealth: { value: { reports: [] } },
      strategyPerformance: { value: { records: [] } },
      externalSignals: { status: "UNAVAILABLE", value: null },
      tokenSecurity: { value: { gate: "NOT_EVALUATED", label: "UNKNOWN" } },
      eventContext: { status: "UNAVAILABLE", value: null },
      positionContext: {
        value: {
          state: "OPEN",
          quantity: "1",
          averageEntry: "100",
          currentMark: "100",
          unrealizedPnL: "0",
          notional: "100",
          originStrategy: "momentum",
          strategyVersion: "1",
          openedAt: new Date(NOW).toISOString(),
          representationId: "paper:NVDA",
          positionId: "pos_1",
          correlationId: "corr_1",
          addCount: 0,
          lastAddAt: null,
          appliedReductions: [],
          entry: {
            entryContextId: "ctx",
            entryCycleId: "cycle-replay",
            entryStrategySignal: { strategyId: "momentum", action: "BUY", evaluation: "SIGNAL", confidence: 0.7 },
            entryRegime: "TRENDING_UP",
            entrySession: "UNKNOWN",
            entryPrice: "100",
            entryStrategyHealth: null,
            entryExternalEvidence: null,
            entryEventState: null,
            entryTimestamp: new Date(NOW).toISOString(),
            entryFeatures: { trend: "UP", distanceFromMeanBps: null },
          },
          risk: null,
          lastDecision: null,
          lastDecisionAt: null,
          reduceCount: 0,
          lastReduceAt: null,
          thesisState: "VALID",
          entryContextId: "ctx",
          highestMark: "100",
          previousSnapshot: null,
          alternateStrategyId: null,
          exitClass: null,
          managementPolicy: null,
        },
      },
    } as unknown as KAIROSContext;
    const first = deterministicPositionManager.evaluatePosition(context);
    const second = deterministicPositionManager.evaluatePosition(context);
    expect(second.action).toBe(first.action);
    expect(second.reasonCodes).toEqual(first.reasonCodes);
    expect(first.executable).toBe(false);
  });
});

function arbContext(overrides: Partial<ArbitrationContext>): ArbitrationContext {
  return {
    userId: "user_a",
    asset: { id: "paper:NVDA", ticker: "NVDA" },
    timestamp: new Date(NOW).toISOString(),
    asOfMs: NOW,
    regime: "TRENDING_UP",
    session: "OPEN",
    dataQuality: { status: "GOOD", historyPoints: 48, latestAgeMs: 1000, referenceAgeMs: 1000, missingFields: [] },
    freshness: "FRESH",
    pricePresent: true,
    referencePresent: true,
    historyPoints: 48,
    featureIds: ["return_1h"],
    priorSelection: null,
    ...overrides,
  };
}
