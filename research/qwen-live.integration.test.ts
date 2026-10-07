import { describe, expect, it } from "vitest";
import { readLlmConfig } from "@/research/llm-config";
import { QwenReasoningProvider } from "@/research/qwen";
import { researchProviderFixture, validateProviderThesis } from "@/test/research-provider";

const enabled = process.env.KAIROS_LLM_LIVE_TEST === "1" && process.env.KAIROS_LLM_PROVIDER === "qwen" && Boolean(process.env.KAIROS_LLM_API_KEY) && Boolean(process.env.KAIROS_QWEN_BASE_URL);

describe.skipIf(!enabled)("credentialed Qwen structured research", () => {
  it("validates one bounded thesis without tools or file output", async () => {
    const config = readLlmConfig();
    const context = researchProviderFixture();
    let requests = 0;
    const provider = new QwenReasoningProvider(config, async (endpoint, init) => {
      if (++requests !== 1) throw new Error("ONE_REQUEST_LIMIT");
      expect(JSON.parse(String(init.body)).tools).toBeUndefined();
      return fetch(endpoint, init);
    }, 1);
    const result = await provider.generateThesis(context);
    const validation = validateProviderThesis(result, context);
    expect(requests).toBe(1);
    expect(result.provider).toBe("qwen");
    expect(result.model).toBe(config.model);
    expect(result.ok).toBe(true);
    expect(validation.schemaValid).toBe(true);
    expect(validation.reasons).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  }, 150_000);
});
