import { SOURCES } from "@/context/sources";
import type { KAIROSContext, PositionSliceValue, StrategySignalReading } from "@/context/types";
import { DRAWDOWN_BREACH } from "@/lifecycle/policy";
import { parseDecimal, type Scaled } from "@/domain/money";
import { percentToBps } from "@/position/entry";
import {
  ADD_CONFIDENCE_DELTA,
  DEFAULT_ADD_POLICY,
  HARD_POSITION_MULTIPLE,
  MAX_REDUCE_BPS,
  REDUCTION_BPS,
  WEAKEN_CONFIDENCE_DELTA,
  positionPolicyFor,
  type StrategyPositionPolicy,
} from "@/position/policy";
import type { PositionDecision, PositionReasonCode, PositionThesisState, RiskEffect, ThesisInvalidation } from "@/position/types";

const BLOCKED_EVALUATIONS = new Set(["STALE_DATA", "INSUFFICIENT_DATA", "BLOCKED"]);

/**
 * Deterministic position decision from one KAIROS context.
 * This function does not fetch a market, a skill, a model, or a wallet.
 */
export function decidePosition(context: KAIROSContext): PositionDecision {
  const position = context.positionContext.value;
  const marketState = `${context.market.status}:${context.market.freshness}`;
  if (!position || position.state === "NO_POSITION" || !positiveQuantity(position.quantity)) {
    return build(context, position, {
      action: "BLOCKED",
      reasons: ["NO_POSITION"],
      thesis: "UNKNOWN",
      riskState: "UNKNOWN",
      strategyState: "NO_POSITION",
      marketState,
      effect: "NONE",
      positionState: "NO_POSITION",
      reductionBps: null,
      strength: null,
      exitClass: null,
    });
  }
  if (position.state === "CLOSED") {
    return build(context, position, {
      action: "BLOCKED",
      reasons: ["ALREADY_CLOSED"],
      thesis: "UNKNOWN",
      riskState: "UNKNOWN",
      strategyState: "CLOSED",
      marketState,
      effect: "NONE",
      positionState: "CLOSED",
      reductionBps: null,
      strength: null,
      exitClass: null,
    });
  }
  if (position.state === "ADDING" || position.state === "REDUCING" || position.state === "CLOSING") {
    return build(context, position, {
      action: "BLOCKED",
      reasons: ["MANAGEMENT_IN_FLIGHT"],
      thesis: "UNKNOWN",
      riskState: "UNKNOWN",
      strategyState: position.state,
      marketState,
      effect: "NONE",
      positionState: "BLOCKED",
      reductionBps: null,
      strength: null,
      exitClass: null,
    });
  }

  const originId = position.originStrategy ?? position.entry?.entryStrategySignal.strategyId ?? null;
  const signal = originId ? (context.strategySignals.value?.signals.find((item) => item.strategyId === originId) ?? null) : null;
  const strategyState = signal ? `${signal.action}:${signal.evaluation}` : "MISSING";
  const policy = positionPolicyFor(originId);

  const dataReason = dataBlockReason(context, position);
  if (dataReason) {
    return build(context, position, {
      action: "BLOCKED",
      reasons: [dataReason],
      thesis: "UNKNOWN",
      riskState: "UNKNOWN",
      strategyState,
      marketState,
      effect: "NONE",
      positionState: "BLOCKED",
      reductionBps: null,
      strength: null,
      exitClass: null,
    });
  }

  const hard = hardExit(context, position, configuredDrawdown(position, policy), policy);
  if (hard.length > 0) {
    return exit(context, position, hard, "INVALIDATED", strategyState, marketState, 0.95);
  }

  const tradability = tradabilityExit(context);
  if (tradability.blocked && tradability.reason) {
    return build(context, position, {
      action: "BLOCKED",
      reasons: [tradability.reason],
      thesis: "INVALIDATED",
      riskState: "BREACH",
      strategyState,
      marketState,
      effect: "NONE",
      positionState: "BLOCKED",
      reductionBps: null,
      strength: null,
      exitClass: null,
    });
  }
  if (tradability.reason) {
    return exit(context, position, [tradability.reason], "INVALIDATED", strategyState, marketState, 0.9);
  }

  const thesis = evaluateThesisInvalidation(context);
  if (thesis.invalidated) {
    return exit(context, position, thesis.reasonCodes, "INVALIDATED", strategyState, marketState, 0.9);
  }

  if (holdingExpired(context, position, policy)) {
    return exit(context, position, ["THESIS_EXPIRED"], "INVALIDATED", strategyState, marketState, 0.85);
  }

  const exitSignal = explicitExitSignal(position, signal, thesis.reasonCodes);
  if (exitSignal) {
    return exit(context, position, [exitSignal], thesis.thesisState, strategyState, marketState, 0.85);
  }

  if (policy && !policy.managesPositions) {
    return hold(context, position, ["WEEKEND_ANALYTICAL", "NO_EXIT_TRIGGER"], "UNKNOWN", "WITHIN_LIMIT", strategyState, marketState);
  }
  if (!policy) {
    return hold(context, position, ["NO_POSITION_POLICY", "THESIS_UNKNOWN", "NO_EXIT_TRIGGER"], "UNKNOWN", riskLabel(context, position), strategyState, marketState);
  }

  const conflict = externalConflict(context, position);
  const thesisState: PositionThesisState =
    conflict && thesis.thesisState !== "INVALIDATED" && thesis.thesisState !== "WEAKENED" ? "WEAKENED" : thesis.thesisState;
  const reduction = reduceRule(context, position, thesisState, conflict);
  if (reduction) {
    return build(context, position, {
      action: "REDUCE",
      reasons: reduction.reasons,
      thesis: thesisState,
      riskState: reduction.reasons.includes("EXPOSURE_TOO_LARGE") || reduction.reasons.includes("ALLOCATION_ABOVE_POLICY") ? "BREACH" : riskLabel(context, position),
      strategyState,
      marketState,
      effect: "REDUCE_RISK",
      positionState: "REDUCING",
      reductionBps: reduction.bps,
      strength: 0.6,
      exitClass: null,
    });
  }

  const add = addDecision(context, position, thesisState, signal);
  if (add.ok) {
    return build(context, position, {
      action: "ADD",
      reasons: ["ADD_SUPPORTED"],
      thesis: thesisState,
      riskState: "WITHIN_LIMIT",
      strategyState,
      marketState,
      effect: "INCREASE_RISK",
      positionState: "ADDING",
      reductionBps: null,
      strength: signal?.confidence ?? null,
      exitClass: null,
    });
  }

  const holdReasons: PositionReasonCode[] = [];
  if (thesisState === "VALID" || thesisState === "STRENGTHENED") {
    holdReasons.push("THESIS_VALID");
  } else if (thesisState === "WEAKENED") {
    holdReasons.push("WEAKENED_SIGNAL");
  } else {
    holdReasons.push("THESIS_UNKNOWN");
  }
  if (conflict) {
    holdReasons.push("EXTERNAL_CONFLICT");
  }
  if (externalSupport(context, position)) {
    holdReasons.push("EXTERNAL_SUPPORT");
  }
  if (maintenanceActive(context)) {
    holdReasons.push("MAINTENANCE");
  }
  if (elevatedEarningsWindow(context) && !holdReasons.includes("EVENT_UNCERTAINTY")) {
    holdReasons.push("EVENT_UNCERTAINTY");
  }
  if (alternateStrategy(context, originId)) {
    holdReasons.push("ALTERNATE_STRATEGY_SIGNAL");
  }
  if (riskLabel(context, position) === "WITHIN_LIMIT") {
    holdReasons.push("RISK_WITHIN_LIMIT");
  }
  holdReasons.push("NO_EXIT_TRIGGER");
  for (const reason of add.blocked) {
    if (!holdReasons.includes(reason)) {
      holdReasons.push(reason);
    }
  }
  return hold(context, position, holdReasons, thesisState, riskLabel(context, position), strategyState, marketState);
}

