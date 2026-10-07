import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/research/route";
import { CANDLE_INTERVAL_MS, type Candle } from "@/domain/candle";
import { asUserId } from "@/domain/ids";
import { parseDecimal, SCALE } from "@/domain/money";
import type { ObservationRow } from "@/domain/observation";
import { resetTestMarketStores as resetMarketStores } from "@/test/paper-market";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { buildResearchContext } from "@/research/context";
import { generateResearchThesis } from "@/research/generate";
import { HttpReasoningProvider, extractOutputText, responsesBody } from "@/research/llm-http";
import { readLlmConfig } from "@/research/llm-config";
import { readLlmAttempt } from "@/research/llm-status";
import { MockReasoningProvider } from "@/research/mock-provider";
import { runExperiment } from "@/research/experiment";
import { runResearchDraft } from "@/research/pipeline";
import { promoteResearchCandidate } from "@/research/promotion";
import type { ReasoningProvider } from "@/research/provider";
import { RESEARCH_ANALYST_INSTRUCTIONS, RESEARCH_THESIS_SCHEMA, STRATEGY_PROPOSAL_SCHEMA } from "@/research/schemas";
import { snapshotAt, type ResearchBar } from "@/research/snapshot";
import { InMemoryResearchStore, researchStore, type ResearchStore } from "@/research/store";
import { unavailableResearchBoundaries, type ResearchThesis, type StrategyProposal } from "@/research/types";
import { validateEvidenceAgainstContext, validateProposal, validateThesis } from "@/research/validate";
import { momentumStrategy } from "@/strategies/momentum";
import { StrategyRegistry } from "@/strategies/registry";
import { ids } from "@/test/fixtures";

const savedLlmKey = process.env.KAIROS_LLM_API_KEY;
const savedLlmProvider = process.env.KAIROS_LLM_PROVIDER;

const NOW = Date.parse("2026-01-01T14:30:00.000Z");

