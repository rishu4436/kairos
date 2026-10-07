import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
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
import { MemoryRedisTransport, toRedisArgs } from "@/runtime/redis";
import { resetDurableDomainMemory } from "@/runtime/domain-state";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import { RedisKairosStateStore, resetAutonomousStore, stateKey } from "@/runtime/store";
import type { DomainSnapshot } from "@/runtime/domain-state";

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

describe("atomic redis lease and revision", () => {
  it("acquires, renews, and releases only for the owner", () => {
    const transport = new MemoryRedisTransport();
    let now = 1_000_000;
    transport.nowMs = () => now;
    const store = new RedisKairosStateStore("redis://local", transport);
    const other = new RedisKairosStateStore("redis://local", transport);
    expect(transport.command(["SET", "nx-lease", "owner-a", "NX", "PX", "1000"])).toBe("OK");
    expect(transport.command(["SET", "nx-lease", "owner-b", "NX", "PX", "1000"])).toBeNull();
    expect(transport.command(["GET", "nx-lease"])).toBe("owner-a");

    expect(store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-a", nowMs: now, ttlMs: 1_000 }).ok).toBe(true);
    expect(other.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-b", nowMs: now, ttlMs: 1_000 }).ok).toBe(false);
    expect(store.renewLease("user_a", "agent_a", "runtime-a", 1_000).ok).toBe(true);
    expect(other.renewLease("user_a", "agent_a", "runtime-b", 1_000)).toEqual({ ok: false, reason: "LEASE_NOT_OWNER" });
    expect(other.releaseLease("user_a", "agent_a", "runtime-b")).toEqual({ ok: false, reason: "LEASE_NOT_OWNER" });
    expect(store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-b", nowMs: now, ttlMs: 1_000 }).ok).toBe(false);
    expect(store.releaseLease("user_a", "agent_a", "runtime-a").ok).toBe(true);

    expect(store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-a", nowMs: now, ttlMs: 500 }).ok).toBe(true);
    now += 500;
    expect(other.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: "runtime-b", nowMs: now, ttlMs: 500 }).ok).toBe(true);
  });

  it("rejects a stale revision inside one command", () => {
    const transport = new MemoryRedisTransport();
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
    expect(() => first.compareAndSet("kairos:v1:secret", 0, { REDIS_URL: "rediss://example.invalid:6379" }, ISO)).toThrow(/STATE_INVALID/);
    expect(() => first.compareAndSet("kairos:v1:secret", 0, { WALLET_PASSWORD: "test-fixture" }, ISO)).toThrow(/STATE_INVALID/);
    expect(transport.command(["GET", "kairos:v1:secret"])).toBeNull();
    expect(toRedisArgs(["EVAL", "lease-acquire", "1", "k", "owner", "1000"])[1]).toContain("redis.call");
  });
});

describe("durable restart", () => {
  it("reloads position, performance, research, candidate, and arbitration without a second fill", async () => {
    const transport = new MemoryRedisTransport();
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
      result: null,
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

    const restored = new RedisKairosStateStore("redis://durable", transport);
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
      runPaper: () => {
        const book = readPaperBook(userId, agentId);
        fills = book?.account.positions.length ?? 0;
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
    expect(exportUserPerformance(USER).some((record) => record.strategyId === "momentum" && record.sampleSize > 0)).toBe(true);
    expect(researchStore().getThesis(userId, "thesis_durable")?.title).toBe("Durable thesis");
    expect(researchStore().getProposal(userId, "proposal_durable")?.proposalId).toBe("proposal_durable");
    expect(researchStore().getExperiment(userId, "experiment_durable")?.status).toBe("COMPLETED");
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
  });
});

describe("redis protocol", () => {
  it("round-trips SET NX and GET through a worker", async () => {
    const child = spawn(process.execPath, ["runtime/redis-fake.mjs"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    const port = await new Promise<string>((resolve, reject) => {
      child.once("error", reject);
      child.stdout.once("data", (chunk) => resolve(String(chunk).trim()));
    });
    const { LazyRedisTransport } = await import("@/runtime/redis");
    const transport = new LazyRedisTransport(`redis://127.0.0.1:${port}`);
    try {
      expect(transport.command(["PING"])).toBe("PONG");
      expect(transport.command(["SET", "k", "v", "NX", "PX", "1000"])).toBe("OK");
      expect(transport.command(["SET", "k", "other", "NX", "PX", "1000"])).toBeNull();
      expect(transport.command(["GET", "k"])).toBe("v");
    } finally {
      transport.close();
      child.kill();
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