/** Invalidation only. This does not create an exit intent. */
export function evaluateThesisInvalidation(context: KAIROSContext): ThesisInvalidation {
  const position = context.positionContext.value;
  const originId = position?.originStrategy ?? position?.entry?.entryStrategySignal.strategyId ?? null;
  const policy = positionPolicyFor(originId);
  const signal = originId ? (context.strategySignals.value?.signals.find((item) => item.strategyId === originId) ?? null) : null;
  if (!position || position.state === "NO_POSITION" || !policy || !policy.managesPositions) {
    return { invalidated: false, thesisState: "UNKNOWN", reasonCodes: [] };
  }

  const reasons: PositionReasonCode[] = [];
  if (originId === "momentum") {
    reasons.push(...momentumInvalidation(context, position, signal));
  } else if (originId === "mean-reversion") {
    reasons.push(...reversionInvalidation(context, position, policy.extensionBps));
  }
  if (signal && BLOCKED_EVALUATIONS.has(signal.evaluation)) {
    reasons.push("ORIGIN_STRATEGY_INVALID");
  }
  const health = originId ? context.strategyHealth.value?.reports.find((item) => item.strategyId === originId) : null;
  if (health?.status === "RETIRED") {
    reasons.push("ORIGIN_STRATEGY_INVALID");
  }
  const unique = dedupe(reasons);
  if (unique.length > 0) {
    return { invalidated: true, thesisState: "INVALIDATED", reasonCodes: unique };
  }
  return { invalidated: false, thesisState: thesisQuality(position, signal), reasonCodes: [] };
}