describe("research brain", () => {
  beforeEach(() => {
    resetMarketStores();
    delete process.env.KAIROS_LLM_API_KEY;
    delete process.env.KAIROS_LLM_PROVIDER;
  });

  afterEach(() => {
    restoreEnv("KAIROS_LLM_API_KEY", savedLlmKey);
    restoreEnv("KAIROS_LLM_PROVIDER", savedLlmProvider);
  });

  it("turns a mock thesis into a deterministic paper experiment", async () => {
    const first = await draft();
    const second = await draft();
    expect(first.thesis.status).toBe("COMPLETED");
    expect(first.thesis.provenance.configuredModel).toBe(false);
    expect(first.thesis.provenance.promptVersion).toBe("1.1");
    expect(first.thesis.provenance.sourceType).toBe("MOCK");
    expect(first.experiment?.dataSource).toBe("MOCK_FIXTURE");
    expect(first.experiment?.thesisSource).toBe("MOCK");
    expect(first.thesis.supportingEvidence.some((item) => item.kind === "OBSERVED_FACT")).toBe(true);
    expect(first.thesis.contradictingEvidence.length).toBeGreaterThan(0);
    expect(first.proposal?.status).toBe("RESULT");
    expect(first.experiment?.status).toBe("COMPLETED");
    expect(first.experiment?.result?.numberOfTrades).toBeGreaterThan(0);
    expect(first.experiment?.result).toEqual(second.experiment?.result);
    expect(first.experiment?.result?.baselineName).toBe("BUY_AND_HOLD");
    expect(first.experiment?.result?.outOfSampleClaim).toBe(true);
    expect(promoteResearchCandidate().promoted).toBe(false);
  });

  it("rejects a vague thesis, bad DSL, and executable code", async () => {
    const provider = new MockReasoningProvider();
    const context = contextFor();
    const thesis = await provider.generateThesis(context);
    const vague = structuredThesis();
    vague.hypothesis = {
      conditions: [],
      session: "ANY",
      observationWindowBars: 0,
      testWindowBars: 0,
      expectedOutcome: "NVIDIA looks bullish.",
      invalidation: "",
    };
    vague.summary = "NVIDIA looks bullish.";
    expect(validateThesis(vague).ok).toBe(false);

    const inferenceAsFact = structuredThesis();
    inferenceAsFact.supportingEvidence = [{ kind: "OBSERVED_FACT", statement: "Momentum is strong.", source: null }];
    expect(validateThesis(inferenceAsFact).reasons.join(" ")).toMatch(/source/);

    const proposal = validProposal();
    proposal.entryConditions = [{ feature: "not_a_feature", operator: "GT", threshold: 1 }];
    expect(validateProposal(proposal).reasons.join(" ")).toMatch(/Unknown feature/);
    proposal.entryConditions = [{ feature: "return_1h", operator: "MOON", threshold: 1 }];
    expect(validateProposal(proposal).reasons.join(" ")).toMatch(/Unknown operator/);
    proposal.entryConditions = [{ feature: "return_1h", operator: "GT", threshold: Number.POSITIVE_INFINITY }];
    expect(validateProposal(proposal).reasons.join(" ")).toMatch(/finite/);
    proposal.entryConditions = [{ feature: "market_session", operator: "EQ", threshold: "LUNAR" }];
    expect(validateProposal(proposal).reasons.join(" ")).toMatch(/Unknown session/);
    proposal.entryConditions = [{ feature: "regime", operator: "EQ", threshold: "EUPHORIA" }];
    expect(validateProposal(proposal).reasons.join(" ")).toMatch(/Unknown regime/);
    proposal.entryConditions = Array.from({ length: 9 }, () => ({ feature: "return_1h", operator: "GT", threshold: 1 }));
    expect(validateProposal(proposal).reasons.join(" ")).toMatch(/exceeds/);
    const negative = validProposal();
    negative.holdingPeriod = -1;
    expect(validateProposal(negative).reasons.join(" ")).toMatch(/Holding period/);
    const coded = validProposal();
    coded.invalidationConditions = ["eval(() => 1)"];
    expect(validateProposal(coded).reasons.join(" ")).toMatch(/Executable code/);
    const python = validProposal();
    python.invalidationConditions = ["def steal(): pass"];
    expect(validateProposal(python).reasons.join(" ")).toMatch(/Executable code/);
    const sql = validProposal();
    sql.invalidationConditions = ["SELECT secret FROM users"];
    expect(validateProposal(sql).reasons.join(" ")).toMatch(/Executable code/);
    const shell = validProposal();
    shell.positionSizingHint = "$(curl example)";
    expect(validateProposal(shell).reasons.join(" ")).toMatch(/Executable code/);
    const prediction = structuredThesis();
    prediction.supportingEvidence = [{ kind: "OBSERVED_FACT", statement: "return_1h will exceed 50.", source: "return_1h" }];
    expect(validateEvidenceAgainstContext(prediction, contextFor()).reasons.join(" ")).toMatch(/prediction/);
    expect(thesis.ok).toBe(true);
  });

  it("does not let future bars change an earlier decision and does not invent missing data", () => {
    const bars = risingBars(40);
    const before = snapshotAt(bars, 10);
    bars[20] = {
      ...bars[20],
      session: "OPEN",
      referenceDeviationBps: 9_999n,
      candle: { ...bars[20].candle, close: 9_999n * SCALE },
    };
    expect(snapshotAt(bars, 10)).toEqual(before);
    expect(snapshotAt(bars, 10).numeric.reference_deviation_bps).toBeUndefined();
    const short = runExperiment(validProposal(), risingBars(10), parseDecimal("10000"));
    expect(short.status).toBe("INVALID");
    expect(short.reason).toBe("INSUFFICIENT_HISTORY");
    expect(short.metrics).toBeNull();
  });

  it("isolates research records by user and keeps the registry unchanged", async () => {
    const store = new InMemoryResearchStore();
    const run = await draft(store);
    expect(store.getThesis(asUserId("user_b"), run.thesis.thesisId)).toBeNull();
    expect(store.listExperiments(asUserId("user_b"))).toHaveLength(0);
    const registry = new StrategyRegistry();
    registry.register(momentumStrategy);
    expect(() =>
      registry.register({
        metadata: { ...momentumStrategy.metadata, id: "candidate", status: "research_candidate" },
        evaluate: (input) => momentumStrategy.evaluate(input),
      }),
    ).toThrow(/cannot be registered/);
    expect(registry.list().map((item) => item.metadata.id)).toEqual(["momentum"]);
    expect(run.experiment?.executionPolicy).toMatch(/separate from the user book/);
  });

  it("times out and hides provider failures without revealing the key", async () => {
    const key = "super-secret-key";
    const config = readLlmConfig({
      KAIROS_LLM_PROVIDER: "xai",
      KAIROS_LLM_API_KEY: key,
      KAIROS_LLM_MODEL: "grok-4.7",
      KAIROS_LLM_TIMEOUT_MS: "1000",
    });
    expect(config.configured).toBe(true);
    const provider = new HttpReasoningProvider(config, () => Promise.reject(new Error(`timeout ${key}`)));
    const failed = await provider.generateThesis(contextFor());
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error).not.toContain(key);
      expect(failed.error).toBe("The research model did not respond.");
    }
    let calls = 0;
    const flaky = new HttpReasoningProvider(config, async (url, init) => {
      calls += 1;
      const body = JSON.parse(String(init.body));
      expect(url).toBe("https://api.x.ai/v1/responses");
      expect(body.text.format.type).toBe("json_schema");
      expect(body.text.format.strict).toBe(true);
      expect(body.tools).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(key);
      if (calls === 1) {
        return new Response("nope", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: "{\"title\":\"x\"}" }] }],
        }),
        { status: 200 },
      );
    });
    const recovered = await flaky.generateThesis(contextFor());
    expect(recovered.ok).toBe(true);
    expect(calls).toBe(2);
    const unknown = new HttpReasoningProvider({ ...config, provider: "other" }, () => Promise.reject(new Error("unused")));
    const blocked = await unknown.generateThesis(contextFor());
    expect(blocked.ok).toBe(false);
  });

  it("does not turn a missing model or another user into the mock lab", async () => {
    const missing = await generateResearchThesis({ userId: DEMO_USER_ID, assetId: "NVDA", mode: "llm", nowMs: NOW });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("NOT_CONFIGURED");
    expect(researchStore().listTheses(asUserId(DEMO_USER_ID))).toHaveLength(0);
    const other = await generateResearchThesis({ userId: "user_b", assetId: "NVDA", mode: "mock", nowMs: NOW });
    expect(other.code).toBe("USER_MISMATCH");
    expect(researchStore().listTheses(asUserId("user_b"))).toHaveLength(0);
  });

  it("rejects an observed fact that cites earnings when no earnings were supplied", async () => {
    const store = new InMemoryResearchStore();
    const provider = new MockReasoningProvider();
    const original = provider.generateThesis.bind(provider);
    provider.generateThesis = async (context) => {
      const response = await original(context);
      if (!response.ok || !response.value || typeof response.value !== "object") {
        return response;
      }
      const value = response.value as { supportingEvidence: { kind: string; statement: string; source: string | null }[] };
      value.supportingEvidence.push({
        kind: "OBSERVED_FACT",
        statement: "Investors are buying because earnings are strong.",
        source: "observation",
      });
      return response;
    };
    const run = await runResearchDraft({
      provider,
      context: contextFor(),
      store,
      bars: risingBars(40),
      dataset: "deterministic_research_sample",
      dataSource: "MOCK_FIXTURE",
      contextTimestamp: "2026-01-01T14:30:00.000Z",
      contextDataVersion: "test",
      initialCapital: parseDecimal("10000"),
      nowMs: NOW,
      userId: ids.userId,
      agentId: ids.agentId,
    });
    expect(run.thesis.status).toBe("INVALID");
    expect(run.thesis.rejectionReasons.join(" ")).toMatch(/earnings/);
    expect(run.experiment).toBeNull();
  });

  it("builds a Responses API request and reads structured output text", () => {
    const body = responsesBody("grok-4.7", "research_thesis", RESEARCH_THESIS_SCHEMA, "context");
    expect(body.model).toBe("grok-4.7");
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    const text = body.text as { format: { type: string; name: string; strict: boolean; schema: { additionalProperties: boolean } } };
    expect(text.format).toMatchObject({ type: "json_schema", name: "research_thesis", strict: true });
    expect(text.format.schema.additionalProperties).toBe(false);
    expect(RESEARCH_THESIS_SCHEMA.properties).not.toHaveProperty("userId");
    expect(STRATEGY_PROPOSAL_SCHEMA.properties).not.toHaveProperty("userId");
    expect(RESEARCH_ANALYST_INSTRUCTIONS).toContain("You have no access to live markets beyond the structured context provided to you.");
    expect(RESEARCH_ANALYST_INSTRUCTIONS).toContain("You must not claim to have read news, earnings, filings, or external sources unless they are explicitly included in the context.");
    expect(RESEARCH_ANALYST_INSTRUCTIONS).toContain("Do not invent missing market data.");
    const encoded = JSON.stringify(body);
    expect(encoded).not.toContain("choices");
    expect(extractOutputText({ choices: [{ message: { content: "{\"title\":\"old\"}" } }] })).toBeNull();
    expect(extractOutputText({ output: [{ type: "message", content: [{ type: "output_text", text: "{\"title\":\"x\"}" }] }] })).toBe("{\"title\":\"x\"}");
  });

  it("keeps mock and model providers on one interface and does not replace a model failure", async () => {
    const config = llmConfig();
    const timeout = new Error("slow");
    timeout.name = "TimeoutError";
    const mockProvider: ReasoningProvider = new MockReasoningProvider();
    const httpProvider: ReasoningProvider = new HttpReasoningProvider(config, () => Promise.reject(timeout));
    expect(mockProvider.configured).toBe(false);
    expect(httpProvider.configured).toBe(true);
    for (const provider of [mockProvider, httpProvider]) {
      expect(typeof provider.generateThesis).toBe("function");
      expect(typeof provider.generateStrategyProposal).toBe("function");
    }
    const failed = await runResearchDraft({
      provider: httpProvider,
      context: contextFor(),
      store: new InMemoryResearchStore(),
      bars: risingBars(40),
      dataset: "live-history",
      dataSource: "LIVE_BINANCE_HISTORY",
      contextTimestamp: "2026-01-01T14:30:00.000Z",
      contextDataVersion: "live:paper:NVDA:40",
      initialCapital: parseDecimal("10000"),
      nowMs: NOW,
      userId: ids.userId,
      agentId: ids.agentId,
    });
    expect(failed.thesis.status).toBe("MODEL_ERROR");
    expect(failed.thesis.title).toBe("");
    expect(failed.thesis.provenance.sourceType).toBe("LLM");
    expect(failed.thesis.provenance.status).toBe("TIMEOUT");
    expect(failed.thesis.provenance.errorCategory).toBe("TIMEOUT");
    expect(failed.thesis.provenance.provider).toBe("xai");
    expect(failed.thesis.provenance.model).toBe("grok-4.7");
    expect(failed.experiment).toBeNull();
    expect(failed.proposal).toBeNull();
    expect(readLlmAttempt()?.status).toBe("TIMEOUT");
    expect(readLlmAttempt()?.errorCategory).toBe("TIMEOUT");
  });

  it("turns a structured model thesis into an experiment and keeps the caller's identity", async () => {
    const { provider } = await scriptedModel();
    const run = await runResearchDraft({
      provider,
      context: contextFor(),
      store: researchStore(),
      bars: risingBars(40),
      dataset: "binance-history",
      dataSource: "LIVE_BINANCE_HISTORY",
      contextTimestamp: "2026-01-01T14:30:00.000Z",
      contextDataVersion: "LIVE_BINANCE_HISTORY:paper:NVDA:40",
      initialCapital: parseDecimal("10000"),
      nowMs: NOW,
      userId: ids.userId,
      agentId: ids.agentId,
    });
    expect(run.thesis.status).toBe("COMPLETED");
    expect(run.thesis.userId).toBe(ids.userId);
    expect(run.thesis.agentId).toBe(ids.agentId);
    expect(run.thesis.provenance.sourceType).toBe("LLM");
    expect(run.thesis.provenance.provider).toBe("xai");
    expect(run.thesis.provenance.model).toBe("grok-4.7");
    expect(run.thesis.provenance.promptVersion).toBe("1.1");
    expect(run.thesis.provenance.contextTimestamp).toBe("2026-01-01T14:30:00.000Z");
    expect(run.thesis.provenance.contextDataVersion).toContain("LIVE_BINANCE_HISTORY");
    expect(run.thesis.provenance.requestId.length).toBeGreaterThan(0);
    expect(run.thesis.provenance.latencyMs).toBeGreaterThanOrEqual(0);
    expect(run.thesis.provenance.status).toBe("SUCCESS");
    expect(run.experiment?.thesisSource).toBe("LLM");
    expect(run.experiment?.dataSource).toBe("LIVE_BINANCE_HISTORY");
    expect(run.experiment?.status).toBe("COMPLETED");
    expect(run.experiment?.experimentId).toBe(`experiment_${run.proposal?.proposalId}`);
    expect(run.thesis.rejectionReasons).toEqual([]);
    expect(researchStore().getThesis(asUserId("user_b"), run.thesis.thesisId)).toBeNull();
  });

  it("marks short live history invalid and does not invent candles", async () => {
    const { provider } = await scriptedModel();
    const bars = risingBars(10);
    const run = await runResearchDraft({
      provider,
      context: contextFor(),
      store: new InMemoryResearchStore(),
      bars,
      dataset: "short-live-history",
      dataSource: "LIVE_BINANCE_HISTORY",
      contextTimestamp: "2026-01-01T14:30:00.000Z",
      contextDataVersion: "LIVE_BINANCE_HISTORY:paper:NVDA:10",
      initialCapital: parseDecimal("10000"),
      nowMs: NOW + 1,
      userId: ids.userId,
      agentId: ids.agentId,
    });
    expect(run.experiment?.status).toBe("INVALID");
    expect(run.experiment?.reason).toBe("INSUFFICIENT_HISTORY");
    expect(run.experiment?.result).toBeNull();
    expect(run.experiment?.dataSource).toBe("LIVE_BINANCE_HISTORY");
    expect(run.experiment?.thesisSource).toBe("LLM");
    expect(run.thesis.status).toBe("READY_FOR_EXPERIMENT");
    expect(run.thesis.provenance.sourceType).toBe("LLM");
    expect(bars).toHaveLength(10);
  });

  it("builds research context from a canonical row and hides another user's experiments", async () => {
    await draft(researchStore());
    const owned = buildResearchContext({
      userId: ids.userId,
      agentId: ids.agentId,
      row: sampleRow(),
      candles: risingBars(4).map((bar) => bar.candle),
      watchlist: ["NVDA", "TSLA"],
      dataSource: "LIVE_BINANCE_HISTORY",
      nowMs: NOW,
    });
    expect(owned.context.paperPerformance).toBeNull();
    expect(owned.context.newsContext.status).toBe("UNAVAILABLE");
    expect(owned.context.newsContext.items).toBeNull();
    expect(owned.context.eventContext.status).toBe("UNAVAILABLE");
    expect(owned.context.eventContext.providerAnswered).toBe(false);
    expect(owned.context.features.map((feature) => feature.id)).toEqual(["return_1h"]);
    expect(owned.context.signals).toEqual([{ strategyId: "momentum", action: "HOLD" }]);
    expect(owned.context.arbitration).toEqual({ decision: "NO_OPPORTUNITY", action: null });
    expect(owned.context.priorExperiments.length).toBeGreaterThan(0);
    expect(owned.bars[0]?.session).toBe("UNKNOWN");
    expect(owned.bars.at(-1)?.session).toBe("CLOSED");
    expect(owned.bars.at(-1)?.referenceDeviationBps).toBe(142n);
    expect(owned.contextDataVersion).toContain("LIVE_BINANCE_HISTORY:paper:NVDA:4");
    const other = buildResearchContext({
      userId: "user_b",
      agentId: "agent_b",
      row: sampleRow(),
      candles: risingBars(4).map((bar) => bar.candle),
      watchlist: ["NVDA"],
      dataSource: "MOCK_FIXTURE",
      nowMs: NOW,
    });
    expect(other.context.priorExperiments).toEqual([]);
    expect(other.context.userId).toBe("user_b");
  });

  it("serves the mock lab only when asked and ignores a client-supplied context", async () => {
    const mock = await generateResearchThesis({ userId: DEMO_USER_ID, assetId: "NVDA", mode: "mock", nowMs: NOW });
    expect(mock.ok).toBe(true);
    expect(mock.stage).toBe("THESIS CREATED");
    expect(mock.validation).toBe("PASS");
    expect(mock.sourceType).toBe("MOCK");
    expect(mock.dataSource).toBe("MOCK_FIXTURE");
    const stored = researchStore().listTheses(asUserId(DEMO_USER_ID));
    expect(stored[0]?.provenance.sourceType).toBe("MOCK");
    expect(stored[0]?.provenance.model).toBe("mock-1");
    const response = await POST(new Request("http://kairos.local/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user_b",
        assetId: "NVDA",
        mode: "llm",
        context: { features: [{ id: "earnings", value: "secret-feature" }] },
        apiKey: "client-key",
      }),
    }));
    expect(response.status).toBe(400);
    const body = await response.json() as { code?: string };
    expect(body.code).toBe("USER_MISMATCH");
    expect(JSON.stringify(body)).not.toContain("client-key");
    expect(JSON.stringify(body)).not.toContain("secret-feature");
    expect(researchStore().listTheses(asUserId("user_b"))).toHaveLength(0);
  });

  it("cannot reach wallets, trade intents, or the paper cycle", () => {
    const source = readdirSync(join(process.cwd(), "research"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(process.cwd(), "research", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/@\/wallet/);
    expect(source).not.toMatch(/@\/paper\/intent/);
    expect(source).not.toMatch(/@\/paper\/cycle/);
    expect(source).not.toMatch(/@\/paper\/gateway/);
    expect(source).not.toMatch(/createTradeIntent/);
    expect(source).not.toMatch(/signTransaction/);
    expect(source).not.toMatch(/broadcastTransaction/);
    expect(source).not.toMatch(/registry\.register/);
  });
});

