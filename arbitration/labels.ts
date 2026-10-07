import type { ArbitrationDecisionKind } from "@/domain/arbitration";

export function decisionLabel(decision: ArbitrationDecisionKind, strategyName: string | null): string {
  switch (decision) {
    case "SELECT_STRATEGY":
      return strategyName ? `SELECT ${strategyName.toUpperCase()}` : "SELECT STRATEGY";
    case "MULTI_STRATEGY_CONFIRMATION":
      return "MULTI-STRATEGY CONFIRMATION";
    case "CONFLICT":
      return "CONFLICT — WAIT";
    case "NO_OPPORTUNITY":
      return "NO OPPORTUNITY";
    case "DATA_BLOCKED":
      return "DATA BLOCKED";
    case "INSUFFICIENT_EVIDENCE":
      return "INSUFFICIENT EVIDENCE";
  }
}
