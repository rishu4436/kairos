import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANDLE_INTERVAL_MS, type Candle } from "@/domain/candle";
import { asUserId } from "@/domain/ids";
import { parseDecimal, SCALE } from "@/domain/money";
import { resetTestMarketStores as resetMarketStores } from "@/test/paper-market";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { generateResearchThesis } from "@/research/generate";
import { normalizeQwenBase, publicLlmStatus, readLlmConfig } from "@/research/llm-config";
import { HttpReasoningProvider } from "@/research/llm-http";
import { readLlmAttempt } from "@/research/llm-status";
import { MockReasoningProvider } from "@/research/mock-provider";
import { runResearchDraft } from "@/research/pipeline";
import type { ReasoningProvider } from "@/research/provider";
import { extractChatContent, qwenChatUrl, qwenRequestBody, QwenReasoningProvider } from "@/research/qwen";
import { QWEN_RESEARCH_INSTRUCTIONS, QWEN_STRATEGY_PROMPT_VERSION, QWEN_THESIS_PROMPT_VERSION } from "@/research/qwen-prompt";
import { RESEARCH_THESIS_SCHEMA, STRATEGY_PROPOSAL_SCHEMA } from "@/research/schemas";
import { selectReasoningProvider } from "@/research/select-provider";
import { InMemoryResearchStore, researchStore } from "@/research/store";
import { unavailableResearchBoundaries, type ResearchThesis } from "@/research/types";
import { ids } from "@/test/fixtures";

const NOW = Date.parse("2026-01-01T14:30:00.000Z");
const BASE = "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
const saved = {
  provider: process.env.KAIROS_LLM_PROVIDER,
  key: process.env.KAIROS_LLM_API_KEY,
  model: process.env.KAIROS_LLM_MODEL,
  base: process.env.KAIROS_QWEN_BASE_URL,
};