function restoreEnv(name: "KAIROS_LLM_API_KEY" | "KAIROS_LLM_PROVIDER", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function llmConfig() {
  return readLlmConfig({
    KAIROS_LLM_PROVIDER: "xai",
    KAIROS_LLM_API_KEY: "test-key",
    KAIROS_LLM_MODEL: "grok-4.7",
    KAIROS_LLM_TIMEOUT_MS: "1000",
  });
}

async function scriptedModel(): Promise<{ provider: HttpReasoningProvider }> {
  const mock = new MockReasoningProvider();
  const context = contextFor();
  const thesisResponse = await mock.generateThesis(context);
  const proposalResponse = await mock.generateStrategyProposal(context, draftThesis());
  if (!thesisResponse.ok || !proposalResponse.ok) {
    throw new Error("The mock provider did not return a draft.");
  }
  const thesisText = JSON.stringify({ ...(thesisResponse.value as object), userId: "user_b", agentId: "agent_other" });
  const proposalText = JSON.stringify(proposalResponse.value);
  let calls = 0;
  const provider = new HttpReasoningProvider(llmConfig(), async (url, init) => {
    calls += 1;
    expect(url).toBe("https://api.x.ai/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("test-key");
    const name = calls === 1 ? "research_thesis" : "strategy_proposal";
    expect(body.text.format.name).toBe(name);
    const text = calls === 1 ? thesisText : proposalText;
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });
  });
  return { provider };
}

