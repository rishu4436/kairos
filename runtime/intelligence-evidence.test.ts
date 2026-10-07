import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { RecordedIntelligenceEvidence } from "@/components/command/recorded-intelligence";
import { readinessLabels } from "@/runtime/readiness";
import { noteLiveSuccess, resetLastSuccess } from "@/observation/health-memory";
import { recordLlmAttempt, resetLlmAttempt } from "@/research/llm-status";
import { writeIntelligenceEvidence } from "@/runtime/intelligence-evidence";

afterEach(() => { resetLastSuccess(); resetLlmAttempt(); });

describe("truthful provider evidence", () => {
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
  it("labels replay as recorded evidence and does not represent prices as wallet equity", () => {
    const html = renderToStaticMarkup(createElement(RecordedIntelligenceEvidence));
    expect(html).toContain("Recorded real provider evidence");
    expect(html).toContain("BINANCE · RECORDED REAL RESPONSE");
    expect(html).toContain("This replay does not refresh provider data");
    expect(html).toContain("NOT CONNECTED · BLOCKED");
    expect(html).not.toContain("BINANCE · LIVE");
    expect(html).not.toContain("Bearer");
  });
  it("rejects a credential-bearing recording before writing a file", () => {
    expect(() => writeIntelligenceEvidence("must-not-write", { auth: "Bearer forbidden" })).toThrow("EVIDENCE_REDACTION_FAILED");
    expect(() => writeIntelligenceEvidence("must-not-write", { endpoint: "rediss://private" })).toThrow("EVIDENCE_REDACTION_FAILED");
  });
});