describe("qwen provider", () => {
  beforeEach(() => {
    resetMarketStores();
    delete process.env.KAIROS_LLM_PROVIDER;
    delete process.env.KAIROS_LLM_API_KEY;
    delete process.env.KAIROS_LLM_MODEL;
    delete process.env.KAIROS_QWEN_BASE_URL;
  });

  afterEach(() => {
    restore("KAIROS_LLM_PROVIDER", saved.provider);
    restore("KAIROS_LLM_API_KEY", saved.key);
    restore("KAIROS_LLM_MODEL", saved.model);
    restore("KAIROS_QWEN_BASE_URL", saved.base);
  });

  it("builds the documented chat completions request and leaves xAI on the responses API", async () => {
    const { thesis } = await payloads();
    let seen = "";
    const provider = new QwenReasoningProvider(qwenConfig(), async (url, init) => {
      seen = String(init.body);
      expect(url).toBe(`${BASE}/chat/completions`);
      const body = JSON.parse(seen);
      expect(body.model).toBe("qwen3.8-max");
      expect(body.tools).toBeUndefined();
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.response_format.json_schema.name).toBe("research_thesis");
      expect(body.response_format.json_schema.schema).toEqual(RESEARCH_THESIS_SCHEMA);
      expect(body.messages[0].content).toBe(QWEN_RESEARCH_INSTRUCTIONS);
      expect(seen).not.toContain("qwen-secret");
      return chat(thesis);
    });
    const result = await provider.generateThesis(contextFor());
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("qwen");
    expect(result.promptVersion).toBe(QWEN_THESIS_PROMPT_VERSION);
    expect(qwenChatUrl(`${BASE}/chat/completions`)).toBe(`${BASE}/chat/completions`);
    const direct = qwenRequestBody("qwen3.8-max", "strategy_proposal", STRATEGY_PROPOSAL_SCHEMA, "proposal");
    expect(JSON.stringify(direct)).not.toContain("web_search");
  });

  it("runs a qwen thesis and an xAI thesis through the same pipeline", async () => {
    const { thesis, proposal } = await payloads();
    const qwenRun = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), scriptedQwen(thesis, proposal)), NOW));
    const xaiRun = await runResearchDraft(draftInput(new HttpReasoningProvider(xaiConfig(), scriptedXai(thesis, proposal)), NOW + 1));
    expect(qwenRun.thesis.status).toBe("COMPLETED");
    expect(qwenRun.thesis.provenance.sourceType).toBe("LLM");
    expect(qwenRun.thesis.provenance.provider).toBe("qwen");
    expect(qwenRun.thesis.provenance.model).toBe("qwen3.8-max");
    expect(qwenRun.thesis.provenance.promptVersion).toBe("1.1");
    expect(qwenRun.thesis.userId).toBe(ids.userId);
    expect(qwenRun.experiment?.thesisSource).toBe("LLM");
    expect(qwenRun.experiment?.status).toBe("COMPLETED");
    expect(xaiRun.thesis.provenance.provider).toBe("xai");
    expect(xaiRun.thesis.provenance.model).toBe("grok-4.7");
    expect(xaiRun.thesis.status).toBe("COMPLETED");
    expect(xaiRun.experiment?.dataSource).toBe("MOCK_FIXTURE");
  });

  it("fails closed on malformed output, schema violations, and unsafe proposals", async () => {
    const { thesis, proposal } = await payloads();
    const malformed = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), async () => chat("not-json")), NOW + 2));
    expect(malformed.thesis.status).toBe("MODEL_ERROR");
    expect(malformed.thesis.provenance.errorCategory).toBe("STRUCTURED_OUTPUT_ERROR");
    expect(malformed.experiment).toBeNull();
    expect(malformed.thesis.title).toBe("");

    const incomplete = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), async () => chat({ title: 1 })), NOW + 3));
    expect(incomplete.thesis.status).toBe("INVALID");
    expect(incomplete.experiment).toBeNull();

    const earned = clone(thesis) as unknown as { supportingEvidence: { kind: string; statement: string; source: string | null }[] };
    earned.supportingEvidence.push({ kind: "OBSERVED_FACT", statement: "Investors are buying because earnings are strong.", source: "observation" });
    const earnings = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), scriptedQwen(earned, proposal)), NOW + 4));
    expect(earnings.thesis.status).toBe("INVALID");
    expect(earnings.thesis.rejectionReasons.join(" ")).toMatch(/earnings/);

    const unknown = clone(proposal) as { entryConditions: { feature: string; operator: string; threshold: number }[] };
    unknown.entryConditions = [{ feature: "not_a_feature", operator: "GT", threshold: 1 }];
    const unknownRun = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), scriptedQwen(thesis, unknown)), NOW + 5));
    expect(unknownRun.thesis.status).toBe("REJECTED");
    expect(unknownRun.thesis.rejectionReasons.join(" ")).toMatch(/Unknown feature/);

    const coded = clone(proposal) as { invalidationConditions: string[] };
    coded.invalidationConditions = ["eval(() => 1)"];
    const codedRun = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), scriptedQwen(thesis, coded)), NOW + 6));
    expect(codedRun.thesis.status).toBe("REJECTED");
    expect(codedRun.thesis.rejectionReasons.join(" ")).toMatch(/Executable code/);

    const missing = clone(proposal) as { invalidationConditions: string[] };
    missing.invalidationConditions = [];
    const missingRun = await runResearchDraft(draftInput(new QwenReasoningProvider(qwenConfig(), scriptedQwen(thesis, missing)), NOW + 7));
    expect(missingRun.thesis.status).toBe("REJECTED");
    expect(missingRun.experiment).toBeNull();
  });

  it("normalizes authentication, timeout, upstream, and rate-limit failures without another provider", async () => {
    let calls = 0;
    const auth = new QwenReasoningProvider(qwenConfig(), async () => {
      calls += 1;
      return new Response("no", { status: 401 });
    });
    const authResult = await auth.generateThesis(contextFor());
    expect(authResult.ok).toBe(false);
    if (!authResult.ok) {
      expect(authResult.errorCategory).toBe("AUTHENTICATION_ERROR");
      expect(authResult.error).not.toContain("qwen-secret");
    }
    expect(calls).toBe(1);

    calls = 0;
    const limited = new QwenReasoningProvider(qwenConfig(), async () => {
      calls += 1;
      return new Response("no", { status: 429 });
    });
    const limitedResult = await limited.generateThesis(contextFor());
    expect(limitedResult.ok).toBe(false);
    if (!limitedResult.ok) {
      expect(limitedResult.errorCategory).toBe("RATE_LIMITED");
    }
    expect(calls).toBe(1);

    calls = 0;
    const timeout = new Error("slow");
    timeout.name = "TimeoutError";
    const timed = new QwenReasoningProvider(qwenConfig(), async () => {
      calls += 1;
      throw timeout;
    });
    const timedResult = await timed.generateThesis(contextFor());
    expect(timedResult.ok).toBe(false);
    if (!timedResult.ok) {
      expect(timedResult.errorCategory).toBe("TIMEOUT");
    }
    expect(calls).toBe(2);
    expect(readLlmAttempt()?.status).toBe("TIMEOUT");

    calls = 0;
    const { thesis } = await payloads();
    const flaky = new QwenReasoningProvider(qwenConfig(), async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("down", { status: 500 });
      }
      return chat(thesis);
    });
    const recovered = await flaky.generateThesis(contextFor());
    expect(recovered.ok).toBe(true);
    expect(calls).toBe(2);

    const unavailable = new QwenReasoningProvider(qwenConfig(), async () => new Response("missing", { status: 404 }));
    const missingModel = await unavailable.generateThesis(contextFor());
    expect(missingModel.ok).toBe(false);
    if (!missingModel.ok) {
      expect(missingModel.errorCategory).toBe("MODEL_UNAVAILABLE");
    }
    expect(extractChatContent({ choices: [] })).toBeNull();
  });

  it("preserves timeout classification when only one request is authorized", async () => {
    let calls = 0;
    const provider = new QwenReasoningProvider(qwenConfig(), async () => {
      calls += 1;
      const error = new Error("local timeout fixture");
      error.name = "TimeoutError";
      throw error;
    }, 1);
    const result = await provider.generateThesis(contextFor());
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCategory).toBe("TIMEOUT");
    expect(readLlmAttempt()?.status).toBe("TIMEOUT");
  });

  it("rejects an unknown provider and a missing Qwen base URL without using mock output", async () => {
    const providers: ReasoningProvider[] = [
      new MockReasoningProvider(),
      new QwenReasoningProvider(qwenConfig(), async () => chat({ title: "x" })),
      new HttpReasoningProvider(xaiConfig(), async () => new Response("{}", { status: 400 })),
    ];
    for (const provider of providers) {
      expect(typeof provider.generateThesis).toBe("function");
      expect(typeof provider.generateStrategyProposal).toBe("function");
    }
    expect(providers[0]?.configured).toBe(false);
    expect(providers[1]?.configured).toBe(true);
    const blocked = selectReasoningProvider(readLlmConfig({ KAIROS_LLM_PROVIDER: "other", KAIROS_LLM_API_KEY: "qwen-secret" }));
    const failed = await blocked.generateThesis(contextFor());
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.errorCategory).toBe("MODEL_PROVIDER_UNSUPPORTED");
    }
    expect(normalizeQwenBase("http://example.com/v1")).toBe("");
    const hidden = publicLlmStatus(qwenConfig(), null);
    expect(JSON.stringify(hidden)).not.toContain("qwen-secret");
    expect(JSON.stringify(hidden)).not.toContain("maas.aliyuncs.com");
    expect(hidden.providerLabel).toBe("Qwen");
    expect(hidden.productName).toBe("Qwen3.8-Max");
    expect(hidden.model).toBe("qwen3.8-max");

    process.env.KAIROS_LLM_PROVIDER = "qwen";
    process.env.KAIROS_LLM_API_KEY = "qwen-secret";
    const missing = await generateResearchThesis({ userId: DEMO_USER_ID, assetId: "NVDA", mode: "llm", nowMs: NOW });
    expect(missing.code).toBe("NOT_CONFIGURED");
    expect(missing.message).toMatch(/base URL/);
    expect(researchStore().listTheses(asUserId(DEMO_USER_ID))).toHaveLength(0);

    process.env.KAIROS_LLM_PROVIDER = "other";
    const unsupported = await generateResearchThesis({ userId: DEMO_USER_ID, assetId: "NVDA", mode: "llm", nowMs: NOW + 8 });
    expect(unsupported.code).toBe("MODEL_PROVIDER_UNSUPPORTED");
    expect(researchStore().listTheses(asUserId(DEMO_USER_ID))[0]?.provenance.sourceType).not.toBe("MOCK");
    expect(researchStore().listTheses(asUserId(DEMO_USER_ID))[0]?.title).toBe("");
  });

  it("keeps the key and the base URL out of client code and the provider out of execution imports", () => {
    const client = ["components", "app", "features"]
      .flatMap((dir) => walk(join(process.cwd(), dir)))
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(client).not.toContain("KAIROS_LLM_API_KEY");
    expect(client).not.toContain("KAIROS_QWEN_BASE_URL");
    const research = readFileSync(join(process.cwd(), "research", "qwen.ts"), "utf8");
    expect(research).not.toMatch(/@\/wallet|@\/paper\/intent|createTradeIntent|signTransaction|broadcastTransaction|registry\.register/);
    expect(QWEN_STRATEGY_PROMPT_VERSION).toBe("1.1");
  });
});

