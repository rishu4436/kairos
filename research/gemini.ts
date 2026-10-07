import type { LlmConfig } from "@/research/llm-config";
import type { LlmFetch } from "@/research/llm-http";
import { recordLlmAttempt } from "@/research/llm-status";
import type { ProviderErrorCategory, ProviderResult, ReasoningProvider } from "@/research/provider";
import { RESEARCH_ANALYST_INSTRUCTIONS, RESEARCH_THESIS_SCHEMA, STRATEGY_PROPOSAL_SCHEMA } from "@/research/schemas";
import { matchesResearchSchema } from "@/research/schema-validation";
import { THESIS_PROMPT_VERSION, STRATEGY_PROPOSAL_PROMPT_VERSION, type ResearchContext, type ResearchThesis } from "@/research/types";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** One stateless Interactions POST per operation. No tools, grounding, retry or failover. */
export class GeminiReasoningProvider implements ReasoningProvider {
  readonly id = "gemini";
  readonly model: string;
  readonly configured: boolean;

  constructor(private readonly config: LlmConfig, private readonly fetchImpl: LlmFetch = fetch) {
    this.model = config.model;
    this.configured = config.provider === this.id && config.apiKey.length > 0;
  }

  generateThesis(context: ResearchContext): Promise<ProviderResult> {
    return this.complete(THESIS_PROMPT_VERSION, RESEARCH_THESIS_SCHEMA, `Write a falsifiable research thesis for this bounded context only.\n${JSON.stringify(context)}`);
  }

  generateStrategyProposal(context: ResearchContext, thesis: ResearchThesis): Promise<ProviderResult> {
    return this.complete(STRATEGY_PROPOSAL_PROMPT_VERSION, STRATEGY_PROPOSAL_SCHEMA, `Write a declarative strategy proposal using only context features.\n${JSON.stringify({ context, hypothesis: thesis.hypothesis, invalidationConditions: thesis.invalidationConditions })}`);
  }

  private async complete(promptVersion: string, schema: typeof RESEARCH_THESIS_SCHEMA | typeof STRATEGY_PROPOSAL_SCHEMA, input: string): Promise<ProviderResult> {
    const startedMs = Date.now();
    const requestId = `gemini_${startedMs}`;
    const finish = (value: unknown, errorCategory: ProviderErrorCategory | null): ProviderResult => {
      const completedMs = Date.now();
      const metadata = {
        provider: this.id, model: this.model, promptVersion,
        requestId, startedAt: new Date(startedMs).toISOString(), completedAt: new Date(completedMs).toISOString(), latencyMs: completedMs - startedMs,
      };
      recordLlmAttempt({ ...metadata, status: errorCategory === null ? "SUCCESS" : errorCategory === "TIMEOUT" ? "TIMEOUT" : "ERROR", errorCategory });
      return errorCategory === null
        ? { ...metadata, ok: true, value }
        : { ...metadata, ok: false, errorCategory, error: `Gemini research request failed (${errorCategory}).` };
    };
    if (!this.configured) return finish(null, "NOT_CONFIGURED");
    try {
      const response = await this.fetchImpl(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.config.apiKey },
        body: JSON.stringify(geminiRequestBody(this.model, schema, input)),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok) return finish(null, httpCategory(response.status));
      const text = await response.text();
      if (text.length > 64_000) return finish(null, "MALFORMED_RESPONSE");
      let body: unknown;
      try { body = JSON.parse(text); } catch { return finish(null, "MALFORMED_RESPONSE"); }
      const content = extractGeminiContent(body);
      if (content === null) return finish(null, "MALFORMED_RESPONSE");
      let value: unknown;
      try { value = JSON.parse(content); } catch { return finish(null, "STRUCTURED_OUTPUT_ERROR"); }
      if (!matchesResearchSchema(value, schema)) return finish(null, "STRUCTURED_OUTPUT_ERROR");
      return finish(value, null);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return finish(null, timedOut ? "TIMEOUT" : "UPSTREAM_ERROR");
    }
  }
}

export function geminiRequestBody(model: string, schema: object, input: string): Record<string, unknown> {
  return {
    model, input,
    system_instruction: `${RESEARCH_ANALYST_INSTRUCTIONS} No wallet instructions, transaction signing, execution instructions, or risk overrides.`,
    response_format: { type: "text", mime_type: "application/json", schema },
    store: false, stream: false, background: false,
    generation_config: { max_output_tokens: 4096 },
  };
}

/** REST Interactions responses use model_output steps; SDK output_text is not a REST field. */
export function extractGeminiContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const response = body as { status?: unknown; steps?: unknown };
  if (response.status !== "completed" || !Array.isArray(response.steps)) return null;
  const texts: string[] = [];
  for (const step of response.steps) {
    if (!step || typeof step !== "object") return null;
    if (step.type !== "model_output") return null;
    if (!Array.isArray(step.content)) return null;
    for (const part of step.content) {
      if (part?.type === "text" && typeof part.text === "string") texts.push(part.text);
      else if (part?.type !== "thought") return null;
    }
  }
  return texts.length > 0 ? texts.join("") : null;
}

function httpCategory(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) return "AUTHENTICATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 404) return "MODEL_UNAVAILABLE";
  if (status === 400) return "INVALID_REQUEST";
  return "UPSTREAM_ERROR";
}