function momentumInvalidation(
  context: KAIROSContext,
  position: PositionSliceValue,
  signal: StrategySignalReading | null,
): PositionReasonCode[] {
  const reasons: PositionReasonCode[] = [];
  if (signal?.action === "SELL") {
    reasons.push("ORIGIN_STRATEGY_REVERSED");
  }
  const trend = context.features.value?.features.find((feature) => feature.id === "trend")?.value ?? null;
  const entryTrend = position.entry?.entryFeatures.trend ?? null;
  if (trend === "DOWN" && entryTrend !== "DOWN") {
    reasons.push("TREND_NO_LONGER_SUPPORTIVE");
  }
  const regime = context.regime.value?.regime ?? null;
  if (regime === "HIGH_VOLATILITY") {
    reasons.push("REGIME_INVALIDATED");
  }
  if (regime === "TRENDING_DOWN") {
    reasons.push("TREND_NO_LONGER_SUPPORTIVE");
  }
  return reasons;
}

function reversionInvalidation(context: KAIROSContext, position: PositionSliceValue, extensionBps: number | null): PositionReasonCode[] {
  const reasons: PositionReasonCode[] = [];
  const distance = percentToBps(context.features.value?.features.find((feature) => feature.id === "distance_from_mean")?.value ?? null);
  if (distance !== null && distance >= 0) {
    reasons.push("REVERSION_COMPLETED");
  }
  const entryDistance = position.entry?.entryFeatures.distanceFromMeanBps ?? null;
  if (distance !== null && entryDistance !== null && extensionBps !== null && distance <= entryDistance - extensionBps) {
    reasons.push("EXTENSION_AGAINST_THESIS");
  }
  const regime = context.regime.value?.regime ?? null;
  if (regime === "TRENDING_DOWN" || regime === "HIGH_VOLATILITY") {
    reasons.push("REGIME_INVALIDATED");
  }
  return reasons;
}

function thesisQuality(position: PositionSliceValue, signal: StrategySignalReading | null): PositionThesisState {
  if (!signal || !position.entry) {
    return "UNKNOWN";
  }
  const entryConfidence = position.entry.entryStrategySignal.confidence;
  const confidence = signal.confidence;
  if (signal.action === "HOLD" || signal.evaluation === "VALID" || signal.evaluation === "NO_SIGNAL") {
    return "WEAKENED";
  }
  if (entryConfidence !== null && confidence !== null && confidence + WEAKEN_CONFIDENCE_DELTA <= entryConfidence) {
    return "WEAKENED";
  }
  if (entryConfidence !== null && confidence !== null && confidence >= entryConfidence + ADD_CONFIDENCE_DELTA) {
    return "STRENGTHENED";
  }
  if (signal.action === "BUY" && signal.evaluation === "SIGNAL") {
    return "VALID";
  }
  return "UNKNOWN";
}

/**
 * Priority 4. Fires only when the origin strategy prints an exit action
 * that thesis invalidation did not already capture.
 * Mean reversion uses its own completion and extension rules.
 * Weekend does not gain an exit from this step.
 */
