import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { KAIROSContext } from "@/context/types";
import type { ObservationRow } from "@/domain/observation";
import { asAgentId, asUserId } from "@/domain/ids";
import { readLlmConfig } from "@/research/llm-config";
import { QwenReasoningProvider } from "@/research/qwen";
import { parseThesisDraft } from "@/research/parse";
import { validateEvidenceAgainstContext, validateThesis } from "@/research/validate";
import type { ResearchContext, ResearchThesis } from "@/research/types";
import { LazyRedisTransport } from "@/runtime/redis";
import { commitRecord, RedisKairosStateStore, stateKey } from "@/runtime/store";
import { writeIntelligenceEvidence } from "@/runtime/intelligence-evidence";

const enabled = process.env.QWEN_LIVE_TEST === "1";

describe.skipIf(!enabled)("one Qwen request on real persisted market context", () => {
  it("uses the existing provider and validates a bounded read-only thesis", async () => {
    // Deliberately prevents accidental reruns from spending a second research request.
    if (existsSync("docs/evidence/phase-17i-qwen.json")) throw new Error("QWEN_EVIDENCE_ALREADY_RECORDED; replay existing evidence");
    const market = JSON.parse(readFileSync("docs/evidence/phase-17i-market.json", "utf8")) as {
      redisKey: string; contextId: string; timestamp: string; history: { count: number }; research: ResearchContext;
    };
    const config = readLlmConfig();
    expect(config.provider).toBe("qwen");
    expect(config.configured).toBe(true);
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_REQUIRED");
    const transport = new LazyRedisTransport(url);
    try {
      const store = new RedisKairosStateStore(url, transport);
      const snapshot = store.get<{ context: KAIROSContext; row: ObservationRow; research: ResearchContext }>(market.redisKey)?.value;
      expect(snapshot).toBeDefined();
      if (!snapshot) throw new Error("REAL_CONTEXT_UNAVAILABLE");
      expect(snapshot.research).toEqual(market.research);
      expect(snapshot.research.contextId).toBe(market.contextId);
      expect(snapshot.research.newsContext.status).toBe("UNAVAILABLE");
      expect(snapshot.research.earningsContext.status).toBe("UNAVAILABLE");
      let attempts = 0;
      let httpStatus: number | null = null;
      let responseModel: string | null = null;
      const provider = new QwenReasoningProvider(config, async (endpoint, init) => {
        if (++attempts > 1) throw new Error("ONE_REQUEST_LIMIT");
        const request = JSON.parse(String(init.body));
        expect(request.tools).toBeUndefined();
        expect(request.enable_search).toBeUndefined();
        expect(request.response_format.json_schema.strict).toBe(true);
        const response = await fetch(endpoint, init);
        httpStatus = response.status;
        const body = await response.clone().json().catch(() => null);
        responseModel = typeof body?.model === "string" ? body.model : null;
        return response;
      });
      const result = await provider.generateThesis(snapshot.research);
      const parsed = result.ok ? parseThesisDraft(result.value) : null;
      let thesis: ResearchThesis | null = null;
      let reasons: string[] = [];
      if (parsed?.ok) {
        thesis = {
          ...parsed.draft, thesisId: `thesis_phase17i_${Date.now()}`,
          userId: asUserId(snapshot.context.userId), agentId: asAgentId(snapshot.context.agentId),
          assetId: snapshot.context.assetId, createdAt: result.startedAt, updatedAt: result.completedAt,
          status: "VALIDATING", version: "1", rejectionReasons: [],
          provenance: {
            sourceType: "LLM", provider: result.provider, model: result.model, promptVersion: result.promptVersion,
            createdAt: result.completedAt, contextTimestamp: market.timestamp,
            contextDataVersion: `LIVE_BINANCE_HISTORY:${snapshot.context.assetId}:${market.history.count}`,
            configuredModel: true, requestId: result.requestId, startedAt: result.startedAt,
            completedAt: result.completedAt, latencyMs: result.latencyMs, status: "SUCCESS", errorCategory: null,
          },
        };
        reasons = [...validateThesis(thesis).reasons, ...validateEvidenceAgainstContext(thesis, snapshot.research).reasons];
        // Reject instructions anywhere in the untrusted narrative, including assumptions.
        const narrative = JSON.stringify(parsed.draft);
        if (/\b(connect|unlock|fund)\s+(your |the )?wallet|\b(sign|broadcast|execute)\s+(a |the |this )?(transaction|trade|order)|\b(override|disable|bypass)\s+(the )?(risk|safety)|guaranteed\s+(profit|returns?)/i.test(narrative)) {
          reasons.push("Execution, wallet, risk override, or guaranteed-return instructions are prohibited.");
        }
        thesis = { ...thesis, status: reasons.length ? "INVALID" : "READY_FOR_EXPERIMENT", rejectionReasons: reasons };
      } else reasons = parsed && !parsed.ok ? parsed.reasons : [result.ok ? "SCHEMA_INVALID" : result.errorCategory];
      const evidence = {
        label: "RECORDED REAL PROVIDER EVIDENCE", contextId: market.contextId,
        requestedModel: config.model, responseModel, httpStatus, outboundRequests: Math.min(attempts, 1),
        result, schemaValid: parsed?.ok === true, semanticValidation: reasons.length === 0 ? "PASS" : "FAIL", reasons, thesis,
        proposal: null, proposalState: "NOT_REQUESTED; single thesis request; separate proposal call requires another request",
        experiment: null, experimentState: "NOT_RUN; no validated proposal returned by the thesis schema",
        promotion: "NO_LIVE_PROMOTION", tools: false, wallet: false,
      };
      writeIntelligenceEvidence("phase-17i-qwen", evidence);
      if (thesis) commitRecord(store, stateKey(["evidence", "phase17i", thesis.thesisId]), thesis, result.completedAt);
      console.log(JSON.stringify({ requestedModel: config.model, responseModel, httpStatus, latencyMs: result.latencyMs,
        promptVersion: result.promptVersion, providerResult: result.ok ? "SUCCESS" : result.errorCategory,
        schemaValid: evidence.schemaValid, semanticValidation: evidence.semanticValidation, reasons,
        thesisGenerated: thesis !== null, proposal: "NOT_REQUESTED", experiment: "NOT_RUN" }));
      expect(result.ok).toBe(true);
      expect(evidence.schemaValid).toBe(true);
      expect(reasons).toEqual([]);
    } finally { transport.close(); }
  }, 150_000);
});
