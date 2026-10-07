import type { LlmConfig } from "@/research/llm-config";
import { recordLlmAttempt, type LlmAttempt } from "@/research/llm-status";
import { parseModelJson } from "@/research/parse";
import type { ProviderErrorCategory, ProviderResult, ReasoningProvider } from "@/research/provider";
import { RESEARCH_ANALYST_INSTRUCTIONS, RESEARCH_THESIS_SCHEMA, STRATEGY_PROPOSAL_SCHEMA } from "@/research/schemas";
import { STRATEGY_PROPOSAL_PROMPT_VERSION, THESIS_PROMPT_VERSION, type ResearchContext, type ResearchThesis } from "@/research/types";

const MAX_RESPONSE_CHARS = 64_000;
const RESPONSES_URL = "https://api.x.ai/v1/responses";
const SAFE_ERROR = "The research model did not respond.";

export interface LlmFetch {
  (input: string, init: RequestInit): Promise<Response>;
}

let requestSequence = 0;

/**
 * xAI Responses API adapter. No tools are sent.
 * The key is used only as the Authorization header.
 */
export class HttpReasoningProvider implements ReasoningProvider {
  readonly id: string;
  readonly model: string;
  readonly configured = true;

  constructor(
    private readonly config: LlmConfig,
    private readonly fetchImpl: LlmFetch = fetch,
  ) {
    this.id = config.provider;
    this.model = config.model;
  }

  generateThesis(context: ResearchContext): Promise<ProviderResult> {
    return this.complete(THESIS_PROMPT_VERSION, "research_thesis", RESEARCH_THESIS_SCHEMA, thesisPrompt(context));
  }

  generateStrategyProposal(context: ResearchContext, thesis: ResearchThesis): Promise<ProviderResult> {
    return this.complete(STRATEGY_PROPOSAL_PROMPT_VERSION, "strategy_proposal", STRATEGY_PROPOSAL_SCHEMA, proposalPrompt(context, thesis));
  }

  private async complete(
    promptVersion: string,
    schemaName: string,
    schema: object,
    prompt: string,
  ): Promise<ProviderResult> {
    if (this.config.provider !== "xai") {
      return failure(this.config, promptVersion, "The configured research provider is not connected.", 0, "llm_unconfigured", "PROVIDER");
    }
    const startedMs = Date.now();
    const requestId = `llm_${startedMs}_${requestSequence}`;
    requestSequence += 1;
    let attempt = 0;
    while (attempt < 2) {
      try {
        const response = await this.fetchImpl(RESPONSES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(responsesBody(this.config.model, schemaName, schema, prompt)),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        const text = await response.text();
        if (text.length > MAX_RESPONSE_CHARS) {
          return finish(this.config, promptVersion, requestId, startedMs, "ERROR", "HTTP", SAFE_ERROR);
        }
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) {
            attempt += 1;
            continue;
          }
          return finish(this.config, promptVersion, requestId, startedMs, "ERROR", "HTTP", SAFE_ERROR);
        }
        let body: unknown;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          return finish(this.config, promptVersion, requestId, startedMs, "ERROR", "PARSE", SAFE_ERROR);
        }
        const content = extractOutputText(body);
        if (content === null) {
          return finish(this.config, promptVersion, requestId, startedMs, "ERROR", "PARSE", SAFE_ERROR);
        }
        const parsed = parseModelJson(content);
        if (!parsed.ok) {
          return finish(this.config, promptVersion, requestId, startedMs, "ERROR", "PARSE", "The model response was not JSON.");
        }
        return finish(this.config, promptVersion, requestId, startedMs, "SUCCESS", null, null, parsed.value);
      } catch (error) {
        const timedOut = isTimeout(error);
        if (attempt === 0) {
          attempt += 1;
          continue;
        }
        return finish(
          this.config,
          promptVersion,
          requestId,
          startedMs,
          timedOut ? "TIMEOUT" : "ERROR",
          timedOut ? "TIMEOUT" : "HTTP",
          SAFE_ERROR,
        );
      }
    }
    return finish(this.config, promptVersion, requestId, startedMs, "ERROR", "HTTP", SAFE_ERROR);
  }
}

export function responsesBody(model: string, name: string, schema: object, prompt: string): Record<string, unknown> {
  return {
    model,
    store: false,
    max_output_tokens: 2000,
    input: [
      { role: "system", content: RESEARCH_ANALYST_INSTRUCTIONS },
      { role: "user", content: prompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name,
        schema,
        strict: true,
      },
    },
  };
}

export function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: string }).type !== "message") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      if ((part as { type?: string }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function finish(
  config: LlmConfig,
  promptVersion: string,
  requestId: string,
  startedMs: number,
  status: LlmAttempt["status"],
  errorCategory: LlmAttempt["errorCategory"],
  error: string | null,
  value?: unknown,
): ProviderResult {
  const completedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const completedAt = new Date(completedMs).toISOString();
  recordLlmAttempt({
    requestId,
    startedAt,
    completedAt,
    latencyMs: completedMs - startedMs,
    provider: config.provider,
    model: config.model,
    status,
    errorCategory,
  });
  if (status === "SUCCESS") {
    return {
      ok: true,
      value,
      latencyMs: completedMs - startedMs,
      requestId,
      provider: config.provider,
      model: config.model,
      promptVersion,
      startedAt,
      completedAt,
    };
  }
  return failure(config, promptVersion, error ?? SAFE_ERROR, completedMs - startedMs, requestId, errorCategory ?? "HTTP", startedAt, completedAt);
}

export function failure(
  config: LlmConfig,
  promptVersion: string,
  error: string,
  latencyMs = 0,
  requestId = "llm_failed",
  errorCategory: ProviderErrorCategory = "HTTP",
  startedAt = new Date().toISOString(),
  completedAt = startedAt,
): ProviderResult {
  const safe = config.apiKey.length > 0 ? error.split(config.apiKey).join("[redacted]") : error;
  return {
    ok: false,
    error: safe,
    errorCategory,
    latencyMs,
    requestId,
    provider: config.provider,
    model: config.model,
    promptVersion,
    startedAt,
    completedAt,
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function thesisPrompt(context: ResearchContext): string {
  return [`Prompt ${THESIS_PROMPT_VERSION}.`, "Write the thesis for this context only.", JSON.stringify(context)].join("\n");
}

function proposalPrompt(context: ResearchContext, thesis: ResearchThesis): string {
  return [
    `Prompt ${STRATEGY_PROPOSAL_PROMPT_VERSION}.`,
    "Write the strategy proposal for this thesis. Use only features present in the context.",
    JSON.stringify({
      ticker: context.ticker,
      features: context.features,
      hypothesis: thesis.hypothesis,
      invalidation: thesis.invalidationConditions,
      eventContext: context.eventContext,
      newsContext: context.newsContext,
    }),
  ].join("\n");
}