function explicitExitSignal(
  position: PositionSliceValue,
  signal: StrategySignalReading | null,
  invalidation: readonly PositionReasonCode[],
): PositionReasonCode | null {
  const policy = positionPolicyFor(position.originStrategy);
  if (!policy?.managesPositions || policy.strategyId === "mean-reversion" || !signal) {
    return null;
  }
  if (invalidation.includes("ORIGIN_STRATEGY_REVERSED")) {
    return null;
  }
  if (signal.action === "SELL" && signal.evaluation === "SIGNAL") {
    return "EXIT_SIGNAL";
  }
  return null;
}

function hardExit(
  context: KAIROSContext,
  position: PositionSliceValue,
  adverseMoveBps: number | null,
  policy: StrategyPositionPolicy | null,
): PositionReasonCode[] {
  const reasons: PositionReasonCode[] = [];
  if (trailingTriggered(context, position, policy)) {
    reasons.push("TRAILING_EXIT");
  }
  if (adverseMoveBps !== null) {
    const adverse = adverseBps(position.entry?.entryPrice ?? position.averageEntry, position.currentMark ?? context.market.value?.price ?? null);
    if (adverse !== null && adverse >= adverseMoveBps) {
      reasons.push("ADVERSE_MOVE");
    }
  }
  const originId = position.originStrategy;
  const performance = context.strategyPerformance.value?.records.find((record) => record.strategyId === originId && record.dataset === "PAPER");
  const net = performance ? readScaled(performance.netPnL) : null;
  if (net !== null && net <= -DRAWDOWN_BREACH) {
    reasons.push("MAX_DRAWDOWN_BREACH");
  }
  const notional = readScaled(position.notional);
  const cap = readScaled(position.risk?.maxPositionNotional ?? null);
  if (notional !== null && cap !== null && cap > 0n && notional > cap * BigInt(HARD_POSITION_MULTIPLE)) {
    reasons.push("POSITION_LIMIT_BREACH");
  }
  if (position.risk?.dailyLossReached === true && reasons.length > 0) {
    reasons.push("RISK_BREACH");
  }
  return dedupe(reasons);
}

function tradabilityExit(context: KAIROSContext): { blocked: boolean; reason: PositionReasonCode | null } {
  const gate = context.tokenSecurity.value?.gate;
  const label = context.tokenSecurity.value?.label;
  const securityBlocked = gate === "BLOCK" || label === "BLOCK";
  const events = context.eventContext.value?.events ?? [];
  const restriction = events.some((event) => event.active && event.type !== "MAINTENANCE" && (event.type === "TRADING_RESTRICTION" || event.severity === "RESTRICTION"));
  if (!securityBlocked && !restriction) {
    return { blocked: false, reason: null };
  }
  const mark = context.market.value?.price ?? context.positionContext.value?.currentMark;
  if (!mark || context.market.status !== "AVAILABLE") {
    return { blocked: true, reason: securityBlocked ? "TOKEN_NOT_TRADABLE" : "TRADING_RESTRICTION" };
  }
  if (securityBlocked) {
    return { blocked: false, reason: "SECURITY_BLOCK" };
  }
  return { blocked: false, reason: "TRADING_RESTRICTION" };
}

