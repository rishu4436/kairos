import type { ResearchContext, ResearchThesis } from "@/research/types";

export interface ProviderSuccess {
  ok: true;
  value: unknown;
  latencyMs: number;
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  startedAt: string;
  completedAt: string;
}

export const PROVIDER_ERROR_CATEGORIES = [
  "TIMEOUT",
  "HTTP",
  "PARSE",
  "PROVIDER",
  "NOT_CONFIGURED",
  "AUTHENTICATION_ERROR",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "UPSTREAM_ERROR",
  "MALFORMED_RESPONSE",
  "STRUCTURED_OUTPUT_ERROR",
  "MODEL_UNAVAILABLE",
  "MODEL_PROVIDER_UNSUPPORTED",
  "UNKNOWN_ERROR",
] as const;

export type ProviderErrorCategory = (typeof PROVIDER_ERROR_CATEGORIES)[number];

export interface ProviderFailure {
  ok: false;
  error: string;
  errorCategory: ProviderErrorCategory;
  latencyMs: number;
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  startedAt: string;
  completedAt: string;
}

export type ProviderResult = ProviderSuccess | ProviderFailure;

/**
 * Untrusted reasoning component. It returns data. It cannot call tools,
 * read wallets, or change KAIROS state.
 */
export interface ReasoningProvider {
  readonly id: string;
  readonly model: string;
  readonly configured: boolean;
  generateThesis(context: ResearchContext): Promise<ProviderResult>;
  generateStrategyProposal(context: ResearchContext, thesis: ResearchThesis): Promise<ProviderResult>;
}
