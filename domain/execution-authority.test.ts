import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  admitPaperCapability,
  executionAuthoritySize,
  issueLiveExecutionContext,
  issuePaperExecutionContext,
  resetExecutionAuthority,
  resolveServerPaperCapability,
  type PaperExecutionCapability,
} from "@/domain/execution-authority";
import { NEUTRAL_EXTERNAL_POLICY } from "@/domain/arbitration";
import { asAgentId, asUserId } from "@/domain/ids";
import { parseDecimal } from "@/domain/money";
import { resetTestMarketStores as resetMarketStores } from "@/test/paper-market";
import { executePaper } from "@/paper/execute";
import { openLiveGateway, openPaperGateway } from "@/paper/gateway";
import { createTradeIntent } from "@/paper/intent";
import { DEFAULT_PAPER_POLICY } from "@/paper/policy";
import { runPreparedAgentCycle } from "@/paper/cycle";
import { readPaperBook } from "@/paper/store";
import { previewPaperExecution } from "@/paper/simulate";
import { accountState, ids, policy } from "@/test/fixtures";
import { assessTradeIntent } from "@/paper/risk-gate";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");

describe("trusted execution authority", () => {
  beforeEach(() => {
    resetMarketStores();
    resetExecutionAuthority();
  });

  it("rejects an arbitrary mode object and a JSON copy", () => {
    const before = executionAuthoritySize();
    const arbitrary = admitPaperCapability({ mode: "PAPER", userId: ids.userId, agentId: ids.agentId }, binding());
    expect(arbitrary.ok).toBe(false);
    if (!arbitrary.ok) {
      expect(arbitrary.code).toBe("EXECUTION_CONTEXT_INVALID");
    }
    expect(admitPaperCapability({ mode: "LIVE" }, binding()).ok).toBe(false);
    expect(executionAuthoritySize()).toBe(before);

    const issued = issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW });
    const cloned = JSON.parse(JSON.stringify(issued)) as PaperExecutionCapability;
    const replay = admitPaperCapability(cloned, binding());
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.code).toBe("EXECUTION_CONTEXT_INVALID");
    }
  });

  it("lets a paper capability fill and refuses it for live execution", () => {
    const paper = issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW });
    expect(paper.context.mode).toBe("PAPER");
    expect(paper.context.permissions).toEqual(["paper_execute"]);
    const opened = openPaperGateway(paper, NOW);
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const filled = opened.gateway.execute(request());
    expect(filled.execution.status).toBe("FILLED");
    expect(filled.execution.broadcast).toBe(false);
    expect(filled.execution.signature).toBeNull();
    expect(openLiveGateway(paper as unknown as ReturnType<typeof issueLiveExecutionContext>, NOW).ok).toBe(false);
  });

  it("keeps a live capability disconnected from paper execution and from signing", () => {
    const live = issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW });
    expect(live.context.permissions).toEqual(["live_execute"]);
    expect(openPaperGateway(live as unknown as PaperExecutionCapability, NOW).ok).toBe(false);
    const preview = previewPaperExecution({ ...request(), authority: live as unknown as PaperExecutionCapability });
    expect(preview.status).toBe("FAIL");
    expect(preview.reasons).toContain("EXECUTION_CAPABILITY_MISMATCH");
    const executed = executePaper({ ...request(), authority: live as unknown as PaperExecutionCapability });
    expect(executed.authorityCode).toBe("EXECUTION_CAPABILITY_MISMATCH");
    expect(executed.execution.status).toBe("REJECTED");
    expect(executed.execution.filledQuantity).toBe(0n);
    expect(executed.execution.signature).toBeNull();
    expect(executed.execution.broadcast).toBe(false);
    const gateway = openLiveGateway(live, NOW);
    expect(gateway.ok).toBe(true);
    if (!gateway.ok) {
      return;
    }
    expect(gateway.gateway.connected).toBe(false);
    const refused = gateway.gateway.execute(request());
    expect(refused.disconnected).toBe(true);
    expect(refused.execution.signature).toBeNull();
    expect(refused.execution.chainTransactionId).toBeNull();
    expect(refused.execution.broadcast).toBe(false);
    expect(refused.execution.status).toBe("REJECTED");
  });

  it("rejects the wrong user, the wrong agent, expiry, and a missing context", () => {
    const paper = issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW });
    const user = admitPaperCapability(paper, { ...binding(), userId: "user_b" });
    expect(user.ok).toBe(false);
    if (!user.ok) {
      expect(user.code).toBe("EXECUTION_USER_MISMATCH");
    }
    const agent = admitPaperCapability(paper, { ...binding(), agentId: "agent_b" });
    expect(agent.ok).toBe(false);
    if (!agent.ok) {
      expect(agent.code).toBe("EXECUTION_AGENT_MISMATCH");
    }
    const expired = issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW, ttlMs: 0 });
    const stale = admitPaperCapability(expired, binding());
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.code).toBe("EXECUTION_CONTEXT_EXPIRED");
    }
    const staleFill = executePaper({ ...request(), authority: expired });
    expect(staleFill.authorityCode).toBe("EXECUTION_CONTEXT_EXPIRED");
    expect(staleFill.execution.filledQuantity).toBe(0n);
    const missing = admitPaperCapability(undefined, binding());
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("EXECUTION_CONTEXT_REQUIRED");
    }
  });

  it("does not let a client mode or another user mint authority", () => {
    const before = executionAuthoritySize();
    const other = resolveServerPaperCapability({
      serverDataMode: "paper",
      requestedUserId: "user_b",
      clientAgentId: "agent_b",
      clientMode: "LIVE",
      sessionUserId: asUserId("user_demo"),
      sessionAgentId: asAgentId("agent_demo"),
      nowMs: NOW,
    });
    expect(other.ok).toBe(false);
    if (!other.ok) {
      expect(other.code).toBe("EXECUTION_USER_MISMATCH");
    }
    expect(executionAuthoritySize()).toBe(before);

    const ignored = resolveServerPaperCapability({
      serverDataMode: "paper",
      requestedUserId: "user_demo",
      clientAgentId: "agent_b",
      clientMode: "LIVE",
      sessionUserId: asUserId("user_demo"),
      sessionAgentId: asAgentId("agent_demo"),
      nowMs: NOW,
    });
    expect(ignored.ok).toBe(true);
    if (ignored.ok) {
      expect(ignored.capability.context.mode).toBe("PAPER");
      expect(ignored.capability.context.userId).toBe("user_demo");
      expect(ignored.capability.context.agentId).toBe("agent_demo");
      expect(ignored.capability.context.permissions).toEqual(["paper_execute"]);
    }

    const liveServer = resolveServerPaperCapability({
      serverDataMode: "live",
      requestedUserId: "user_demo",
      clientAgentId: null,
      clientMode: "PAPER",
      sessionUserId: asUserId("user_demo"),
      sessionAgentId: asAgentId("agent_demo"),
      nowMs: NOW,
    });
    expect(liveServer.ok).toBe(false);
    if (!liveServer.ok) {
      expect(liveServer.code).toBe("EXECUTION_CONTEXT_REQUIRED");
    }
  });

  it("does not run a cycle for a reused or missing context", () => {
    const paper = issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW });
    const reused = runPreparedAgentCycle({
      authority: paper,
      userId: asUserId("user_b"),
      agentId: ids.agentId,
      board: board(),
      candles: new Map(),
      riskPolicy: policy({ userId: asUserId("user_b") }),
      nowMs: NOW,
    });
    expect(reused.ran).toBe(false);
    expect(reused.authorityCode).toBe("EXECUTION_USER_MISMATCH");
    expect(readPaperBook(ids.userId, ids.agentId)).toBeNull();
    expect(readPaperBook(asUserId("user_b"), ids.agentId)).toBeNull();

    const otherAgent = runPreparedAgentCycle({
      authority: paper,
      userId: ids.userId,
      agentId: asAgentId("agent_b"),
      board: board(),
      candles: new Map(),
      riskPolicy: policy({ agentId: asAgentId("agent_b") }),
      nowMs: NOW,
    });
    expect(otherAgent.authorityCode).toBe("EXECUTION_AGENT_MISMATCH");
    expect(readPaperBook(ids.userId, asAgentId("agent_b"))).toBeNull();

    const none = runPreparedAgentCycle({
      authority: undefined as unknown as PaperExecutionCapability,
      userId: ids.userId,
      agentId: ids.agentId,
      board: board(),
      candles: new Map(),
      riskPolicy: policy(),
      nowMs: NOW,
    });
    expect(none.authorityCode).toBe("EXECUTION_CONTEXT_REQUIRED");
    expect(none.ran).toBe(false);
    expect(readPaperBook(ids.userId, ids.agentId)).toBeNull();
  });

  it("keeps the issuer off the client and out of the signing path", () => {
    const clientRoots = ["components", "app"].map((dir) => join(process.cwd(), dir));
    const clientSource = clientRoots.flatMap((root) => readTree(root)).join("\n");
    expect(clientSource).not.toMatch(/issueLiveExecutionContext/);
    expect(clientSource).not.toMatch(/issuePaperExecutionContext/);
    const authority = readFileSync(join(process.cwd(), "domain", "execution-authority.ts"), "utf8");
    const paper = readdirSync(join(process.cwd(), "paper"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(process.cwd(), "paper", file), "utf8"))
      .join("\n");
    const combined = `${authority}\n${paper}`;
    expect(combined).not.toMatch(/PRIVATE KEY/i);
    expect(combined).not.toMatch(/signTransaction/);
    expect(combined).not.toMatch(/@\/wallet/);
    expect(combined).not.toMatch(/broadcastTransaction/);
  });
});