function reduceRule(
  context: KAIROSContext,
  position: PositionSliceValue,
  thesis: PositionThesisState,
  conflict: boolean,
): { reasons: PositionReasonCode[]; bps: number } | null {
  const applied = new Set(position.appliedReductions);
  const reasons: PositionReasonCode[] = [];
  let bps = 0;
  const exposure = exposureBps(position);
  if (exposure !== null && exposure > 0) {
    reasons.push("EXPOSURE_TOO_LARGE");
    bps = Math.max(bps, Math.min(MAX_REDUCE_BPS, exposure));
  }
  if (allocationExceeded(position) && !applied.has("ALLOCATION_ABOVE_POLICY")) {
    reasons.push("ALLOCATION_ABOVE_POLICY");
    bps = Math.max(bps, REDUCTION_BPS.ALLOCATION_ABOVE_POLICY);
  }
  if (thesis === "WEAKENED" && !applied.has("WEAKENED_SIGNAL")) {
    reasons.push("WEAKENED_SIGNAL");
    bps = Math.max(bps, REDUCTION_BPS.WEAKENED_SIGNAL);
  }
  if (conflict) {
    reasons.push("EXTERNAL_CONFLICT");
  }
  if (eventUncertainty(context, position) && !applied.has("EVENT_UNCERTAINTY")) {
    reasons.push("EVENT_UNCERTAINTY");
    bps = Math.max(bps, REDUCTION_BPS.EVENT_UNCERTAINTY);
  }
  if (earningsReduction(context, position) && !applied.has("EVENT_UNCERTAINTY") && !reasons.includes("EVENT_UNCERTAINTY")) {
    reasons.push("EVENT_UNCERTAINTY");
    bps = Math.max(bps, REDUCTION_BPS.EVENT_UNCERTAINTY);
  }
  const health = position.originStrategy
    ? context.strategyHealth.value?.reports.find((item) => item.strategyId === position.originStrategy)
    : null;
  if (health && health.sampleSize > 0 && (health.status === "DEGRADED" || health.status === "UNSTABLE") && !applied.has("HEALTH_DEGRADED")) {
    reasons.push("HEALTH_DEGRADED");
    bps = Math.max(bps, REDUCTION_BPS.HEALTH_DEGRADED);
  }
  if (reasons.length === 0 || bps <= 0 || bps >= 10_000) {
    return null;
  }
  return { reasons, bps: Math.min(MAX_REDUCE_BPS, bps) };
}

function addDecision(
  context: KAIROSContext,
  position: PositionSliceValue,
  thesis: PositionThesisState,
  signal: StrategySignalReading | null,
): { ok: true } | { ok: false; blocked: PositionReasonCode[] } {
  const blocked: PositionReasonCode[] = [];
  if (thesis !== "VALID" && thesis !== "STRENGTHENED") {
    blocked.push("ADD_NOT_FRESH");
  }
  if (!freshSupport(context, position, signal, thesis)) {
    blocked.push("ADD_NOT_FRESH");
  }
  const mark = readScaled(position.currentMark ?? context.market.value?.price ?? null);
  const entry = readScaled(position.entry?.entryPrice ?? position.averageEntry);
  if (mark !== null && entry !== null && mark < entry) {
    blocked.push("ADD_PRICE_DOWN");
  }
  if (!riskAllowsAdd(position)) {
    blocked.push("ADD_RISK_BLOCKED");
  }
  if (position.addCount >= DEFAULT_ADD_POLICY.maxAdds) {
    blocked.push("ADD_AT_MAX");
  }
  const notional = readScaled(position.notional);
  const totalCap = readScaled(DEFAULT_ADD_POLICY.maxTotalNotional);
  const userCap = readScaled(position.risk?.maxPositionNotional ?? null);
  if (notional !== null && ((totalCap !== null && notional >= totalCap) || (userCap !== null && notional >= userCap))) {
    blocked.push("ADD_AT_MAX");
  }
  if (context.tokenSecurity.value?.gate === "BLOCK" || context.tokenSecurity.value?.label === "BLOCK") {
    blocked.push("ADD_RISK_BLOCKED");
  }
  const restriction = (context.eventContext.value?.events ?? []).some(
    (event) => event.active && event.type !== "MAINTENANCE" && (event.type === "TRADING_RESTRICTION" || event.severity === "RESTRICTION"),
  );
  if (restriction || maintenanceActive(context)) {
    blocked.push("ADD_RISK_BLOCKED");
  }
  const anchor = Date.parse(position.lastAddAt ?? position.entry?.entryTimestamp ?? position.openedAt ?? "");
  const now = Date.parse(context.timestamp);
  if (!Number.isFinite(anchor) || !Number.isFinite(now) || now - anchor < DEFAULT_ADD_POLICY.minIntervalMs) {
    blocked.push("ADD_COOLDOWN");
  }
  if (context.market.freshness === "STALE" || context.quality === "BLOCKED") {
    blocked.push("ADD_RISK_BLOCKED");
  }
  const unique = dedupe(blocked);
  return unique.length === 0 ? { ok: true } : { ok: false, blocked: unique };
}

