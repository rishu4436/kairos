import { describe, expect, it } from "vitest";
import { readLlmConfig } from "@/research/llm-config";
import { HttpReasoningProvider } from "@/research/llm-http";
import { unavailableResearchBoundaries } from "@/research/types";

const enabled = process.env.KAIROS_LLM_LIVE_TEST === "1" && Boolean(process.env.KAIROS_LLM_API_KEY);

describe("credentialed xAI research call", () => {
  it.skipIf(!enabled)("receives a structured thesis from the Responses API", async () => {
    const config = readLlmConfig();
    const provider = new HttpReasoningProvider(config);
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
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("xai");
  });
});
