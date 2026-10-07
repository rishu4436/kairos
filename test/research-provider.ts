import { asAgentId, asUserId } from "@/domain/ids";
import { parseThesisDraft } from "@/research/parse";
import type { ProviderResult } from "@/research/provider";
import { RESEARCH_THESIS_SCHEMA } from "@/research/schemas";
import { matchesResearchSchema } from "@/research/schema-validation";
import { unavailableResearchBoundaries, type ResearchContext, type ResearchThesis } from "@/research/types";
import { validateEvidenceAgainstContext, validateThesis } from "@/research/validate";

/** Bounded synthetic context for optional provider protocol tests. No recorded snapshots. */
export function researchProviderFixture(): ResearchContext {
  return {
    userId: "user_integration", agentId: "agent_integration", assetId: "paper:NVDA", ticker: "NVDA", watchlist: ["NVDA"],
    observation: { price: "100", session: "UNKNOWN", regime: "UNKNOWN", freshness: "SAMPLE" },
    features: [{ id: "return_1h", value: null, bps: null }], signals: [], arbitration: null,
    paperPerformance: null, priorExperiments: [], contextId: "integration-fixture",
    ...unavailableResearchBoundaries(),
  };
}

export function validateProviderThesis(result: ProviderResult, context: ResearchContext): { schemaValid: boolean; reasons: string[] } {
  if (!result.ok) return { schemaValid: false, reasons: [result.errorCategory] };
  const schemaValid = matchesResearchSchema(result.value, RESEARCH_THESIS_SCHEMA);
  const parsed = parseThesisDraft(result.value);
  if (!parsed.ok) return { schemaValid, reasons: parsed.reasons };
  const thesis: ResearchThesis = {
    ...parsed.draft, thesisId: "integration-thesis", userId: asUserId(context.userId), agentId: asAgentId(context.agentId),
    assetId: context.assetId, createdAt: result.startedAt, updatedAt: result.completedAt,
    status: "VALIDATING", version: "1", rejectionReasons: [],
    provenance: {
      sourceType: "LLM", provider: result.provider, model: result.model, promptVersion: result.promptVersion,
      contextId: context.contextId, contextTimestamp: result.startedAt, contextDataVersion: "SYNTHETIC_TEST_FIXTURE",
      createdAt: result.completedAt, configuredModel: true, requestId: result.requestId, startedAt: result.startedAt,
      completedAt: result.completedAt, latencyMs: result.latencyMs, status: "SUCCESS", errorCategory: null,
    },
  };
  return { schemaValid, reasons: [...validateThesis(thesis).reasons, ...validateEvidenceAgainstContext(thesis, context).reasons] };
}
