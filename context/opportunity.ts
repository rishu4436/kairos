import type { KAIROSContext, OpportunityAssessment, StrategySignalReading } from "@/context/types";

/**
 * Evidence maturity. This is not a trade signal and it does not change a strategy score.
 * Live unknown security blocks the opportunity. Paper may continue and is labeled unverified.
 * A closed session does not block a qualified signal.
 */
export function assessOpportunity(input: {
  nowMs: number;
  marketBlocked: boolean;
  securityLabel: "PASS" | "BLOCK" | "UNKNOWN" | "UNAVAILABLE" | null;
  signals: readonly StrategySignalReading[];
  externalFreshness: string;
  healthInsufficient: boolean;
  fidelity?: "live" | "paper";
  position?: { state: string; lastDecision: string | null; quantity: string | null } | null;
  tradingRestriction?: boolean;
  eventWindow?: string | null;
}): OpportunityAssessment {
  if (input.marketBlocked) {
    return { state: "BLOCKED", reason: "Market data is stale or unavailable." };
  }
  if (input.securityLabel === "BLOCK") {
    return { state: "BLOCKED", reason: "Token security blocked the opportunity." };
  }
  if (input.tradingRestriction) {
    return { state: "BLOCKED", reason: "Tokenized-security trading restriction is active. This is not an order." };
  }
  const fidelity = input.fidelity ?? "live";
  const unverified = input.securityLabel !== "PASS";
  if (positionOpen(input.position) && fidelity === "live" && unverified) {
    return { state: "BLOCKED", reason: "LIVE_SECURITY_UNKNOWN. Security state is unknown." };
  }
  if (positionOpen(input.position)) {
    const managed = managementOpportunity(input.position);
    if (fidelity === "paper" && unverified) {
      return { state: managed.state, reason: `${managed.reason} PAPER_ONLY. SECURITY_UNVERIFIED.` };
    }
    return managed;
  }
  if (unverified && fidelity !== "paper") {
    return { state: "BLOCKED", reason: "Security state is unknown." };
  }
  const maturity = signalMaturity(input);
  const withEvent = noteEventWindow(maturity, input.eventWindow);
  if (unverified && fidelity === "paper") {
    return { state: withEvent.state, reason: `${withEvent.reason} PAPER_ONLY. SECURITY_UNVERIFIED.` };
  }
  return withEvent;
}

function noteEventWindow(assessment: OpportunityAssessment, window: string | null | undefined): OpportunityAssessment {
  if (assessment.state !== "QUALIFIED" || (window !== "PRE_EVENT" && window !== "EVENT_DAY" && window !== "POST_EVENT")) {
    return assessment;
  }
  return { state: assessment.state, reason: `${assessment.reason} Event window is ${window}. This is uncertainty, not a block.` };
}

export function opportunityFromContext(context: KAIROSContext): OpportunityAssessment {
  const reports = context.strategyHealth.value?.reports ?? [];
  const healthInsufficient = reports.length > 0 && reports.every((report) => report.sampleSize > 0 && report.status === "INSUFFICIENT_DATA");
  const position = context.positionContext.value;
  return assessOpportunity({
    nowMs: Date.parse(context.snapshotTimestamp),
    marketBlocked: context.quality === "BLOCKED" || context.market.status === "UNAVAILABLE" || context.market.status === "STALE" || context.market.freshness === "STALE",
    securityLabel: context.tokenSecurity.value?.label ?? "UNKNOWN",
    signals: context.strategySignals.value?.signals ?? [],
    externalFreshness: context.externalSignals.freshness,
    healthInsufficient,
    fidelity: context.market.value?.fidelity,
    position: position
      ? { state: position.state, lastDecision: position.lastDecision, quantity: position.quantity }
      : null,
    tradingRestriction: context.earningsContext.value?.eventRisk.corporateRestrictionActive === true,
    eventWindow: context.earningsContext.value?.window ?? null,
  });
}

function signalMaturity(input: {
  nowMs: number;
  signals: readonly StrategySignalReading[];
  externalFreshness: string;
  healthInsufficient: boolean;
}): OpportunityAssessment {
  const directional = input.signals.filter((signal) => signal.evaluation === "SIGNAL" && (signal.action === "BUY" || signal.action === "SELL"));
  if (directional.length > 0 && directional.every((signal) => expired(signal, input.nowMs))) {
    return { state: "EXPIRED", reason: "The directional signals are past their validity window." };
  }
  const liveDirectional = directional.filter((signal) => !expired(signal, input.nowMs));
  if (liveDirectional.length > 0) {
    if (input.externalFreshness === "STALE" || input.healthInsufficient) {
      return { state: "EMERGING", reason: "A directional signal is present. Optional confirmation is stale or the health sample is thin." };
    }
    return { state: "QUALIFIED", reason: "A directional signal is present and security passed. This is not an order." };
  }
  if (input.signals.some((signal) => signal.action === "HOLD" || signal.evaluation === "VALID")) {
    return { state: "WATCH", reason: "Strategies were evaluated. None has a directional signal." };
  }
  return { state: "NONE", reason: "No strategy evidence is available." };
}

function positionOpen(position: { state: string; quantity: string | null } | null | undefined): boolean {
  if (!position || position.state === "NO_POSITION" || position.state === "CLOSED") {
    return false;
  }
  if (position.quantity === null) {
    return false;
  }
  const quantity = Number(position.quantity);
  return Number.isFinite(quantity) && quantity > 0;
}

function managementOpportunity(position: { state: string; lastDecision: string | null } | null | undefined): OpportunityAssessment {
  const last = position?.lastDecision ?? null;
  const state = position?.state ?? "OPEN";
  if (last === "EXIT" || state === "CLOSING") {
    return { state: "EXIT_REQUIRED", reason: "The last position decision was an exit. This is not an order." };
  }
  if (last === "REDUCE" || state === "REDUCING") {
    return { state: "RISK_REDUCTION", reason: "The last position decision reduced risk. This is not an order." };
  }
  if (last === "ADD" || state === "ADDING") {
    return { state: "QUALIFIED", reason: "The last position decision was an add. This is not an order." };
  }
  if (last === "BLOCKED" || state === "BLOCKED") {
    return { state: "BLOCKED", reason: "The last position review was blocked." };
  }
  return { state: "MONITORING", reason: "An open position is being monitored. This is not an order." };
}

function expired(signal: StrategySignalReading, nowMs: number): boolean {
  const until = Date.parse(signal.validUntil);
  return Number.isFinite(until) && until <= nowMs;
}