function freshSupport(
  context: KAIROSContext,
  position: PositionSliceValue,
  signal: StrategySignalReading | null,
  thesis: PositionThesisState,
): boolean {
  if (!signal || signal.action !== "BUY" || signal.evaluation !== "SIGNAL") {
    return false;
  }
  const entryAt = Date.parse(position.entry?.entryTimestamp ?? "");
  const signalAt = Date.parse(signal.timestamp);
  const validUntil = Date.parse(signal.validUntil);
  const now = Date.parse(context.timestamp);
  if (!Number.isFinite(signalAt) || !Number.isFinite(entryAt) || signalAt <= entryAt) {
    return false;
  }
  if (!Number.isFinite(validUntil) || !Number.isFinite(now) || validUntil <= now) {
    return false;
  }
  const entryDirections = position.entry?.entryExternalEvidence?.mappedDirections ?? [];
  const confirmed = (context.externalSignals.value?.signals ?? []).some(
    (item) => item.relevance === "MAPPED" && item.direction === "BUY" && (item.freshness === "FRESH" || item.freshness === "AGING"),
  );
  const newExternal = confirmed && !entryDirections.includes("BUY");
  return thesis === "STRENGTHENED" || newExternal;
}

function elevatedEarningsWindow(context: KAIROSContext): boolean {
  const window = context.earningsContext?.value?.window;
  return window === "PRE_EVENT" || window === "EVENT_DAY" || window === "POST_EVENT";
}

function earningsReduction(context: KAIROSContext, position: PositionSliceValue): boolean {
  const value = context.earningsContext?.value;
  if (!value?.policy.eventReductionEnabled || value.window !== "PRE_EVENT") {
    return false;
  }
  return !position.appliedReductions.includes("EVENT_UNCERTAINTY");
}

function eventUncertainty(context: KAIROSContext, position: PositionSliceValue): boolean {
  const events = context.eventContext.value?.events ?? [];
  const info = events.filter((event) => event.active && event.severity === "INFO" && event.source !== SOURCES.FMP_EARNINGS);
  if (info.length === 0) {
    return false;
  }
  const entryTypes = new Set(position.entry?.entryEventState?.activeTypes ?? []);
  return info.some((event) => !entryTypes.has(event.type));
}

function exposureBps(position: PositionSliceValue): number | null {
  const notional = readScaled(position.notional);
  const cap = readScaled(position.risk?.maxPositionNotional ?? null);
  if (notional === null || cap === null || cap <= 0n || notional <= cap) {
    return null;
  }
  if (notional > cap * BigInt(HARD_POSITION_MULTIPLE)) {
    return null;
  }
  const bps = Number((notional - cap) * 10_000n / notional);
  if (!Number.isFinite(bps) || bps <= 0) {
    return null;
  }
  return Math.min(MAX_REDUCE_BPS, Math.trunc(bps));
}

function allocationExceeded(position: PositionSliceValue): boolean {
  const risk = position.risk;
  if (!risk || risk.maxAllocationBps === null || risk.equity === null || risk.invested === null) {
    return false;
  }
  const equity = readScaled(risk.equity);
  const invested = readScaled(risk.invested);
  if (equity === null || invested === null || equity <= 0n) {
    return false;
  }
  return invested * 10_000n > equity * BigInt(risk.maxAllocationBps);
}

function riskAllowsAdd(position: PositionSliceValue): boolean {
  const risk = position.risk;
  if (!risk || risk.dailyLossReached === null || risk.maxAllocationBps === null || risk.equity === null || risk.invested === null) {
    return false;
  }
  if (risk.dailyLossReached) {
    return false;
  }
  const equity = readScaled(risk.equity);
  const invested = readScaled(risk.invested);
  if (equity === null || invested === null || equity <= 0n) {
    return false;
  }
  return invested * 10_000n < equity * BigInt(risk.maxAllocationBps);
}

function riskLabel(context: KAIROSContext, position: PositionSliceValue): PositionDecision["riskState"] {
  if (!position.risk) {
    return "UNKNOWN";
  }
  if (position.risk.dailyLossReached) {
    return "INCREASE_BLOCKED";
  }
  if (allocationExceeded(position) || (exposureBps(position) ?? 0) > 0) {
    return "BREACH";
  }
  if (context.quality === "BLOCKED") {
    return "UNKNOWN";
  }
  return "WITHIN_LIMIT";
}

