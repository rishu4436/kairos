import type { LlmConfig } from "@/research/llm-config";
import { GeminiReasoningProvider } from "@/research/gemini";
import type { LlmFetch } from "@/research/llm-http";
import { HttpReasoningProvider } from "@/research/llm-http";
import { recordLlmAttempt } from "@/research/llm-status";
import { MockReasoningProvider } from "@/research/mock-provider";
import type { ProviderResult, ReasoningProvider } from "@/research/provider";
import { QwenReasoningProvider, type QwenFetch } from "@/research/qwen";
import { QWEN_THESIS_PROMPT_VERSION } from "@/research/qwen-prompt";
import type { ResearchContext, ResearchThesis } from "@/research/types";

/** Selects one adapter. An unknown name fails closed and does not call another provider. */
export function selectReasoningProvider(config: LlmConfig, fetchImpl?: LlmFetch): ReasoningProvider {
  if (config.provider === "gemini") return new GeminiReasoningProvider(config, fetchImpl);
  if (config.provider === "mock") {
    return new MockReasoningProvider();
  }
  if (config.provider === "xai") {
    return new HttpReasoningProvider(config, fetchImpl);
  }
  if (config.provider === "qwen") {
    return new QwenReasoningProvider(config, fetchImpl as QwenFetch | undefined);
  }
  return new UnsupportedReasoningProvider(config.provider, config.model);
}

class UnsupportedReasoningProvider implements ReasoningProvider {
  readonly configured = true;

  constructor(
    readonly id: string,
    readonly model: string,
  ) {}

  generateThesis(context: ResearchContext): Promise<ProviderResult> {
    void context;
    return Promise.resolve(unsupported(this.id, this.model));
  }

  generateStrategyProposal(context: ResearchContext, thesis: ResearchThesis): Promise<ProviderResult> {
    void context;
    void thesis;
    return Promise.resolve(unsupported(this.id, this.model));
  }
}

function unsupported(provider: string, model: string): ProviderResult {
  const now = new Date().toISOString();
  recordLlmAttempt({
    requestId: "provider_unsupported",
    startedAt: now,
    completedAt: now,
    latencyMs: 0,
    provider,
    model,
    status: "ERROR",
    errorCategory: "MODEL_PROVIDER_UNSUPPORTED",
  });
  return {
    ok: false,
    error: "MODEL_PROVIDER_UNSUPPORTED",
    errorCategory: "MODEL_PROVIDER_UNSUPPORTED",
    latencyMs: 0,
    requestId: "provider_unsupported",
    provider,
    model,
    promptVersion: QWEN_THESIS_PROMPT_VERSION,
    startedAt: now,
    completedAt: now,
  };
}
