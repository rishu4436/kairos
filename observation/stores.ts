import { arbitrationMemory } from "@/arbitration/memory";
import { resetExecutionAuthority } from "@/domain/execution-authority";
import { InMemoryMarketHistory } from "@/domain/history";
import type { SignalView } from "@/domain/observation";
import { resetPaperIdempotency } from "@/paper/idempotency";
import { resetPaperBooks } from "@/paper/store";
import { resetDemoResearch } from "@/research/demo";
import { resetLlmAttempt } from "@/research/llm-status";
import { resetResearchStore } from "@/research/store";

const history = new InMemoryMarketHistory();
const evaluations: SignalView[] = [];
const fetchedAt = new Map<string, number>();
const failedAt = new Map<string, number>();

export const marketHistory = history;

export const signalLog = {
  record(signal: SignalView): void {
    evaluations.push(signal);
    if (evaluations.length > 200) {
      evaluations.splice(0, evaluations.length - 200);
    }
  },
  recent(limit: number): SignalView[] {
    return evaluations.slice(Math.max(0, evaluations.length - limit));
  },
  clear(): void {
    evaluations.length = 0;
  },
};

export function shouldFetchCandles(key: string, now: number, refreshMs: number, retryMs: number): boolean {
  const success = fetchedAt.get(key);
  if (success !== undefined && now - success < refreshMs) {
    return false;
  }
  const failure = failedAt.get(key);
  if (failure !== undefined && now - failure < retryMs) {
    return false;
  }
  return true;
}

export function markCandlesFetched(key: string, now: number): void {
  fetchedAt.set(key, now);
  failedAt.delete(key);
}

export function markCandlesFailed(key: string, now: number): void {
  failedAt.set(key, now);
}

export function resetMarketStores(): void {
  history.clear();
  arbitrationMemory.clear();
  evaluations.length = 0;
  fetchedAt.clear();
  failedAt.clear();
  resetPaperBooks();
  resetPaperIdempotency();
  resetExecutionAuthority();
  resetResearchStore();
  resetDemoResearch();
  resetLlmAttempt();
}