function binding() {
  return { userId: ids.userId, agentId: ids.agentId, nowMs: NOW };
}

function request() {
  const intent = createTradeIntent({
    userId: ids.userId,
    agentId: ids.agentId,
    accountId: ids.accountId,
    decision: {
      asset: { id: "paper:NVDA", ticker: "NVDA", userId: ids.userId },
      timestamp: "2026-10-04T15:00:00.000Z",
      decision: "SELECT_STRATEGY",
      selectedStrategy: "momentum",
      selectedStrategyName: "Momentum",
      selectedAction: "BUY",
      score: 0.8,
      confidence: 0.7,
      candidates: [],
      conflicts: [],
      evidence: { summary: "Momentum selected", supports: [], penalties: [], rejected: [] },
      dataQuality: "DEGRADED",
      marketRegime: "TRENDING_UP",
      marketSession: "UNKNOWN",
      validUntil: "2026-10-04T15:15:00.000Z",
      version: "1.0",
      cooldownHeld: false,
      loopPhase: "WAITING_FOR_RISK",
      ...NEUTRAL_EXTERNAL_POLICY,
    },
    observation: {
      assetId: "paper:NVDA",
      ticker: "NVDA",
      userId: ids.userId,
      observedPrice: parseDecimal("100"),
      referencePrice: null,
      priceTimestamp: "2026-10-04T15:00:00.000Z",
    },
    riskPolicy: policy(),
    quantity: parseDecimal("1"),
    notional: parseDecimal("100"),
    paperPolicy: DEFAULT_PAPER_POLICY,
    nowMs: NOW,
    correlationId: "corr_authority",
  });
  if (!intent.ok) {
    throw new Error(intent.reason);
  }
  const ready = { ...intent.intent, status: "READY_FOR_PAPER" as const };
  const risk = assessTradeIntent(intent.intent, policy(), accountState({ cash: parseDecimal("10000") }), NOW);
  return {
    intent: ready,
    risk,
    snapshot: {
      assetId: "paper:NVDA",
      ticker: "NVDA",
      userId: ids.userId,
      observedPrice: parseDecimal("100"),
      referencePrice: null,
      priceTimestamp: "2026-10-04T15:00:00.000Z",
      volatilityBps: 40,
      supported: true,
    },
    policy: DEFAULT_PAPER_POLICY,
    nowMs: NOW,
    cash: parseDecimal("10000"),
    heldQuantity: 0n,
    authority: issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
  };
}

