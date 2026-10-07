import type { ProviderErrorCategory } from "@/research/provider";

export interface LlmAttempt {
  requestId: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  provider: string;
  model: string;
  status: "SUCCESS" | "ERROR" | "TIMEOUT";
  errorCategory: ProviderErrorCategory | null;
}

const ATTEMPT_KEY = "__kairosLlmAttempt";

type AttemptHost = typeof globalThis & { [ATTEMPT_KEY]?: LlmAttempt | null };

/** Shared across the page bundle and the research route. */
function attemptHost(): AttemptHost {
  return globalThis as AttemptHost;
}

export function recordLlmAttempt(attempt: LlmAttempt): void {
  attemptHost()[ATTEMPT_KEY] = attempt;
}

export function readLlmAttempt(): LlmAttempt | null {
  return attemptHost()[ATTEMPT_KEY] ?? null;
}

export function resetLlmAttempt(): void {
  attemptHost()[ATTEMPT_KEY] = null;
}
