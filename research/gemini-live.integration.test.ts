import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asAgentId, asUserId } from "@/domain/ids";
import { GeminiReasoningProvider } from "@/research/gemini";
import { readLlmConfig } from "@/research/llm-config";
import { parseThesisDraft } from "@/research/parse";
import type { ResearchContext, ResearchThesis } from "@/research/types";
import { validateEvidenceAgainstContext, validateThesis } from "@/research/validate";
import { writeIntelligenceEvidence } from "@/runtime/intelligence-evidence";
import { LazyRedisTransport } from "@/runtime/redis";
import { RedisKairosStateStore } from "@/runtime/store";

const enabled = process.env.GEMINI_LIVE_TEST === "1"
  && process.env.KAIROS_LLM_PROVIDER === "gemini"
  && Boolean(process.env.KAIROS_LLM_API_KEY?.trim());

describe.skipIf(!enabled)("one credentialed Gemini request on recorded Binance evidence", () => {
  it("validates a thesis without requesting a second operation", async () => {
    if (existsSync("docs/evidence/gemini.json")) throw new Error("GEMINI_EVIDENCE_ALREADY_RECORDED; replay evidence instead");
    const market = JSON.parse(readFileSync("docs/evidence/phase-17i-market.json", "utf8")) as {
      redisKey: string; contextId: string; timestamp: string; research: ResearchContext;
    };
    let context = market.research;
    let contextSource = "RECORDED_BINANCE_FILE";
    let transport: LazyRedisTransport | null = null;
    try {
      // Recorded research evidence, not a fresh observation or trading decision.
      if (process.env.KAIROS_STATE_BACKEND === "redis" && process.env.REDIS_URL) {
        transport = new LazyRedisTransport(process.env.REDIS_URL);
        const stored = new RedisKairosStateStore(process.env.REDIS_URL, transport).get<{ research: ResearchContext }>(market.redisKey)?.value;
        if (stored) {
          expect(stored.research).toEqual(market.research);
          context = stored.research;
          contextSource = "RECORDED_BINANCE_REDIS";
        }
      }
      expect(context.contextId).toBe(market.contextId);
      const config = readLlmConfig();
      let requests = 0;
      let httpStatus: number | null = null;
      const provider = new GeminiReasoningProvider(config, async (endpoint, init) => {
        if (++requests !== 1) throw new Error("ONE_REQUEST_LIMIT");
        expect(JSON.parse(String(init.body)).tools).toBeUndefined();
        const response = await fetch(endpoint, init);
        httpStatus = response.status;
        return response;
      });
      const result = await provider.generateThesis(context);
      const parsed = result.ok ? parseThesisDraft(result.value) : null;
      let thesis: ResearchThesis | null = null;
      let reasons: string[];
      if (parsed?.ok) {
        thesis = {
          ...parsed.draft, thesisId: `thesis_gemini_${Date.now()}`, userId: asUserId(context.userId), agentId: asAgentId(context.agentId),
          assetId: context.assetId, createdAt: result.startedAt, updatedAt: result.completedAt,
          status: "VALIDATING", version: "1", rejectionReasons: [],
          provenance: {
            sourceType: "LLM", provider: result.provider, model: result.model, promptVersion: result.promptVersion,
            contextId: market.contextId, contextTimestamp: market.timestamp, contextDataVersion: market.contextId,
            createdAt: result.completedAt, configuredModel: true, requestId: result.requestId,
            startedAt: result.startedAt, completedAt: result.completedAt, latencyMs: result.latencyMs, status: "SUCCESS", errorCategory: null,
          },
        };
        reasons = [...validateThesis(thesis).reasons, ...validateEvidenceAgainstContext(thesis, context).reasons];
        thesis = { ...thesis, status: reasons.length ? "INVALID" : "READY_FOR_EXPERIMENT", rejectionReasons: reasons };
      } else reasons = parsed && !parsed.ok ? parsed.reasons : [result.ok ? "SCHEMA_INVALID" : result.errorCategory];
      const evidence = {
        label: "RECORDED REAL PROVIDER EVIDENCE", provider: "gemini", model: config.model,
        contextSource, contextId: market.contextId, dataTimestamp: market.timestamp,
        requestTimestamp: result.startedAt, httpStatus, outboundRequests: requests, latencyMs: result.latencyMs,
        result, schemaValid: parsed?.ok === true, semanticValidation: reasons.length ? "FAIL" : "PASS", reasons, thesis,
        proposal: null, proposalState: "NOT_REQUESTED; separate proposal needs a second request",
        experiment: null, experimentState: "NOT_RUN; no proposal requested",
        tools: false, wallet: false, execution: false, riskOverride: false, livePromotion: false,
      };
      writeIntelligenceEvidence("gemini", evidence);
      // Print only bounded status fields, never untrusted model output or credentials.
      console.log(JSON.stringify({ provider: "gemini", model: config.model, httpStatus, requests, latencyMs: result.latencyMs, schemaValid: evidence.schemaValid, semanticValidation: evidence.semanticValidation }));
      expect(requests).toBe(1);
      expect(result.ok).toBe(true);
      expect(evidence.schemaValid).toBe(true);
      expect(reasons.length).toBe(0);
    } finally { transport?.close(); }
  }, 150_000);
});