function board() {
  return {
    ok: true as const,
    dataMode: "paper" as const,
    refreshIntervalMs: 15000,
    freshMaxMs: 30000,
    agingMaxMs: 120000,
    generatedAt: "2026-10-04T15:00:00.000Z",
    userId: ids.userId,
    watchlistId: "watch",
    health: {
      connection: "connected" as const,
      reason: null,
      httpStatus: null,
      lastSuccessAt: null,
      rwa: "skipped" as const,
      market: "skipped" as const,
      history: "skipped" as const,
    },
    rows: [
      {
        id: "paper:NVDA",
        ticker: "NVDA",
        companyName: "NVDA",
        tokenSymbol: "MOCK:NVDA",
        platformLabel: "Paper sample",
        chainLabel: "Not resolved",
        contractAddress: null,
        price: "100.00",
        referencePrice: null,
        deviationPct: null,
        change24hPct: null,
        session: "UNKNOWN" as const,
        sessionLabel: "UNKNOWN",
        rawMarketStatus: null,
        freshness: "SAMPLE" as const,
        freshnessLabel: "SAMPLE",
        ageMs: null,
        sourceTimestamp: "2026-10-04T15:00:00.000Z",
        receivedAt: "2026-10-04T15:00:00.000Z",
        volume24hUsd: null,
        nextOpenAt: null,
        reasonMessage: null,
        fidelity: "paper" as const,
        representationId: "paper:NVDA",
        regime: "TRENDING_UP" as const,
        regimeDetail: null,
        dataQuality: "DEGRADED" as const,
        historyPoints: 48,
        features: [],
        signals: [],
        candles: [],
        arbitration: {
          asset: { id: "paper:NVDA", ticker: "NVDA", userId: ids.userId },
          timestamp: "2026-10-04T15:00:00.000Z",
          decision: "SELECT_STRATEGY" as const,
          selectedStrategy: "momentum",
          selectedStrategyName: "Momentum",
          selectedAction: "BUY" as const,
          score: 0.8,
          confidence: 0.7,
          candidates: [],
          conflicts: [],
          evidence: { summary: "Momentum selected", supports: [], penalties: [], rejected: [] },
          dataQuality: "DEGRADED" as const,
          marketRegime: "TRENDING_UP" as const,
          marketSession: "UNKNOWN" as const,
          validUntil: "2026-10-04T15:15:00.000Z",
          version: "1.0",
          cooldownHeld: false,
          loopPhase: "WAITING_FOR_RISK" as const,
          ...NEUTRAL_EXTERNAL_POLICY,
        },
      },
    ],
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: null,
  };
}

function readTree(dir: string): string[] {
  const chunks: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      chunks.push(...readTree(full));
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      chunks.push(readFileSync(full, "utf8"));
    }
  }
  return chunks;
}
