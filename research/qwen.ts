import type { LlmConfig } from "@/research/llm-config";
import { recordLlmAttempt, type LlmAttempt } from "@/research/llm-status";
import type { ProviderErrorCategory, ProviderResult, ReasoningProvider } from "@/research/provider";
import { QWEN_RESEARCH_INSTRUCTIONS, QWEN_STRATEGY_PROMPT_VERSION, QWEN_THESIS_PROMPT_VERSION } from "@/research/qwen-prompt";
import { RESEARCH_THESIS_SCHEMA, STRATEGY_PROPOSAL_SCHEMA } from "@/research/schemas";
import type { ResearchContext, ResearchThesis } from "@/research/types";

const MAX_RESPONSE_CHARS = 64_000;

export interface QwenFetch {
  (input: string, init: RequestInit): Promise<Response>;
}

const SAFE_MESSAGE: Record<string, string> = {
  AUTHENTICATION_ERROR: "The research provider rejected the credentials.",
  RATE_LIMITED: "The research provider rate limit was reached.",
  INVALID_REQUEST: "The research provider rejected the request.",
  UPSTREAM_ERROR: "The research provider failed.",
  TIMEOUT: "The research model did not respond.",
  MALFORMED_RESPONSE: "The research provider returned an unreadable response.",
  STRUCTURED_OUTPUT_ERROR: "The research provider did not return the required schema.",
  MODEL_UNAVAILABLE: "The configured research model is not available.",
  UNKNOWN_ERROR: "The research provider failed.",
  NOT_CONFIGURED: "Qwen is not configured.",
};

/**
 * Qwen adapter. Chat Completions carries the documented JSON Schema mode.
 * No tools, web search, or code interpreter are sent.
 */
export class QwenReasoningProvider implements ReasoningProvider {
  readonly id = "qwen";
  readonly model: string;
  readonly configured = true;

  constructor(
    private readonly config: LlmConfig,
    private readonly fetchImpl: QwenFetch = fetch,
    private readonly maxAttempts: 1 | 2 = 2,
  ) {
    this.model = config.model;
  }

  generateThesis(context: ResearchContext): Promise<ProviderResult> {
    return this.complete(QWEN_THESIS_PROMPT_VERSION, "research_thesis", RESEARCH_THESIS_SCHEMA, thesisPrompt(context));
  }

  generateStrategyProposal(context: ResearchContext, thesis: ResearchThesis): Promise<ProviderResult> {
    return this.complete(QWEN_STRATEGY_PROMPT_VERSION, "strategy_proposal", STRATEGY_PROPOSAL_SCHEMA, proposalPrompt(context, thesis));
  }

