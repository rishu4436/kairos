import type { ExternalConfirmation, ExternalConflict, ExternalSignalFreshness } from "@/domain/arbitration";
import type { ExternalSignal, SecurityEvent, TokenSecurityAssessment } from "@/skills/types";

export interface IntelligenceFact {
  source: string;
  timestamp: string | null;
  freshness: ExternalSignalFreshness | "UNKNOWN";
  status: string;
  detail: string | null;
}

export interface BinanceIntelligenceView {
  smartMoney: IntelligenceFact & { walletCount: number | null };
  tokenSecurity: IntelligenceFact;
  tokenizedSecurityStatus: IntelligenceFact & { limitation: "ONDO_ONLY" | null };
  corporateAction: IntelligenceFact;
  alignment: "CONFIRMING_EVIDENCE" | "CONFLICTING_EVIDENCE" | "NO_EXTERNAL_SIGNAL" | "STALE" | "SKILL_ERROR";
}

export function emptyBinanceIntelligence(): BinanceIntelligenceView {
  return {
    smartMoney: {
      source: "binance-trading-signal",
      timestamp: null,
      freshness: "UNKNOWN",
      status: "NOT AVAILABLE",
      detail: null,
      walletCount: null,
    },
    tokenSecurity: {
      source: "query-token-audit",
      timestamp: null,
      freshness: "UNKNOWN",
      status: "NOT AVAILABLE",
      detail: null,
    },
    tokenizedSecurityStatus: {
      source: "binance-tokenized-securities-info",
      timestamp: null,
      freshness: "UNKNOWN",
      status: "NOT AVAILABLE",
      detail: "CAPABILITY_LIMITATION: ONDO_ONLY",
      limitation: "ONDO_ONLY",
    },
    corporateAction: {
      source: "binance-tokenized-securities-info",
      timestamp: null,
      freshness: "UNKNOWN",
      status: "NOT AVAILABLE",
      detail: null,
    },
    alignment: "NO_EXTERNAL_SIGNAL",
  };
}

function newestSignal(signals: readonly ExternalSignal[]): ExternalSignal | null {
  return [...signals].sort((left, right) => (right.triggerTime ?? "").localeCompare(left.triggerTime ?? ""))[0] ?? null;
}

export function buildBinanceIntelligenceView(input: {
  signals: readonly ExternalSignal[];
  skillError: string | null;
  security: TokenSecurityAssessment | null;
  securityEvents: readonly SecurityEvent[];
  confirmation: ExternalConfirmation;
  conflict: ExternalConflict;
}): BinanceIntelligenceView {
  const view = emptyBinanceIntelligence();
  const signal = newestSignal(input.signals);
  if (input.skillError) {
    view.smartMoney = {
      ...view.smartMoney,
      status: "SKILL_ERROR",
      detail: input.skillError,
      timestamp: signal?.observedAt ?? null,
      freshness: signal?.freshness ?? "UNKNOWN",
      walletCount: signal?.smartMoneyCount ?? null,
    };
    view.alignment = "SKILL_ERROR";
  } else if (signal) {
    view.smartMoney = {
      source: signal.provider,
      timestamp: signal.triggerTime ?? signal.observedAt,
      freshness: signal.freshness,
      status: signal.direction ?? signal.status ?? "NOT AVAILABLE",
      detail: signal.freshness === "FRESH" ? null : "This signal is not treated as current.",
      walletCount: signal.smartMoneyCount,
    };
  }
  if (input.security) {
    const authoritative = input.security.available && input.security.supported;
    view.tokenSecurity = {
      source: input.security.source,
      timestamp: input.security.checkedAt,
      freshness: input.security.checkedAt ? "FRESH" : "UNKNOWN",
      status: authoritative ? (input.security.riskLevelEnum ?? "NOT AVAILABLE") : "SECURITY_AUDIT_UNAVAILABLE",
      detail: authoritative && input.security.riskLevelEnum === "LOW" ? "Proceed with caution. This is not a guarantee." : null,
    };
  }
  const event = input.securityEvents[input.securityEvents.length - 1] ?? null;
  if (event) {
    view.corporateAction = {
      source: event.source,
      timestamp: event.effectiveTime,
      freshness: event.effectiveTime ? "FRESH" : "UNKNOWN",
      status: event.eventType ?? event.status ?? "NOT AVAILABLE",
      detail: event.status,
    };
    view.tokenizedSecurityStatus = {
      ...view.tokenizedSecurityStatus,
      timestamp: event.effectiveTime,
      freshness: event.effectiveTime ? "FRESH" : "UNKNOWN",
      status: event.status ?? "NOT AVAILABLE",
    };
  }
  if (!input.skillError) {
    if (input.conflict === "CONFLICTING_EVIDENCE") {
      view.alignment = "CONFLICTING_EVIDENCE";
    } else if (input.confirmation === "CONFIRMING_EVIDENCE") {
      view.alignment = "CONFIRMING_EVIDENCE";
    } else if (input.confirmation === "STALE") {
      view.alignment = "STALE";
    } else {
      view.alignment = "NO_EXTERNAL_SIGNAL";
    }
  }
  return view;
}