function sampleRow(): ObservationRow {
  return {
    ticker: "NVDA",
    representationId: "paper:NVDA",
    price: "184.55",
    session: "CLOSED",
    regime: "TRENDING_UP",
    freshnessLabel: "SAMPLE",
    deviationPct: 1.42,
    features: [{ id: "return_1h", value: "0.0142" }],
    signals: [{ strategyId: "momentum", action: "HOLD" }],
    arbitration: { decision: "NO_OPPORTUNITY", selectedAction: null },
  } as ObservationRow;
}

function contextFor() {
  return {
    userId: ids.userId,
    agentId: ids.agentId,
    assetId: "paper:NVDA",
    ticker: "NVDA",
    watchlist: ["NVDA"],
    observation: { price: "100", session: "CLOSED", regime: "UNKNOWN", freshness: null },
    features: [{ id: "return_1h", value: null, bps: null }, { id: "observation", value: null, bps: null }],
    signals: [],
    arbitration: null,
    paperPerformance: null,
    priorExperiments: [],
    contextId: null,
    ...unavailableResearchBoundaries(),
  };
}

async function draft(store: ResearchStore = new InMemoryResearchStore()) {
  return runResearchDraft({
    provider: new MockReasoningProvider(),
    context: contextFor(),
    store,
    bars: risingBars(40),
    dataset: "deterministic_research_sample",
    dataSource: "MOCK_FIXTURE",
    contextTimestamp: "2026-01-01T14:30:00.000Z",
    contextDataVersion: "mock:NVDA:40",
    initialCapital: parseDecimal("10000"),
    nowMs: NOW,
    userId: ids.userId,
    agentId: ids.agentId,
  });
}