  private async complete(promptVersion: string, schemaName: string, schema: object, prompt: string): Promise<ProviderResult> {
    if (this.config.provider !== "qwen" || this.config.qwenBaseUrl.length === 0 || this.config.apiKey.length === 0) {
      return this.fail(promptVersion, "NOT_CONFIGURED", 0, "qwen_unconfigured", Date.now());
    }
    const startedMs = Date.now();
    const requestId = `qwen_${startedMs}`;
    const url = qwenChatUrl(this.config.qwenBaseUrl);
    let attempt = 0;
    while (attempt < this.maxAttempts) {
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(qwenRequestBody(this.config.model, schemaName, schema, prompt)),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        const text = await response.text();
        if (text.length > MAX_RESPONSE_CHARS) {
          return this.fail(promptVersion, "MALFORMED_RESPONSE", Date.now() - startedMs, requestId, startedMs);
        }
        const statusCategory = httpCategory(response.status);
        if (statusCategory !== null) {
          if (statusCategory === "UPSTREAM_ERROR" && attempt + 1 < this.maxAttempts) {
            attempt += 1;
            continue;
          }
          return this.fail(promptVersion, statusCategory, Date.now() - startedMs, requestId, startedMs);
        }
        let body: unknown;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          return this.fail(promptVersion, "MALFORMED_RESPONSE", Date.now() - startedMs, requestId, startedMs);
        }
        const content = extractChatContent(body);
        if (content === null) {
          return this.fail(promptVersion, "MALFORMED_RESPONSE", Date.now() - startedMs, responseId(body) ?? requestId, startedMs);
        }
        let value: unknown;
        try {
          value = JSON.parse(content) as unknown;
        } catch {
          return this.fail(promptVersion, "STRUCTURED_OUTPUT_ERROR", Date.now() - startedMs, responseId(body) ?? requestId, startedMs);
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return this.fail(promptVersion, "STRUCTURED_OUTPUT_ERROR", Date.now() - startedMs, responseId(body) ?? requestId, startedMs);
        }
        return this.succeed(promptVersion, responseId(body) ?? requestId, startedMs, value);
      } catch (error) {
        const timedOut = isTimeout(error);
        if (attempt + 1 < this.maxAttempts) {
          attempt += 1;
          continue;
        }
        return this.fail(promptVersion, timedOut ? "TIMEOUT" : "UPSTREAM_ERROR", Date.now() - startedMs, requestId, startedMs);
      }
    }
    return this.fail(promptVersion, "UPSTREAM_ERROR", Date.now() - startedMs, requestId, startedMs);
  }

  private succeed(promptVersion: string, requestId: string, startedMs: number, value: unknown): ProviderResult {
    const completedMs = Date.now();
    this.record(requestId, startedMs, completedMs, "SUCCESS", null);
    return {
      ok: true,
      value,
      latencyMs: completedMs - startedMs,
      requestId,
      provider: "qwen",
      model: this.config.model,
      promptVersion,
      startedAt: new Date(startedMs).toISOString(),
      completedAt: new Date(completedMs).toISOString(),
    };
  }

  private fail(
    promptVersion: string,
    errorCategory: ProviderErrorCategory,
    latencyMs: number,
    requestId: string,
    startedMs: number,
  ): ProviderResult {
    const completedMs = startedMs + latencyMs;
    this.record(requestId, startedMs, completedMs, errorCategory === "TIMEOUT" ? "TIMEOUT" : "ERROR", errorCategory);
    const message = SAFE_MESSAGE[errorCategory] ?? SAFE_MESSAGE.UNKNOWN_ERROR;
    const safe = this.config.apiKey.length > 0 ? message.split(this.config.apiKey).join("[redacted]") : message;
    return {
      ok: false,
      error: safe,
      errorCategory,
      latencyMs,
      requestId,
      provider: "qwen",
      model: this.config.model,
      promptVersion,
      startedAt: new Date(startedMs).toISOString(),
      completedAt: new Date(completedMs).toISOString(),
    };
  }

  private record(
    requestId: string,
    startedMs: number,
    completedMs: number,
    status: LlmAttempt["status"],
    errorCategory: ProviderErrorCategory | null,
  ): void {
    recordLlmAttempt({
      requestId,
      startedAt: new Date(startedMs).toISOString(),
      completedAt: new Date(completedMs).toISOString(),
      latencyMs: completedMs - startedMs,
      provider: "qwen",
      model: this.config.model,
      status,
      errorCategory,
    });
  }
}

export function qwenChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export function qwenRequestBody(model: string, name: string, schema: object, prompt: string): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system", content: QWEN_RESEARCH_INSTRUCTIONS },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name,
        strict: true,
        schema,
      },
    },
  };
}

export function extractChatContent(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }
  return content;
}

function responseId(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function httpCategory(status: number): ProviderErrorCategory | null {
  if (status >= 200 && status < 300) {
    return null;
  }
  if (status === 401 || status === 403) {
    return "AUTHENTICATION_ERROR";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status === 404) {
    return "MODEL_UNAVAILABLE";
  }
  if (status === 400) {
    return "INVALID_REQUEST";
  }
  if (status >= 500) {
    return "UPSTREAM_ERROR";
  }
  return "UNKNOWN_ERROR";
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function thesisPrompt(context: ResearchContext): string {
  return [`Prompt ${QWEN_THESIS_PROMPT_VERSION}.`, "Write the thesis for this context only.", JSON.stringify(context)].join("\n");
}

function proposalPrompt(context: ResearchContext, thesis: ResearchThesis): string {
  return [
    `Prompt ${QWEN_STRATEGY_PROMPT_VERSION}.`,
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