function dataBlockReason(context: KAIROSContext, position: PositionSliceValue): PositionReasonCode | null {
  if (context.market.status === "STALE" || context.market.freshness === "STALE") {
    return "MARKET_DATA_STALE";
  }
  if (context.market.status === "UNAVAILABLE" || context.quality === "BLOCKED") {
    return "CRITICAL_DATA_FAILURE";
  }
  const price = context.market.value?.price ?? position.currentMark;
  if (price === null || price.trim().length === 0) {
    return "CRITICAL_DATA_FAILURE";
  }
  return null;
}

const BAR_MS = 15 * 60 * 1000;
const RISK_EXIT_REASONS = new Set<PositionReasonCode>([
  "ADVERSE_MOVE",
  "MAX_DRAWDOWN_BREACH",
  "POSITION_LIMIT_BREACH",
  "RISK_BREACH",
  "TRAILING_EXIT",
  "SECURITY_BLOCK",
  "TOKEN_NOT_TRADABLE",
  "TRADING_RESTRICTION",
]);

function configuredDrawdown(position: PositionSliceValue, policy: StrategyPositionPolicy | null): number | null {
  return position.managementPolicy?.maxPositionDrawdownBps ?? policy?.risk.maxPositionDrawdownBps ?? policy?.adverseMoveBps ?? null;
}

function holdingExpired(context: KAIROSContext, position: PositionSliceValue, policy: StrategyPositionPolicy | null): boolean {
  const bars = position.managementPolicy?.maxHoldingBars ?? policy?.risk.maxHoldingBars ?? null;
  const minutes = position.managementPolicy?.maxHoldingMinutes ?? policy?.risk.maxHoldingMinutes ?? null;
  if (bars === null && minutes === null) {
    return false;
  }
  const opened = Date.parse(position.openedAt ?? position.entry?.entryTimestamp ?? "");
  const now = Date.parse(context.timestamp);
  if (!Number.isFinite(opened) || !Number.isFinite(now)) {
    return false;
  }
  const elapsed = now - opened;
  if (minutes !== null && elapsed >= minutes * 60 * 1000) {
    return true;
  }
  return bars !== null && elapsed >= bars * BAR_MS;
}

function trailingTriggered(context: KAIROSContext, position: PositionSliceValue, policy: StrategyPositionPolicy | null): boolean {
  const threshold = position.managementPolicy?.trailingExitBps ?? policy?.risk.trailingExitBps ?? null;
  if (threshold === null || context.market.value?.fidelity !== "paper") {
    return false;
  }
  const high = readScaled(position.highestMark);
  const mark = readScaled(position.currentMark ?? context.market.value?.price ?? null);
  const entry = readScaled(position.entry?.entryPrice ?? position.averageEntry);
  if (high === null || mark === null || entry === null || high <= 0n || entry <= 0n) {
    return false;
  }
  const protect = position.managementPolicy?.profitProtectionBps ?? policy?.risk.profitProtectionBps ?? null;
  if (protect !== null && Number((high - entry) * 10_000n / entry) < protect) {
    return false;
  }
  return Number((high - mark) * 10_000n / high) >= threshold;
}

function maintenanceActive(context: KAIROSContext): boolean {
  return (context.eventContext.value?.events ?? []).some((event) => event.active && event.type === "MAINTENANCE");
}

function externalConflict(context: KAIROSContext, position: PositionSliceValue): boolean {
  if (position.entry?.entryStrategySignal.action !== "BUY") {
    return false;
  }
  if (context.externalSignals.status === "UNAVAILABLE" || context.externalSignals.value === null) {
    return false;
  }
  return context.externalSignals.value.signals.some(
    (signal) => signal.relevance === "MAPPED" && signal.direction === "SELL" && (signal.freshness === "FRESH" || signal.freshness === "AGING"),
  );
}

function externalSupport(context: KAIROSContext, position: PositionSliceValue): boolean {
  if (position.entry?.entryStrategySignal.action !== "BUY") {
    return false;
  }
  if (context.externalSignals.status !== "AVAILABLE" || context.externalSignals.value === null) {
    return false;
  }
  return context.externalSignals.value.signals.some(
    (signal) => signal.relevance === "MAPPED" && signal.direction === "BUY" && (signal.freshness === "FRESH" || signal.freshness === "AGING"),
  );
}

