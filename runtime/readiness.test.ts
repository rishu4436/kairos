import { afterEach, describe, expect, it } from "vitest";
import { readinessLabels } from "@/runtime/readiness";
import { noteLiveSuccess, resetLastSuccess } from "@/observation/health-memory";
import { recordLlmAttempt, resetLlmAttempt } from "@/research/llm-status";
afterEach(() => { resetLastSuccess(); resetLlmAttempt(); });
describe("runtime configuration and connectivity", () => {
  it("keeps configured credentials distinct from an observed provider response", () => {
    const env = { NODE_ENV: "test" as const, KAIROS_STATE_BACKEND: "memory", BINANCE_WEB3_API_KEY: "test", BINANCE_WEB3_SECRET_KEY: "test",
      KAIROS_LLM_PROVIDER: "qwen", KAIROS_LLM_API_KEY: "test", KAIROS_QWEN_BASE_URL: "https://example.invalid/v1", FMP_API_KEY: "" };
    expect(readinessLabels(env).binanceData).toBe("CONFIGURED · NOT VERIFIED");
    expect(readinessLabels(env).qwen).toBe("CONFIGURED · NOT VERIFIED");
    noteLiveSuccess("2026-10-07T07:52:48.058Z");
    expect(readinessLabels(env).binanceData).toBe("BINANCE · LIVE");
    recordLlmAttempt({ provider: "qwen", model: "qwen3.8-max", requestId: "test", startedAt: "test", completedAt: "test", latencyMs: 1,
      status: "ERROR", errorCategory: "AUTHENTICATION_ERROR" });
    expect(readinessLabels(env).qwen).toBe("QWEN · ERROR");
    recordLlmAttempt({ provider: "qwen", model: "qwen3.8-max", requestId: "test", startedAt: "test", completedAt: "test", latencyMs: 1,
      status: "SUCCESS", errorCategory: null });
    expect(readinessLabels(env).qwen).toBe("QWEN · CONNECTED");
    expect(readinessLabels({ ...env, KAIROS_LLM_MODEL: "different-model" }).qwen).toBe("CONFIGURED · NOT VERIFIED");
    expect(readinessLabels(env).fmp).toBe("NOT CONFIGURED");
    expect(readinessLabels(env).liveExecution).toBe("BLOCKED");
  });
});