function restore(name: "KAIROS_LLM_PROVIDER" | "KAIROS_LLM_API_KEY" | "KAIROS_LLM_MODEL" | "KAIROS_QWEN_BASE_URL", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function qwenConfig() {
  return readLlmConfig({
    KAIROS_LLM_PROVIDER: "qwen",
    KAIROS_LLM_API_KEY: "qwen-secret",
    KAIROS_LLM_MODEL: "qwen3.8-max",
    KAIROS_LLM_TIMEOUT_MS: "1000",
    KAIROS_QWEN_BASE_URL: BASE,
  });
}

function xaiConfig() {
  return readLlmConfig({
    KAIROS_LLM_PROVIDER: "xai",
    KAIROS_LLM_API_KEY: "xai-secret",
    KAIROS_LLM_MODEL: "grok-4.7",
    KAIROS_LLM_TIMEOUT_MS: "1000",
  });
}

function chat(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({
    id: "chatcmpl-test",
    choices: [{ message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } }],
  }), { status });
}

function scriptedQwen(thesis: unknown, proposal: unknown) {
  let calls = 0;
  return async () => {
    calls += 1;
    return chat(calls === 1 ? thesis : proposal);
  };
}

function scriptedXai(thesis: unknown, proposal: unknown) {
  let calls = 0;
  return async (url: string) => {
    calls += 1;
    expect(url).toBe("https://api.x.ai/v1/responses");
    const text = JSON.stringify(calls === 1 ? thesis : proposal);
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200 });
  };
}

function draftInput(provider: ReasoningProvider, nowMs: number) {
  return {
    provider,
    context: contextFor(),
    store: new InMemoryResearchStore(),
    bars: risingBars(40),
    dataset: "provider-contract",
    dataSource: "MOCK_FIXTURE" as const,
    contextTimestamp: "2026-01-01T14:30:00.000Z",
    contextDataVersion: "mock:NVDA:0",
    initialCapital: parseDecimal("10000"),
    nowMs,
    userId: ids.userId,
    agentId: ids.agentId,
  };
}

async function payloads() {
  const mock = new MockReasoningProvider();
  const context = contextFor();
  const thesis = await mock.generateThesis(context);
  const proposal = await mock.generateStrategyProposal(context, { hypothesis: { testWindowBars: 4 } } as ResearchThesis);
  if (!thesis.ok || !proposal.ok) {
    throw new Error("The mock provider did not return a draft.");
  }
  return { thesis: { ...(thesis.value as object), userId: "user_b" }, proposal: proposal.value };
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

function risingBars(count: number) {
  let close = parseDecimal("100");
  const bars = [];
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
    bars.push({ candle, session: "CLOSED" as const, referenceDeviationBps: null });
  }
  return bars;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return [path];
  });
}
