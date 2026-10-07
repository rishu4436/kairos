import type {
  ArbitrationExternalSignal,
  ArbitrationSecurityInput,
  ExternalAbsence,
  ExternalConfirmation,
  ExternalConflict,
  ExternalSignalFreshness,
  SecurityGate,
} from "@/domain/arbitration";
import { assessSecurityGate } from "@/skills/security";
import { evaluateSmartMoneyConfirmation } from "@/skills/signal";

export interface ExternalPolicy {
  externalConfirmation: ExternalConfirmation;
  externalConflict: ExternalConflict;
  securityGate: SecurityGate;
  externalFreshness: ExternalSignalFreshness | "NONE";
}

const RANK: Record<ExternalSignalFreshness, number> = {
  FRESH: 0,
  AGING: 1,
  STALE: 2,
  EXPIRED: 3,
  UNKNOWN: 4,
};

/** Policy fields only. Scores are not an input and are not an output. */
export function assessExternalPolicy(input: {
  internalAction: "BUY" | "SELL" | "HOLD" | "NO_SIGNAL" | null;
  signals?: readonly ArbitrationExternalSignal[];
  security?: ArbitrationSecurityInput | null;
  /** Provider failure. It is not evidence that no signal exists. */
  absence?: ExternalAbsence | null;
}): ExternalPolicy {
  const signals = input.signals ?? [];
  const relevant = signals.filter((signal) => signal.mapStatus === "MAPPED" && signal.source === "SMART_MONEY");
  const fresh = relevant.filter((signal) => signal.freshness === "FRESH");
  const outcome = evaluateSmartMoneyConfirmation(input.internalAction, relevant);
  const newest = [...relevant].sort((left, right) => RANK[left.freshness] - RANK[right.freshness])[0];
  let externalConfirmation: ExternalConfirmation = "NO_SIGNAL";
  if (signals.length === 0 && input.absence) {
    externalConfirmation = input.absence;
  } else if (fresh.length === 0 && relevant.length > 0) {
    externalConfirmation = "STALE";
  } else if (outcome === "CONFIRMING_EVIDENCE") {
    externalConfirmation = "CONFIRMING_EVIDENCE";
  }
  return {
    externalConfirmation,
    externalConflict: outcome === "CONFLICTING_EVIDENCE" && fresh.length > 0 ? "CONFLICTING_EVIDENCE" : "NONE",
    securityGate: assessSecurityGate(input.security ?? null),
    externalFreshness: fresh.length > 0 ? "FRESH" : (newest?.freshness ?? "NONE"),
  };
}
