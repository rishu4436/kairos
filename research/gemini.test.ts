import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDecimal } from "@/domain/money";
import { GeminiReasoningProvider, GEMINI_ENDPOINT, extractGeminiContent } from "@/research/gemini";
import { loadResearchLab } from "@/research/lab";
import { publicLlmStatus, readLlmConfig } from "@/research/llm-config";
import { readLlmAttempt, resetLlmAttempt } from "@/research/llm-status";
import { MockReasoningProvider } from "@/research/mock-provider";
import { runResearchDraft } from "@/research/pipeline";
import type { ReasoningProvider } from "@/research/provider";
import { RESEARCH_THESIS_SCHEMA, STRATEGY_PROPOSAL_SCHEMA } from "@/research/schemas";
import { selectReasoningProvider } from "@/research/select-provider";
import { InMemoryResearchStore } from "@/research/store";
import { unavailableResearchBoundaries, type ResearchThesis } from "@/research/types";
import { collectReadiness, readinessLabels } from "@/runtime/readiness";
import { ids } from "@/test/fixtures";

const context = {
  userId: ids.userId, agentId: ids.agentId, assetId: "paper:NVDA", ticker: "NVDA", watchlist: ["NVDA"],
  observation: { price: "100", session: "CLOSED", regime: "UNKNOWN", freshness: null },
  features: [{ id: "return_1h", value: null, bps: null }, { id: "observation", value: null, bps: null }],
  signals: [], arbitration: null, paperPerformance: null, priorExperiments: [], contextId: "recorded-context",
  ...unavailableResearchBoundaries(),
};
const config = () => readLlmConfig({ KAIROS_LLM_PROVIDER: "gemini", KAIROS_LLM_API_KEY: "fixture-key" });
const interaction = (value: unknown) => new Response(JSON.stringify({ id: "interaction_fixture", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] }] }));
async function payloads() {
  const mock = new MockReasoningProvider();
  const thesis = await mock.generateThesis(context);
  const proposal = await mock.generateStrategyProposal(context, { hypothesis: { testWindowBars: 4 } } as ResearchThesis);
  if (!thesis.ok || !proposal.ok) throw new Error("Fixture unavailable");
  return { thesis: thesis.value as Record<string, unknown>, proposal: proposal.value as Record<string, unknown> };
}
function run(provider: ReasoningProvider, enoughHistory = false) {
  const bars = enoughHistory ? Array.from({ length: 40 }, (_, index) => {
    const open = parseDecimal(String(100 + index));
    const close = parseDecimal(String(101 + index));
    return { candle: { timestampMs: 1_767_225_600_000 + index * 900_000, open, high: close, low: open, close, volume: parseDecimal("1000"), tradeCount: 1 }, session: "CLOSED" as const, referenceDeviationBps: null };
  }) : [];
  return runResearchDraft({ provider, context, store: new InMemoryResearchStore(), bars, dataset: "gemini-fixture", dataSource: "MOCK_FIXTURE", contextTimestamp: "2026-01-01T00:00:00.000Z", contextDataVersion: context.contextId, initialCapital: parseDecimal("10000"), nowMs: 1_767_225_600_000, userId: ids.userId, agentId: ids.agentId });
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetLlmAttempt(); });