function structuredThesis() {
  return draftThesis();
}

function draftThesis(): ResearchThesis {
  const provider = new MockReasoningProvider();
  return {
    thesisId: "thesis",
    userId: ids.userId,
    agentId: ids.agentId,
    assetId: "paper:NVDA",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    title: "Continuation",
    summary: "A check.",
    hypothesis: {
      conditions: ["return_1h >= 50 bps"],
      session: "ANY" as const,
      observationWindowBars: 4,
      testWindowBars: 4,
      expectedOutcome: "Forward return exceeds 20 bps.",
      invalidation: "return_1h < 0",
    },
    observations: [],
    assumptions: [],
    supportingEvidence: [{ kind: "OBSERVED_FACT" as const, statement: "Feature exists.", source: "return_1h" }],
    contradictingEvidence: [{ kind: "HYPOTHESIS" as const, statement: "It can reverse.", source: null }],
    requiredData: ["return_1h"],
    invalidationConditions: ["return_1h < 0"],
    riskConsiderations: [],
    confidence: 0.4,
    status: "VALIDATING" as const,
    version: "1",
    provenance: {
      sourceType: "MOCK",
      provider: provider.id,
      model: provider.model,
      promptVersion: "1.1",
      createdAt: "2026-01-01T00:00:00.000Z",
      contextTimestamp: "2026-01-01T00:00:00.000Z",
      contextDataVersion: "test",
      configuredModel: false,
      requestId: "mock_1.1",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      latencyMs: 0,
      status: "SUCCESS",
      errorCategory: null,
    },
    rejectionReasons: [],
  };
}

