import type { PositionCycleSnapshot } from "@/context/types";
import { parseDecimal } from "@/domain/money";
import type { PositionMeta } from "@/paper/positions";
import type { PositionDecision } from "@/position/types";

/**
 * Process-local position memory.
 * The caller writes the result with the paper meta store.
 * A later store can replace this function without changing the decision.
 */
export function rememberDecision(
  meta: PositionMeta,
  decision: PositionDecision,
  snapshot: PositionCycleSnapshot,
  mark: string | null,
): PositionMeta {
  return {
    ...meta,
    lifecycle: decision.action === "BLOCKED" ? "BLOCKED" : "OPEN",
    updatedAt: decision.createdAt,
    lastDecision: decision.action,
    lastDecisionAt: decision.createdAt,
    thesisState: decision.currentThesisState,
    exitClass: decision.exitClass,
    alternateStrategyId: decision.alternateStrategyId ?? meta.alternateStrategyId,
    previousSnapshot: snapshot,
    highestMark: higherMark(meta.highestMark, mark),
    entryContextId: meta.entry?.entryContextId ?? meta.entryContextId,
    lastReasonCodes: decision.reasonCodes,
  };
}

export function higherMark(current: string | null, mark: string | null): string | null {
  const left = read(current);
  const right = read(mark);
  if (left === null) {
    return right === null ? current : mark;
  }
  if (right === null || right <= left) {
    return current;
  }
  return mark;
}

function read(value: string | null): bigint | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }
  try {
    return parseDecimal(value);
  } catch {
    return null;
  }
}