function alternateStrategy(context: KAIROSContext, originId: string | null): string | null {
  const signals = context.strategySignals.value?.signals ?? [];
  const origin = originId ? signals.find((signal) => signal.strategyId === originId) : null;
  const originConfidence = origin?.confidence ?? 0;
  const other = signals
    .filter((signal) => signal.strategyId !== originId && signal.evaluation === "SIGNAL" && (signal.action === "BUY" || signal.action === "SELL"))
    .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))[0];
  if (!other || (other.confidence ?? 0) <= originConfidence) {
    return null;
  }
  return other.strategyId;
}

function adverseBps(entryPrice: string | null | undefined, mark: string | null): number | null {
  const entry = readScaled(entryPrice);
  const current = readScaled(mark);
  if (entry === null || current === null || entry <= 0n) {
    return null;
  }
  return Number(((entry - current) * 10_000n) / entry);
}

function positiveQuantity(quantity: string | null): boolean {
  const scaled = readScaled(quantity);
  return scaled !== null && scaled > 0n;
}

function readScaled(value: string | null | undefined): Scaled | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }
  try {
    return parseDecimal(value);
  } catch {
    return null;
  }
}

function exit(
  context: KAIROSContext,
  position: PositionSliceValue,
  reasons: readonly PositionReasonCode[],
  thesis: PositionThesisState,
  strategyState: string,
  marketState: string,
  strength: number,
): PositionDecision {
  return build(context, position, {
    action: "EXIT",
    reasons,
    thesis,
    riskState: "BREACH",
    strategyState,
    marketState,
    effect: "CLOSE_RISK",
    positionState: "CLOSING",
    reductionBps: null,
    strength,
    exitClass: reasons.some((reason) => RISK_EXIT_REASONS.has(reason)) ? "RISK" : "THESIS",
  });
}

function hold(
  context: KAIROSContext,
  position: PositionSliceValue,
  reasons: readonly PositionReasonCode[],
  thesis: PositionThesisState,
  riskState: PositionDecision["riskState"],
  strategyState: string,
  marketState: string,
): PositionDecision {
  return build(context, position, {
    action: "HOLD",
    reasons,
    thesis,
    riskState,
    strategyState,
    marketState,
    effect: "NONE",
    positionState: "OPEN",
    reductionBps: null,
    strength: thesis === "VALID" || thesis === "STRENGTHENED" ? 0.5 : null,
    exitClass: null,
  });
}

function build(
  context: KAIROSContext,
  position: PositionSliceValue | null,
  input: {
    action: PositionDecision["action"];
    reasons: readonly PositionReasonCode[];
    thesis: PositionThesisState;
    riskState: PositionDecision["riskState"];
    strategyState: string;
    marketState: string;
    effect: RiskEffect;
    positionState: PositionDecision["positionState"];
    reductionBps: number | null;
    strength: number | null;
    exitClass: PositionDecision["exitClass"];
  },
): PositionDecision {
  const originStrategyId = position?.originStrategy ?? position?.entry?.entryStrategySignal.strategyId ?? null;
  return {
    decisionId: `posdec:${context.userId}:${context.assetId}:${context.cycleId}:${input.action}`,
    cycleId: context.cycleId,
    correlationId: position?.correlationId ?? `corr:${context.userId}:${context.assetId}:${context.cycleId}`,
    userId: context.userId,
    agentId: context.agentId,
    assetId: context.assetId,
    positionId: position?.positionId ?? null,
    originStrategyId,
    originStrategyVersion: position?.strategyVersion ?? null,
    action: input.action,
    reasonCodes: dedupe(input.reasons),
    strength: input.strength,
    currentThesisState: input.thesis,
    riskState: input.riskState,
    strategyState: input.strategyState,
    marketState: input.marketState,
    createdAt: context.timestamp,
    executable: false,
    riskEffect: input.effect,
    positionState: input.positionState,
    reductionBps: input.reductionBps,
    exitClass: input.exitClass,
    alternateStrategyId: alternateStrategy(context, originStrategyId),
  };
}

function dedupe(reasons: readonly PositionReasonCode[]): PositionReasonCode[] {
  return [...new Set(reasons)];
}
