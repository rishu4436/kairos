import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { arbitrationMemory } from "@/arbitration/memory";
import { asAgentId, asUserId } from "@/domain/ids";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { exportUserCandidates, registerStrategyCandidate, resetStrategyCandidates, transitionCandidate } from "@/lifecycle/candidates";
import type { ResearchLifecycle } from "@/lifecycle/types";
import { reviewPromotion, resetPromotionAudits, listPromotionAudits } from "@/lifecycle/promote";
import { exportUserPerformance, strategyMemory, resetStrategyMemory } from "@/lifecycle/store";
import { getStrategyVersion, resetStrategyVersions } from "@/lifecycle/version";
import { resetTestMarketStores as resetMarketStores } from "@/test/paper-market";
import { runManualPaperCycle } from "@/observation/autonomous-board";
import { applyPaperFillOnce } from "@/paper/idempotency";
import { readPaperBook } from "@/paper/store";
import { researchStore, resetResearchStore } from "@/research/store";
import { LazyRedisTransport, toRedisArgs, type RedisTransport } from "@/runtime/redis";
import { resetDurableDomainMemory } from "@/runtime/domain-state";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import { RedisKairosStateStore, resetAutonomousStore, stateKey } from "@/runtime/store";
import type { DomainSnapshot } from "@/runtime/domain-state";
import { persistDomain } from "@/runtime/domain-state";
import { exportPaperBook } from "@/paper/snapshot";
import { readinessLabels } from "@/runtime/readiness";
import { AutonomousRuntimePanel } from "@/components/command/autonomous-runtime";

const enabled = process.env.KAIROS_REDIS_LIVE_TEST === "1";
const remoteUrl = process.env.REDIS_URL ?? "";
const previousBackend = process.env.KAIROS_STATE_BACKEND;
// Paper fixture preparation stays local; only explicit injected stores use remote Redis.
if (enabled) process.env.KAIROS_STATE_BACKEND = "memory";
afterAll(() => {
  if (previousBackend === undefined) delete process.env.KAIROS_STATE_BACKEND;
  else process.env.KAIROS_STATE_BACKEND = previousBackend;
});
const transports: { live: LazyRedisTransport; keys: Set<string> }[] = [];
function newLiveTransport(namespace = `kairos:v1:test:${randomUUID()}:`): RedisTransport & { namespace: string } {
  try {
    if (!remoteUrl || !["redis:", "rediss:"].includes(new URL(remoteUrl).protocol)) throw new Error();
  } catch { throw new Error("STATE_BACKEND_NOT_CONFIGURED"); }
  const live = new LazyRedisTransport(remoteUrl);
  const keys = new Set<string>();
  const prefix = namespace;
  transports.push({ live, keys });
  return { namespace, command(input) {
    const args = [...input];
    const indices = args[0] === "EVAL" ? Array.from({ length: Number(args[2]) }, (_, i) => 3 + i)
      : args[0] === "PING" ? [] : [1];
    for (const index of indices) {
      const key = `${prefix}${args[index]}`;
      keys.add(key);
      args[index] = key;
    }
    return live.command(args);
  } };
}
afterEach(() => {
  for (const { live, keys } of transports.splice(0)) {
    try { for (const key of keys) live.command(["DEL", key]); }
    finally { live.close(); }
  }
});

describe.skipIf(!enabled)("real Redis connectivity", () => {
  it("connects, writes, reads and deletes only isolated temporary keys", { timeout: 60_000 }, () => {
    const transport = newLiveTransport();
    expect(transport.command(["PING"])).toBe("PONG");
    expect(transport.command(["SET", "connectivity", "public-test-value", "PX", "60000"])).toBe("OK");
    expect(transport.command(["GET", "connectivity"])).toBe("public-test-value");
    expect(transport.command(["DEL", "connectivity"])).toBe("1");
    expect(transport.command(["GET", "connectivity"])).toBeNull();
  });
});
const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const ISO = new Date(NOW).toISOString();
const USER = DEMO_USER_ID;
const AGENT = "agent_demo";