describe("Gemini bounded reasoning adapter", () => {
  it("selects Gemini explicitly with generic defaults and no credential leakage", () => {
    const selected = selectReasoningProvider(config());
    expect(selected).toBeInstanceOf(GeminiReasoningProvider);
    expect(selected.model).toBe("gemini-3.8-flash");
    expect(config().timeoutMs).toBe(15_000);
    const status = publicLlmStatus(config(), null);
    expect(status.providerLabel).toBe("Gemini");
    expect(JSON.stringify(status)).not.toContain("fixture-key");
    expect(readLlmConfig({ KAIROS_LLM_PROVIDER: "gemini", KAIROS_LLM_MODEL: "configured-model" }).model).toBe("configured-model");
  });

  it("makes no request without a selected Gemini key", async () => {
    const fetchImpl = vi.fn();
    for (const env of [{ KAIROS_LLM_PROVIDER: "gemini" }, { KAIROS_LLM_PROVIDER: "qwen", KAIROS_LLM_API_KEY: "qwen-fixture" }]) {
      const provider = new GeminiReasoningProvider(readLlmConfig(env), fetchImpl);
      expect(provider.configured).toBe(false);
      expect(await provider.generateThesis(context)).toMatchObject({ ok: false, errorCategory: "NOT_CONFIGURED", provider: "gemini" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    const rejected = await run(new GeminiReasoningProvider(readLlmConfig({ KAIROS_LLM_PROVIDER: "gemini" }), fetchImpl));
    expect(rejected.thesis.status).toBe("MODEL_ERROR");
    expect(rejected.thesis.provenance.sourceType).toBe("LLM");
    expect(rejected.thesis.provenance.configuredModel).toBe(false);
    expect(rejected.thesis.title).toBe("");
  });

  it.each([[401, "AUTHENTICATION_ERROR"], [403, "AUTHENTICATION_ERROR"], [429, "RATE_LIMITED"], [404, "MODEL_UNAVAILABLE"], [400, "INVALID_REQUEST"], [500, "UPSTREAM_ERROR"]])("normalizes HTTP %s with one request and no mock fallback", async (status, category) => {
    const mock = vi.spyOn(MockReasoningProvider.prototype, "generateThesis");
    const fetchImpl = vi.fn(async () => new Response("fixture-key raw sensitive body", { status: status as number }));
    const result = await selectReasoningProvider(config(), fetchImpl).generateThesis(context);
    expect(result).toMatchObject({ ok: false, errorCategory: category, provider: "gemini" });
    expect(JSON.stringify(result)).not.toContain("fixture-key");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mock).not.toHaveBeenCalled();
    expect(readLlmAttempt()?.status).toBe("ERROR");
  });

  it("classifies a timeout without retry", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw Object.assign(new Error("fixture-key"), { name: "TimeoutError" });
    });
    expect(await new GeminiReasoningProvider(config(), fetchImpl).generateThesis(context)).toMatchObject({ ok: false, errorCategory: "TIMEOUT" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readLlmAttempt()?.status).toBe("TIMEOUT");
  });

  it.each(["invalid envelope", "invalid JSON", "extra properties", "missing fields", "bad nested type", "out of range confidence", "prototype property"])("rejects %s", async (kind) => {
    const { thesis } = await payloads();
    const response = kind === "invalid envelope" ? new Response("not-json") : interaction(kind === "invalid JSON" ? "not-json" : kind === "extra properties" ? { ...thesis, wallet: "hidden" } : kind === "missing fields" ? { title: "only" } : kind === "bad nested type" ? { ...thesis, observations: [1] } : kind === "prototype property" ? { ...thesis, constructor: "hidden" } : { ...thesis, confidence: 2 });
    const result = await new GeminiReasoningProvider(config(), async () => response).generateThesis(context);
    expect(result).toMatchObject({ ok: false, errorCategory: kind === "invalid envelope" ? "MALFORMED_RESPONSE" : "STRUCTURED_OUTPUT_ERROR" });
  });

  it("passes both canonical schemas through the existing pipeline and records provenance", async () => {
    const { thesis, proposal } = await payloads();
    let calls = 0;
    const provider = new GeminiReasoningProvider(config(), async (url, init) => {
      const body = JSON.parse(String(init.body));
      expect(url).toBe(GEMINI_ENDPOINT);
      expect(init.headers).toMatchObject({ "x-goog-api-key": "fixture-key" });
      expect(body).toMatchObject({ model: "gemini-3.8-flash", store: false, stream: false, background: false, response_format: { type: "text", mime_type: "application/json" } });
      expect(body.tools).toBeUndefined();
      expect(body.response_format.schema).toEqual(calls === 0 ? RESEARCH_THESIS_SCHEMA : STRATEGY_PROPOSAL_SCHEMA);
      expect(body.input).toContain(context.contextId);
      expect(String(init.body)).not.toContain("fixture-key");
      calls += 1;
      return interaction(calls === 1 ? thesis : proposal);
    });
    const result = await run(provider);
    expect(calls).toBe(2); // Two operations in the ordinary pipeline, never in the one-call live gate.
    expect(result.proposal?.status).toBe("READY_FOR_EXPERIMENT");
    expect(result.experiment?.reason).toBe("INSUFFICIENT_HISTORY");
    expect(result.thesis.provenance).toMatchObject({ sourceType: "LLM", provider: "gemini", model: "gemini-3.8-flash", promptVersion: "1.1", contextDataVersion: context.contextId, contextTimestamp: "2026-01-01T00:00:00.000Z", status: "SUCCESS" });
    expect(result.thesis.provenance.startedAt).toMatch(/Z$/);
    expect(result.thesis.provenance.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it.each(["Connect your wallet", "Sign this transaction", "Execute the trade", "Override the risk policy"])("rejects instruction: %s before proposal generation", async (summary) => {
    const { thesis } = await payloads();
    const fetchImpl = vi.fn(async () => interaction({ ...thesis, summary }));
    const result = await run(new GeminiReasoningProvider(config(), fetchImpl));
    expect(result.thesis.status).toBe("INVALID");
    expect(result.thesis.rejectionReasons.join(" ")).toMatch(/instructions/);
    expect(result.proposal).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown evidence and a schema-valid unfalsifiable hypothesis", async () => {
    const { thesis } = await payloads();
    for (const value of [
      { ...thesis, supportingEvidence: [{ kind: "OBSERVED_FACT", statement: "Measured value", source: "invented-feature" }] },
      { ...thesis, hypothesis: { ...(thesis.hypothesis as object), expectedOutcome: "It might rise" } },
    ]) {
      const fetchImpl = vi.fn(async () => interaction(value));
      const result = await run(new GeminiReasoningProvider(config(), fetchImpl));
      expect(result.thesis.status).toBe("INVALID");
      expect(result.experiment).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("runs sufficient fixture history through the existing deterministic experiment", async () => {
    const { thesis, proposal } = await payloads();
    let calls = 0;
    const result = await run(new GeminiReasoningProvider(config(), async () => interaction(++calls === 1 ? thesis : proposal)), true);
    expect(result.thesis.status).toBe("COMPLETED");
    expect(result.experiment?.status).toBe("COMPLETED");
    expect(result.experiment?.dataSource).toBe("MOCK_FIXTURE");
    expect(result.experiment?.result).not.toBeNull();
    expect(result.thesis.provenance.contextId).toBe(context.contextId);
  });

  it("rejects wallet instructions in a proposal before a paper experiment", async () => {
    const { thesis, proposal } = await payloads();
    let calls = 0;
    const result = await run(new GeminiReasoningProvider(config(), async () => interaction(++calls === 1 ? thesis : { ...proposal, positionSizingHint: "Unlock your wallet" })), true);
    expect(result.proposal?.status).toBe("REJECTED");
    expect(result.experiment).toBeNull();
  });

  it("keeps Qwen failures on Qwen and unknown providers unsupported", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://example.com/v1/chat/completions");
      return new Response("auth failure", { status: 401 });
    });
    const qwen = selectReasoningProvider(readLlmConfig({ KAIROS_LLM_PROVIDER: "qwen", KAIROS_LLM_API_KEY: "fixture", KAIROS_QWEN_BASE_URL: "https://example.com/v1" }), fetchImpl);
    expect(await qwen.generateThesis(context)).toMatchObject({ provider: "qwen", ok: false, errorCategory: "AUTHENTICATION_ERROR" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await selectReasoningProvider(readLlmConfig({ KAIROS_LLM_PROVIDER: "unknown" }), fetchImpl).generateThesis(context)).toMatchObject({ ok: false, errorCategory: "MODEL_PROVIDER_UNSUPPORTED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("shows Gemini readiness and never inherits another provider's connected status", async () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", KAIROS_STATE_BACKEND: "memory", KAIROS_LLM_PROVIDER: "gemini", KAIROS_LLM_API_KEY: "fixture-key" };
    expect(collectReadiness(env).gemini).toBe("READY");
    expect(collectReadiness({ ...env, KAIROS_LLM_API_KEY: "" }).gemini).toBe("NOT_CONFIGURED");
    expect(readinessLabels(env).gemini).toBe("CONFIGURED · NOT VERIFIED");
    vi.stubEnv("KAIROS_LLM_PROVIDER", "gemini");
    vi.stubEnv("KAIROS_LLM_API_KEY", "fixture-key");
    vi.stubEnv("KAIROS_LLM_MODEL", "gemini-3.8-flash");
    const { thesis } = await payloads();
    const other = new GeminiReasoningProvider({ ...config(), model: "different-model" }, async () => interaction(thesis));
    await other.generateThesis(context);
    expect((await loadResearchLab("no-records")).llmLabel).toBe("NOT VERIFIED");
    await new GeminiReasoningProvider(config(), async () => interaction(thesis)).generateThesis(context);
    expect(readinessLabels(env).gemini).toBe("GEMINI · CONNECTED");
    const lab = await loadResearchLab("no-records");
    expect(lab.providerLabel).toBe("Gemini");
    expect(lab.llmLabel).toBe("CONNECTED");
  });

  it("rejects incomplete and tool responses without continuing an interaction", () => {
    expect(extractGeminiContent({ status: "requires_action", steps: [{ type: "function_call" }] })).toBeNull();
    expect(extractGeminiContent({ status: "completed", steps: [{ type: "model_output", content: [{ type: "function_call" }] }] })).toBeNull();
  });
});
