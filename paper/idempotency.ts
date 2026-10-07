import type { PaperExecution } from "@/paper/execute";

/**
 * At-least-once invocation, idempotent effect.
 * A completed intent id returns the first execution and does not fill again.
 */
const fills = new Map<string, { executionId: string; execution: PaperExecution | null }>();

export function resetPaperIdempotency(): void {
  fills.clear();
}

export function priorPaperFill(intentId: string): { executionId: string } | null {
  const prior = fills.get(intentId);
  return prior ? { executionId: prior.executionId } : null;
}

export function rememberPaperFill(intentId: string, executionId: string, execution: PaperExecution | null = null): void {
  if (!fills.has(intentId)) {
    fills.set(intentId, { executionId, execution });
  }
}

export function completedPaperFills(): readonly { intentId: string; executionId: string }[] {
  return [...fills.entries()].map(([intentId, value]) => ({ intentId, executionId: value.executionId }));
}

export function restorePaperFills(rows: readonly { intentId: string; executionId: string }[]): void {
  for (const row of rows) {
    rememberPaperFill(row.intentId, row.executionId);
  }
}

/** Applies a ledger mutation once per intent id. */
export function applyPaperFillOnce(intentId: string, executionId: string, mutate: () => void): { repeated: boolean; executionId: string } {
  const prior = priorPaperFill(intentId);
  if (prior) {
    return { repeated: true, executionId: prior.executionId };
  }
  mutate();
  rememberPaperFill(intentId, executionId);
  return { repeated: false, executionId };
}