afterEach(() => {
  resetMarketStores();
  resetResearchStore();
  resetStrategyMemory();
  resetStrategyCandidates();
  resetPromotionAudits();
  resetStrategyVersions();
  arbitrationMemory.clear();
  resetDurableDomainMemory();
  resetAutonomousStore();
});

describe.skipIf(!enabled)("real Redis: atomic redis lease and revision", () => {
  it("acquires, renews, and releases only for the owner", { timeout: 60_000 }, async () => {
    const transport = newLiveTransport();
    let now = 1_000_000;

    const store = new RedisKairosStateStore("redis://local", transport);
    const other = new RedisKairosStateStore("redis://local", transport);
    expect(transport.command(["SET", "nx-lease", "owner-a", "NX", "PX", "1000"])).toBe("OK");
    expect(transport.command(["SET", "nx-lease", "owner-b", "NX", "PX", "1000"])).toBeNull();
    expect(transport.command(["GET", "nx-lease"])).toBe("owner-a");

    expect(store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-a", nowMs: now, ttlMs: 30_000 }).ok).toBe(true);
    expect(other.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-b", nowMs: now, ttlMs: 30_000 }).ok).toBe(false);
    expect(store.renewLease("user_a", "agent_a", "runtime-a", 30_000).ok).toBe(true);
    expect(other.renewLease("user_a", "agent_a", "runtime-b", 30_000)).toEqual({ ok: false, reason: "LEASE_NOT_OWNER" });
    expect(other.releaseLease("user_a", "agent_a", "runtime-b")).toEqual({ ok: false, reason: "LEASE_NOT_OWNER" });
    expect(store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-b", nowMs: now, ttlMs: 30_000 }).ok).toBe(false);
    expect(store.releaseLease("user_a", "agent_a", "runtime-a").ok).toBe(true);

    expect(store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-a", nowMs: now, ttlMs: 500 }).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    now += 650;
    expect(other.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-b", nowMs: now, ttlMs: 500 }).ok).toBe(true);
  });

  it("rejects a stale revision inside one command", { timeout: 60_000 }, () => {
    const transport = newLiveTransport();
    const first = new RedisKairosStateStore("redis://local", transport);
    const second = new RedisKairosStateStore("redis://local", transport);
    const key = "kairos:v1:user_a:agent_a:position";
    const wrote = first.compareAndSet(key, 0, { quantity: "1" }, ISO);
    expect(wrote.ok).toBe(true);
    const stale = second.compareAndSet(key, 0, { quantity: "9" }, ISO);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.reason).toBe("STATE_REVISION_CONFLICT");
    }
    expect(first.get<{ quantity: string }>(key)?.value.quantity).toBe("1");
    expect(() => first.compareAndSet("kairos:v1:secret", 0, { apiKey: "nope" }, ISO)).toThrow(/STATE_INVALID/);
    expect(transport.command(["GET", "kairos:v1:secret"])).toBeNull();
    expect(toRedisArgs(["EVAL", "lease-acquire", "1", "k", "owner", "1000"])[1]).toContain("redis.call");
  });

  it("preserves JSON arrays, nulls, timestamps, scaled numbers and enums", { timeout: 60_000 }, () => {
    const transport = newLiveTransport();
    const store = new RedisKairosStateStore("redis://test", transport);
    const value = { empty: [], nullValue: null, scaled: "12345678901234567890", at: ISO, state: "PAPER_ACTIVE", items: [{ empty: [] }] };
    const inserted = store.compareAndSet("serialization", 0, value, ISO);
    expect(inserted.ok).toBe(true);
    expect(store.get("serialization")).toEqual({ schemaVersion: 1, revision: 1, updatedAt: ISO, value });
    expect(store.compareAndSet("serialization", 1, value, ISO).ok).toBe(true);
    expect(store.compareAndSet("serialization", 1, { state: "LIVE_ACTIVE" }, ISO)).toEqual({ ok: false, reason: "STATE_REVISION_CONFLICT" });
    expect(store.get("serialization")?.revision).toBe(2);
    expect(store.get("serialization")?.value).toEqual(value);
  });
});

describe.skipIf(!enabled)("real Redis: durable restart", () => {
  it("reloads position, performance, research, candidate, and arbitration without a second fill", { timeout: 60_000 }, async () => {
    const transport = newLiveTransport();
    const store = new RedisKairosStateStore("redis://durable", transport);
    await runManualPaperCycle(new Date(NOW));
    await runManualPaperCycle(new Date(NOW + 15 * 60 * 1000));
    const opened = readPaperBook(asUserId(USER), asAgentId(AGENT));
    expect(opened?.account.positions).toHaveLength(1);
    const quantity = opened?.account.positions[0]?.quantity;
    const meta = opened?.metas.get("TSLA");
    expect(meta?.lastDecision).toBe("HOLD");
    expect(meta?.entryContextId).toBeTruthy();
    const intentId = meta?.intentId ?? "";
    expect(intentId.length).toBeGreaterThan(0);

    strategyMemory().record({
      strategyId: "momentum",
      strategyVersion: "1",
      userId: USER,
      dataset: "PAPER",
      assetId: "paper:TSLA",
      session: "UNKNOWN",
      regime: "UNKNOWN",
      evaluationTime: ISO,
      nowMs: NOW,
      signalOnly: false,
      net: 1_000_000n,
      gross: 1_000_000n,
      holdingBars: 1,
      correlationId: "corr_durable",
      intentId,
      executionId: meta?.executionId ?? "exec_durable",
      experimentId: null,
      dataQualityFailure: false,
      conflict: false,
    });
    expect(exportUserPerformance(USER).some((record) => record.strategyId === "momentum" && record.sampleSize > 0)).toBe(true);

    const userId = asUserId(USER);
    const agentId = asAgentId(AGENT);
    researchStore().saveThesis({
      thesisId: "thesis_durable",
      userId,
      agentId,
      assetId: "paper:TSLA",
      createdAt: ISO,
      updatedAt: ISO,
      title: "Durable thesis",
      summary: "A stored hypothesis.",
      hypothesis: { conditions: ["return_1h >= 50 bps"], session: "ANY", observationWindowBars: 4, testWindowBars: 4, expectedOutcome: "Forward return exceeds 20 bps.", invalidation: "return_1h < 0" },
      observations: [],
      assumptions: [],
      supportingEvidence: [{ kind: "OBSERVED_FACT", statement: "Feature exists.", source: "return_1h" }],
      contradictingEvidence: [],
      requiredData: ["return_1h"],
      invalidationConditions: ["return_1h < 0"],
      riskConsiderations: [],
      confidence: 0.4,
      status: "VALIDATING",
      version: "1",
      provenance: provenance(),
      rejectionReasons: [],
    });
    researchStore().saveProposal({
      proposalId: "proposal_durable",
      thesisId: "thesis_durable",
      userId,
      agentId,
      assetScope: ["paper:TSLA"],
      sessionScope: ["ANY"],
      regimeScope: ["ANY"],
      features: ["return_1h"],
      entryConditions: [{ feature: "return_1h", operator: "GT", threshold: 1 }],
      exitConditions: [],
      holdingPeriod: 4,
      action: "OBSERVE",
      positionSizingHint: "none",
      invalidationConditions: ["return_1h < 0"],
      parameterSet: {},
      version: "1",
      createdAt: ISO,
      status: "VALIDATING",
      provenance: provenance(),
      rejectionReasons: [],
    });
    researchStore().saveExperiment({
      experimentId: "experiment_durable",
      proposalId: "proposal_durable",
      thesisId: "thesis_durable",
      userId,
      agentId,
      assetScope: ["paper:TSLA"],
      startTime: ISO,
      endTime: ISO,
      initialCapital: "10000",
      executionPolicy: "paper",
      dataset: "durable",
      dataSource: "MOCK_FIXTURE",
      thesisSource: "MOCK",
      result: {
        numberOfTrades: 1, winRate: "1", grossPnl: "100", netPnl: "90",
        averageTradeReturnBps: "90", maxDrawdownBps: "0", profitFactor: null,
        averageHoldingPeriodBars: "4", largestWin: "90", largestLoss: null, dataPoints: 24,
        researchWindow: { name: "RESEARCH", fromIndex: 0, toIndex: 11, bars: 12, trades: 1, netPnl: "90", used: true },
        validationWindow: { name: "VALIDATION", fromIndex: 12, toIndex: 17, bars: 6, trades: 0, netPnl: "0", used: true },
        outOfSampleWindow: { name: "OUT_OF_SAMPLE", fromIndex: 18, toIndex: 23, bars: 6, trades: 0, netPnl: "0", used: true },
        outOfSampleClaim: false, baselineName: "BUY_AND_HOLD", baselineNetPnl: "80", strategyNetPnl: "90",
        differenceNetPnl: "10", warnings: [], trades: [],
      },
      reason: null,
      status: "COMPLETED",
      createdAt: ISO,
    });
    const candidate = registerStrategyCandidate({
      candidateId: "cand_durable",
      thesisId: "thesis_durable",
      proposalId: "proposal_durable",
      strategyId: "research-durable",
      assetScope: ["paper:TSLA"],
      sessionScope: ["ANY"],
      regimeScope: ["ANY"],
      conditions: [{ feature: "return_1h", operator: "GT", threshold: 1 }],
      action: "BUY",
      createdAt: ISO,
      userId: USER,
    });
    for (const status of ["VALIDATING", "EXPERIMENTING", "CANDIDATE", "SHADOW", "PAPER_ACTIVE"] as const satisfies readonly ResearchLifecycle[]) {
      transitionCandidate(USER, candidate.candidateId, status);
    }
    reviewPromotion({
      candidateId: candidate.candidateId,
      strategyVersion: candidate.strategyVersion,
      nowMs: NOW,
      tradeCount: 1,
      outOfSampleTrades: 0,
      expectancy: null,
      maxDrawdown: null,
      baselineDifference: null,
      warnings: [],
      overfitting: "UNKNOWN",
    });
    arbitrationMemory.write({ userId: USER, assetId: "paper:TSLA", strategyId: "momentum", action: "BUY", score: 0.7945, selectedAtMs: NOW });
    const performanceBefore = exportUserPerformance(USER);

    const idle = () => ({ ran: true, reason: "checkpoint", events: [], view: null, createdIntentIds: [], executionMode: "PAPER" as const, authorityCode: null, executionContextId: null, loopState: "MONITORING_POSITION" as const, transitions: [] });
    await runKairosAutonomousCycle({
      userId: USER,
      agentId: AGENT,
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW + 30 * 60 * 1000,
      ownerId: "runtime-before-restart",
      store,
      researchAvailable: false,
      runPaper: idle,
    });

    resetMarketStores();
    resetResearchStore();
    resetStrategyMemory();
    resetStrategyCandidates();
    resetPromotionAudits();
    resetStrategyVersions();
    arbitrationMemory.clear();
    resetDurableDomainMemory();
    expect(readPaperBook(userId, agentId)).toBeNull();
    expect(exportUserPerformance(USER)).toHaveLength(0);
    expect(exportUserCandidates(USER)).toHaveLength(0);

    const restored = new RedisKairosStateStore("redis://durable", newLiveTransport(transport.namespace));
    let fills = 0;
    await runKairosAutonomousCycle({
      userId: USER,
      agentId: AGENT,
      runtimeMode: "LOCAL",
      executionMode: "PAPER",
      cycleTrigger: "MANUAL",
      startedAtMs: NOW + 45 * 60 * 1000,
      ownerId: "runtime-after-restart",
      store: restored,
      researchAvailable: false,
      runPaper: async () => {
        const book = readPaperBook(userId, agentId);
        fills = book?.account.positions.length ?? 0;
        expect(arbitrationMemory.read(USER, "paper:TSLA")?.score).toBe(0.7945);
        // The real position manager reviews the hydrated paper position.
        await runManualPaperCycle(new Date(NOW + 45 * 60 * 1000));
        return idle();
      },
    });

    const book = readPaperBook(userId, agentId);
    expect(fills).toBe(1);
    expect(book?.account.positions).toHaveLength(1);
    expect(book?.account.positions[0]?.quantity).toBe(quantity);
    const restoredMeta = book?.metas.get("TSLA");
    expect(restoredMeta?.lastDecision).toBe("HOLD");
    expect(restoredMeta?.entryContextId).toBe(meta?.entryContextId);
    expect(restoredMeta?.strategyVersion).toBe(meta?.strategyVersion);
    expect(restoredMeta?.addCount).toBe(meta?.addCount);
    expect(restoredMeta?.reduceCount).toBe(meta?.reduceCount);
    expect(restoredMeta?.lastAddAt).toBe(meta?.lastAddAt);
    expect(restoredMeta?.lastReduceAt).toBe(meta?.lastReduceAt);
    expect(restoredMeta?.thesisState).toBe(meta?.thesisState);
    expect(exportUserPerformance(USER).some((record) => record.strategyId === "momentum" && record.sampleSize > 0)).toBe(true);
    expect(exportUserPerformance(USER)).toEqual(performanceBefore);
    expect(researchStore().getThesis(userId, "thesis_durable")?.title).toBe("Durable thesis");
    expect(researchStore().getProposal(userId, "proposal_durable")?.proposalId).toBe("proposal_durable");
    expect(researchStore().getExperiment(userId, "experiment_durable")?.status).toBe("COMPLETED");
    expect(researchStore().getExperiment(userId, "experiment_durable")?.result?.netPnl).toBe("90");
    expect(researchStore().getExperiment(userId, "experiment_durable")?.result?.profitFactor).toBeNull();
    expect(exportUserCandidates(USER).find((item) => item.candidateId === "cand_durable")?.status).toBe("PAPER_ACTIVE");
    expect(getStrategyVersion("research-durable", candidate.strategyVersion)?.status).toBe("PAPER_ACTIVE");
    expect(listPromotionAudits("cand_durable").length).toBeGreaterThan(0);
    const selection = arbitrationMemory.read(USER, "paper:TSLA");
    expect(selection?.strategyId).toBe("momentum");
    expect(selection?.selectedAtMs).toBe(NOW);
    const domain = restored.get<DomainSnapshot>(stateKey(["domain", USER, AGENT]));
    expect(domain?.value.arbitration[0]?.cooldownUntilMs).toBe(NOW + 15 * 60 * 1000);
    expect(domain?.value.arbitration[0]?.policyVersion).toBe("1.0");
    expect(domain?.value.contexts.some((context) => context.entryContextId === meta?.entryContextId)).toBe(true);
    expect(applyPaperFillOnce(intentId, "exec_again", () => {
      throw new Error("second fill");
    }).repeated).toBe(true);
    expect(domain ? JSON.stringify(domain).includes("apiKey") : false).toBe(false);
    expect(JSON.stringify(domain).includes(remoteUrl)).toBe(false);

    // Completion was durable, but the cycle never received its terminal marker.
    const unfinished = { ...restored.listCycles(USER, AGENT).at(-1)!, cycleId: "interrupted_test", status: "EXECUTING_PAPER" as const };
    restored.saveCycle(unfinished);
    const previousPaper = exportPaperBook(userId, agentId);
    resetMarketStores();
    resetDurableDomainMemory();
    const resumed = new RedisKairosStateStore("redis://test", newLiveTransport(transport.namespace));
    await runKairosAutonomousCycle({ userId: USER, agentId: AGENT, runtimeMode: "LOCAL", executionMode: "PAPER",
      cycleTrigger: "MANUAL", startedAtMs: NOW + 60 * 60 * 1000, ownerId: "interrupted-restart", store: resumed,
      researchAvailable: false, runPaper: () => {
        expect(applyPaperFillOnce(intentId, "exec_duplicate", () => { throw new Error("duplicate ledger mutation"); }).repeated).toBe(true);
        return idle();
      } });
    expect(resumed.listCycles(USER, AGENT).some((cycle) => cycle.cycleId === "interrupted_test" && cycle.status === "INTERRUPTED")).toBe(true);
    expect(exportPaperBook(userId, agentId)?.account).toEqual(previousPaper?.account);
    expect(resumed.readHeartbeat(USER, AGENT).lastSuccessfulCycle).toBeTruthy();
    expect(resumed.writeControl(USER, AGENT, "PAUSED", 0, ISO).ok).toBe(true);
    expect(new RedisKairosStateStore("redis://test", newLiveTransport(transport.namespace)).readControl(USER, AGENT)).toBe("PAUSED");

    const hot = resumed.get<DomainSnapshot>(stateKey(["domain", USER, AGENT]))!;
    const context = hot.value.contexts.at(-1)!;
    const contexts = Array.from({ length: 105 }, (_, index) => ({ ...context, contextId: `old_context_${index}`, cycleId: `old_cycle_${index}` }));
    expect(resumed.compareAndSet(stateKey(["domain", USER, AGENT]), hot.revision, { ...hot.value, contexts }, ISO).ok).toBe(true);
    persistDomain(resumed, USER, AGENT, ISO, "retention_check");
    const bounded = resumed.get<DomainSnapshot>(stateKey(["domain", USER, AGENT]))!.value.contexts;
    expect(bounded).toHaveLength(100);
    expect(bounded.some((item) => item.contextId === meta?.entryContextId)).toBe(true);
    expect(bounded.some((item) => item.contextId === "old_context_0")).toBe(false);
  });
});

describe.skipIf(!enabled)("Redis failure boundary", () => {
  it("fails closed on connection loss without a memory fallback", { timeout: 20_000 }, () => {
    const live = new LazyRedisTransport("redis://127.0.0.1:1");
    try { expect(() => live.command(["PING"])).toThrow("STATE_BACKEND_ERROR"); }
    finally { live.close(); }
  });
  it("renders Redis durability only after a real probe; hides all connection details", { timeout: 60_000 }, () => {
    const store = new RedisKairosStateStore("redis://test", newLiveTransport());
    const labels = readinessLabels({ NODE_ENV: "test", KAIROS_STATE_BACKEND: "redis", REDIS_URL: remoteUrl });
    expect(labels.stateBackend).toBe("REDIS · DURABLE");
    const html = renderToStaticMarkup(createElement(AutonomousRuntimePanel, { snapshot: {
      heartbeat: store.readHeartbeat(USER, AGENT), cycles: [...store.listCycles(USER, AGENT)], backend: store.backend, durable: store.durable, labels,
    } }));
    expect(html).toContain("REDIS · DURABLE");
    const url = new URL(remoteUrl);
    expect(html.includes(url.hostname)).toBe(false);
    expect(html.includes(remoteUrl)).toBe(false);
    const memory = readinessLabels({ NODE_ENV: "test", KAIROS_STATE_BACKEND: "memory" });
    expect(memory.stateBackend).toBe("MEMORY · EPHEMERAL");
    expect(readinessLabels({ NODE_ENV: "test", KAIROS_STATE_BACKEND: "redis", REDIS_URL: "redis://127.0.0.1:1" }).stateBackend).toBe("REDIS · UNAVAILABLE");
    for (const page of ["app/agent/page.tsx", "features/command-center/command-center.tsx"]) {
      expect(readFileSync(page, "utf8")).toContain("AutonomousRuntimePanel");
    }
  });
});

function provenance() {
  return {
    sourceType: "MOCK" as const,
    provider: "mock",
    model: "mock",
    promptVersion: "1.1",
    createdAt: ISO,
    contextTimestamp: ISO,
    contextDataVersion: "test",
    configuredModel: false,
    requestId: "req_durable",
    startedAt: ISO,
    completedAt: ISO,
    latencyMs: 0,
    status: "SUCCESS" as const,
    errorCategory: null,
  };
}
