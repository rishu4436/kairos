import { describe, expect, it } from "vitest";
import { readLlmConfig } from "@/research/llm-config";
import { parseThesisDraft } from "@/research/parse";
import { QwenReasoningProvider } from "@/research/qwen";
import { unavailableResearchBoundaries } from "@/research/types";

const enabled = process.env.KAIROS_LLM_LIVE_TEST === "1"
  && process.env.KAIROS_LLM_PROVIDER === "qwen"
  && Boolean(process.env.KAIROS_LLM_API_KEY)
  && Boolean(process.env.KAIROS_QWEN_BASE_URL);

describe("credentialed Qwen research call", () => {
  it.skipIf(!enabled)("receives one structured thesis from Qwen", async () => {
    const config = readLlmConfig();
    const provider = new QwenReasoningProvider(config);
    const started = Date.now();
    const result = await provider.generateThesis({
      userId: "user_demo",
      agentId: "agent_demo",
      assetId: "paper:NVDA",
      ticker: "NVDA",
      watchlist: ["NVDA"],
      observation: { price: null, session: "UNKNOWN", regime: "UNKNOWN", freshness: null },
      features: [{ id: "return_1h", value: null, bps: null }],
      signals: [],
      arbitration: null,
      paperPerformance: null,
      priorExperiments: [],
      contextId: null,
      ...unavailableResearchBoundaries(),
    });
    expect(result.provider).toBe("qwen");
    expect(result.model).toBe(config.model);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(result.latencyMs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(parseThesisDraft(result.value).ok).toBe(true);
    }
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });
});