function validProposal(): StrategyProposal {
  return {
    proposalId: "proposal",
    thesisId: "thesis",
    userId: ids.userId,
    agentId: ids.agentId,
    assetScope: ["NVDA"],
    sessionScope: ["ANY"],
    regimeScope: ["ANY"],
    features: ["return_1h"],
    entryConditions: [{ feature: "return_1h", operator: "GTE", threshold: 1 }],
    exitConditions: [],
    holdingPeriod: 2,
    action: "BUY",
    positionSizingHint: "one unit",
    invalidationConditions: ["return_1h < 0"],
    parameterSet: {},
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "VALIDATING",
    provenance: draftThesis().provenance,
    rejectionReasons: [],
  };
}

function risingBars(count: number): ResearchBar[] {
  let close = parseDecimal("100");
  const bars: ResearchBar[] = [];
  for (let index = 0; index < count; index += 1) {
    const open = close;
    close = close + parseDecimal("0.50");
    const candle: Candle = {
      timestampMs: NOW + index * CANDLE_INTERVAL_MS,
      open,
      high: close,
      low: open,
      close,
      volume: 1_000n * SCALE,
      tradeCount: 1,
    };
    bars.push({ candle, session: "CLOSED", referenceDeviationBps: null });
  }
  return bars;
}

