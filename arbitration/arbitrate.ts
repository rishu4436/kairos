import type {
  ArbitrationContext,
  ArbitrationDecision,
  ArbitrationDecisionKind,
  ArbitrationEvidence,
  CandidateStatus,
  StrategyCandidate,
  StrategyConflict,
  HistoricalHealthInput,
  StrategyEvaluation,
  StrategyHealth,
} from "@/domain/arbitration";
import type { SignalAction } from "@/domain/signal";
import {
  ARBITRATION_POLICY_VERSION,
  CONFLICT_FLOOR,
  DECISION_TTL_MS,
  FIT_VALUE,
  HIGH_VOLATILITY_PENALTY,
  MIN_CONFIRM_SCORE,
  MIN_SELECTION_MARGIN,
  MIN_SELECTION_SCORE,
  MIN_SIGNAL_STRENGTH,
  MIN_STRATEGY_HOLD_TIME_MS,
  MIN_STRATEGY_SWITCH_DELTA,
  TIMESTAMP_ALIGN_MS,
  UNKNOWN_REGIME_PENALTY,
  regimeFitName,
  sessionFitName,
} from "@/arbitration/policy";
import { dataQualityScore, healthScore, scoreSelection } from "@/arbitration/score";
import { historicalFactor } from "@/lifecycle/policy";
import { assessExternalPolicy } from "@/skills/policy";
import { confidenceAfterSecurity, scoreAfterSecurity } from "@/skills/security";

/** Pure arbitration. Same context and evaluations always return the same decision. */
export function arbitrateAsset(
  context: ArbitrationContext,
  evaluations: readonly StrategyEvaluation[],
): ArbitrationDecision {
  const blocked = context.freshness === "STALE" || context.dataQuality.status === "STALE" || !context.pricePresent;
  const scored = evaluations.map((evaluation) => scoreEvaluation(context, evaluation));
  const directional = scored.filter((candidate) => candidate.eligible && isDirectional(candidate.action));
  const conflicts = blocked ? [] : findConflicts(directional);
  const ranked = [...scored.filter((candidate) => candidate.eligible)].sort(byScore);

  let decision: ArbitrationDecisionKind = "NO_OPPORTUNITY";
  let selected: StrategyCandidate | null = null;
  let cooldownHeld = false;
  const supports: string[] = [];
  const penalties: string[] = [];

  if (blocked) {
    decision = "DATA_BLOCKED";
    penalties.push(
      context.pricePresent
        ? "The observation is stale. No strategy is selected."
        : "The token price is missing. No strategy is selected.",
    );
  } else if (conflicts.length > 0) {
    decision = "CONFLICT";
    penalties.push("Opposing directional signals are both above the conflict floor. Resolution: NO ACTION.");
    for (const conflict of conflicts) {
      supports.push(conflict.summary);
    }
  } else {
    const confirming = sharedDirection(ranked);
    if (confirming) {
      decision = "MULTI_STRATEGY_CONFIRMATION";
      selected = confirming.lead;
      supports.push(...confirming.names.map((name) => `${name} confirms.`));
      supports.push("Analytical confirmation only. Capital is not doubled.");
    } else if (ranked.length === 0) {
      decision = emptyDecision(scored);
      penalties.push(emptyReason(decision, scored));
    } else if (ranked[0].score < MIN_SELECTION_SCORE) {
      decision = "NO_OPPORTUNITY";
      penalties.push(`Top score ${ranked[0].score.toFixed(2)} is below the minimum ${MIN_SELECTION_SCORE.toFixed(2)}.`);
    } else if (ranked[1] && ranked[0].score - ranked[1].score < MIN_SELECTION_MARGIN) {
      decision = "INSUFFICIENT_EVIDENCE";
      penalties.push(
        `${ranked[0].strategyName} ${ranked[0].score.toFixed(2)} and ${ranked[1].strategyName} ${ranked[1].score.toFixed(2)} are inside the ${MIN_SELECTION_MARGIN.toFixed(2)} margin.`,
      );
    } else {
      decision = "SELECT_STRATEGY";
      selected = ranked[0];
      const held = applyCooldown(context, selected, scored);
      if (held) {
        selected = held;
        cooldownHeld = true;
        penalties.push(
          `Cooldown kept ${held.strategyName}. The challenger did not clear the ${MIN_STRATEGY_SWITCH_DELTA.toFixed(2)} switch delta.`,
        );
      }
      supports.push(...selected.evidence.slice(0, 4));
      supports.push(`Regime ${context.regime}.`);
      supports.push(`Session ${context.session}.`);
      supports.push(`Data quality ${context.dataQuality.status}.`);
    }
  }

  if (context.regime === "HIGH_VOLATILITY") {
    penalties.push("High volatility penalty applied to regime strategies.");
  }
  if (context.regime === "UNKNOWN") {
    penalties.push("Regime is unknown. Trend and reversion strategies are not eligible.");
  }

  const selectedMemory = selected ? context.historicalHealth?.[selected.strategyId] : undefined;
  if (selectedMemory) {
    supports.push("Historical performance is separate from the current signal. It does not replace it.");
  }
  const policy = assessExternalPolicy({
    internalAction: selected?.action ?? null,
    signals: context.externalSignals,
    security: context.securityAssessment,
    absence: context.externalAbsence ?? null,
  });
  const strategyScore = scoreAfterSecurity(selected?.score ?? null, policy.securityGate);
  const strategyConfidence = confidenceAfterSecurity(selected && decision !== "DATA_BLOCKED" ? selected.confidence : null, policy.securityGate);
  if (policy.externalConfirmation === "CONFIRMING_EVIDENCE") {
    supports.push("External Smart Money agrees with the strategy direction. The score was not increased.");
  }
  if (policy.externalConflict === "CONFLICTING_EVIDENCE") {
    penalties.push("External Smart Money conflicts with the strategy direction. The score was not changed.");
  }
  if (policy.externalConfirmation === "STALE") {
    penalties.push("An external signal is stale and was not treated as current.");
  }
  if (policy.externalConfirmation === "SOURCE_ERROR" || policy.externalConfirmation === "SOURCE_UNAVAILABLE") {
    penalties.push("An external provider did not return a signal. That is not evidence that no signal exists. The score was not changed.");
  }
  if (policy.securityGate === "BLOCK") {
    penalties.push("Token security blocked selection. The strategy score was not increased.");
    decision = "DATA_BLOCKED";
    selected = null;
  }

  const marked = markStatuses(scored, decision, selected, conflicts).map((candidate) =>
    blocked
      ? {
          ...candidate,
          eligible: false,
          candidateStatus: candidate.candidateStatus === "STALE" || candidate.candidateStatus === "INSUFFICIENT_DATA" ? candidate.candidateStatus : ("REJECTED" as const),
          rejectionReason: candidate.rejectionReason ?? "Observation data blocked selection.",
        }
      : candidate,
  );
  const evidence = buildEvidence(decision, selected, supports, penalties, marked);
  return {
    asset: { id: context.asset.id, ticker: context.asset.ticker, userId: context.userId },
    timestamp: context.timestamp,
    decision,
    selectedStrategy: selected?.strategyId ?? null,
    selectedStrategyName: selected?.strategyName ?? null,
    selectedAction: selected?.action ?? null,
    score: strategyScore,
    confidence: strategyConfidence,
    candidates: marked,
    conflicts,
    evidence,
    dataQuality: context.dataQuality.status,
    marketRegime: context.regime,
    marketSession: context.session,
    validUntil: new Date(context.asOfMs + DECISION_TTL_MS).toISOString(),
    version: ARBITRATION_POLICY_VERSION,
    cooldownHeld,
    loopPhase: "WAITING_FOR_RISK",
    externalConfirmation: policy.externalConfirmation,
    externalConflict: policy.externalConflict,
    securityGate: policy.securityGate,
    externalFreshness: policy.externalFreshness,
    historicalHealth: selectedMemory?.status ?? "NONE",
    historicalSample: selectedMemory?.sample ?? "NONE",
  };
}

function scoreEvaluation(context: ArbitrationContext, evaluation: StrategyEvaluation): StrategyCandidate {
  const health = healthOf(evaluation);
  const rejection = rejectionReason(context, evaluation);
  const regimeName = regimeFitName(evaluation.signalStrategyId, context.regime);
  const sessionName = sessionFitName(evaluation.signalStrategyId, context.session);
  const regimeFit = FIT_VALUE[regimeName];
  const sessionFit = FIT_VALUE[sessionName];
  const validityMs = Date.parse(evaluation.validUntil) - context.asOfMs;
  const validityFraction = Number.isFinite(validityMs) ? Math.max(0, validityMs) / DECISION_TTL_MS : 0;
  const uncertainty =
    (context.regime === "HIGH_VOLATILITY" && evaluation.signalStrategyId !== "weekend" ? HIGH_VOLATILITY_PENALTY : 0) +
    (context.regime === "UNKNOWN" && regimeName !== "ZERO" ? UNKNOWN_REGIME_PENALTY : 0);
  const stalePenalty = evaluation.evaluation === "STALE_DATA" || evaluation.signalQuality === "STALE" ? 1 : 0;
  const scored = scoreSelection({
    confidence: evaluation.evaluation === "SIGNAL" ? evaluation.confidence : 0,
    evidenceCount: evaluation.evidence.length,
    validityFraction,
    regimeFit,
    sessionFit,
    dataQuality: dataQualityScore(context.dataQuality.status),
    strategyHealth: applyHistoricalHealth(healthScore(health), context.historicalHealth?.[evaluation.signalStrategyId]),
    uncertaintyPenalty: uncertainty,
    stalePenalty,
    conflictPenalty: 0,
  });
  const strengthRejection =
    rejection === null && scored.components.signalStrength < MIN_SIGNAL_STRENGTH
      ? "Signal strength is below the minimum."
      : null;
  const reason = rejection ?? strengthRejection;
  const paperResearch = paperResearchCandidate(context, evaluation);
  const hideScore =
    (evaluation.status !== "implemented" && !paperResearch) ||
    evaluation.evaluation === "STALE_DATA" ||
    evaluation.evaluation === "INSUFFICIENT_DATA" ||
    evaluation.signalQuality === "STALE" ||
    evaluation.signalQuality === "INSUFFICIENT";
  return {
    strategyId: evaluation.signalStrategyId,
    strategyName: evaluation.strategyName,
    status: evaluation.status,
    eligible: reason === null,
    candidateStatus: reason === null ? "ELIGIBLE" : statusFor(reason, evaluation),
    action: evaluation.action,
    evaluation: evaluation.evaluation,
    confidence: evaluation.confidence,
    score: hideScore ? 0 : scored.total,
    components: scored.components,
    rejectionReason: reason,
    evidence: evaluation.evidence,
    health,
  };
}

function paperResearchCandidate(context: ArbitrationContext, evaluation: StrategyEvaluation): boolean {
  return context.paperResearchEligible === true && evaluation.tags.includes("PAPER_ACTIVE") && !evaluation.tags.includes("SHADOW");
}

function rejectionReason(context: ArbitrationContext, evaluation: StrategyEvaluation): string | null {
  if (evaluation.tags.includes("SHADOW")) {
    return "Shadow strategies do not create trade intents.";
  }
  if (evaluation.status !== "implemented" && !paperResearchCandidate(context, evaluation)) {
    return "Coming-soon strategies are not eligible.";
  }
  if (!evaluation.supportedAssets.includes("*") && !evaluation.supportedAssets.includes(context.asset.ticker)) {
    return "Asset is not supported.";
  }
  if (!evaluation.supportedSessions.includes("*") && !evaluation.supportedSessions.includes(context.session)) {
    return "Session is outside the strategy requirement.";
  }
  if (evaluation.evaluation === "STALE_DATA" || evaluation.signalQuality === "STALE") {
    return "Stale data.";
  }
  if (evaluation.evaluation === "INSUFFICIENT_DATA" || evaluation.signalQuality === "INSUFFICIENT") {
    return "Insufficient data.";
  }
  if (context.historyPoints < evaluation.minHistory) {
    return "History is shorter than this strategy requires.";
  }
  if (evaluation.requiresReference && !context.referencePresent) {
    return "Reference price is missing.";
  }
  if (evaluation.featuresUsed.length === 0 || evaluation.featuresUsed.some((id) => !context.featureIds.includes(id))) {
    return "Required features are missing.";
  }
  const signalMs = Date.parse(evaluation.signalTimestamp);
  if (!Number.isFinite(signalMs) || Math.abs(signalMs - context.asOfMs) > TIMESTAMP_ALIGN_MS) {
    return "Signal timestamp is not aligned with the observation.";
  }
  const until = Date.parse(evaluation.validUntil);
  if (!Number.isFinite(until) || until <= context.asOfMs) {
    return "Signal has expired.";
  }
  if (regimeFitName(evaluation.signalStrategyId, context.regime) === "ZERO") {
    return "Regime is incompatible.";
  }
  if (sessionFitName(evaluation.signalStrategyId, context.session) === "ZERO") {
    return "Session is incompatible.";
  }
  if (!isSelectionSignal(evaluation)) {
    return "No selection signal.";
  }
  return null;
}

function isSelectionSignal(evaluation: StrategyEvaluation): boolean {
  if (evaluation.evaluation !== "SIGNAL") {
    return false;
  }
  if (evaluation.action === "BUY" || evaluation.action === "SELL") {
    return true;
  }
  return evaluation.action === "HOLD" && evaluation.tags.includes("OFF_HOURS_DISLOCATION");
}

function isDirectional(action: SignalAction): action is "BUY" | "SELL" {
  return action === "BUY" || action === "SELL";
}

function findConflicts(candidates: readonly StrategyCandidate[]): StrategyConflict[] {
  const buys = candidates.filter((candidate) => candidate.action === "BUY" && candidate.score >= CONFLICT_FLOOR);
  const sells = candidates.filter((candidate) => candidate.action === "SELL" && candidate.score >= CONFLICT_FLOOR);
  const conflicts: StrategyConflict[] = [];
  for (const buy of buys) {
    for (const sell of sells) {
      conflicts.push({
        leftStrategyId: buy.strategyId,
        rightStrategyId: sell.strategyId,
        leftAction: "BUY",
        rightAction: "SELL",
        leftScore: buy.score,
        rightScore: sell.score,
        summary: `${buy.strategyName} indicates ${phrase(buy.strategyId, "BUY")}. ${sell.strategyName} indicates ${phrase(sell.strategyId, "SELL")}. Resolution: NO ACTION.`,
      });
    }
  }
  return conflicts;
}

function phrase(strategyId: string, action: "BUY" | "SELL"): string {
  if (strategyId === "momentum") {
    return action === "BUY" ? "trend continuation" : "downtrend continuation";
  }
  if (strategyId === "mean-reversion") {
    return action === "BUY" ? "reversion from a stretched low" : "overextension";
  }
  return "an off-hours dislocation";
}

function sharedDirection(ranked: readonly StrategyCandidate[]): { lead: StrategyCandidate; names: string[] } | null {
  for (const action of ["BUY", "SELL"] as const) {
    const group = ranked.filter((candidate) => candidate.action === action && candidate.score >= MIN_CONFIRM_SCORE);
    if (group.length >= 2) {
      return { lead: group[0], names: group.map((candidate) => candidate.strategyName) };
    }
  }
  return null;
}

function applyCooldown(
  context: ArbitrationContext,
  selected: StrategyCandidate,
  candidates: readonly StrategyCandidate[],
): StrategyCandidate | null {
  const prior = context.priorSelection;
  if (!prior || prior.userId !== context.userId || prior.assetId !== context.asset.id) {
    return null;
  }
  if (prior.strategyId === selected.strategyId) {
    return null;
  }
  if (context.asOfMs - prior.selectedAtMs >= MIN_STRATEGY_HOLD_TIME_MS) {
    return null;
  }
  if (selected.score - prior.score >= MIN_STRATEGY_SWITCH_DELTA) {
    return null;
  }
  const incumbent = candidates.find(
    (candidate) => candidate.strategyId === prior.strategyId && candidate.eligible && candidate.action === prior.action,
  );
  if (!incumbent || incumbent.score < MIN_SELECTION_SCORE) {
    return null;
  }
  return incumbent;
}

function emptyDecision(candidates: readonly StrategyCandidate[]): ArbitrationDecisionKind {
  if (candidates.length === 0) {
    return "NO_OPPORTUNITY";
  }
  const dataFailure = candidates.every(
    (candidate) => candidate.candidateStatus === "STALE" || candidate.candidateStatus === "INSUFFICIENT_DATA",
  );
  if (dataFailure) {
    return candidates.some((candidate) => candidate.candidateStatus === "STALE") ? "DATA_BLOCKED" : "INSUFFICIENT_EVIDENCE";
  }
  const thin = candidates.some((candidate) =>
    ["Regime is incompatible.", "Session is incompatible.", "Signal strength is below the minimum.", "Required features are missing."].includes(
      candidate.rejectionReason ?? "",
    ),
  );
  return thin ? "INSUFFICIENT_EVIDENCE" : "NO_OPPORTUNITY";
}

function emptyReason(decision: ArbitrationDecisionKind, candidates: readonly StrategyCandidate[]): string {
  if (decision === "DATA_BLOCKED") {
    return "Every strategy was blocked by data quality.";
  }
  if (decision === "INSUFFICIENT_EVIDENCE") {
    return candidates.find((candidate) => candidate.rejectionReason)?.rejectionReason ?? "Evidence was not sufficient.";
  }
  return "No strategy produced a selection signal.";
}

function markStatuses(
  candidates: readonly StrategyCandidate[],
  decision: ArbitrationDecisionKind,
  selected: StrategyCandidate | null,
  conflicts: readonly StrategyConflict[],
): StrategyCandidate[] {
  const conflicted = new Set(conflicts.flatMap((conflict) => [conflict.leftStrategyId, conflict.rightStrategyId]));
  return candidates.map((candidate) => {
    if (!candidate.eligible) {
      return candidate;
    }
    if (decision === "CONFLICT" && conflicted.has(candidate.strategyId)) {
      return { ...candidate, candidateStatus: "CONFLICTED", components: { ...candidate.components, conflictPenalty: 0.25 } };
    }
    if (selected && candidate.strategyId === selected.strategyId && (decision === "SELECT_STRATEGY" || decision === "MULTI_STRATEGY_CONFIRMATION")) {
      return { ...candidate, candidateStatus: "SELECTED" };
    }
    if (decision === "MULTI_STRATEGY_CONFIRMATION" && selected && candidate.action === selected.action) {
      return { ...candidate, candidateStatus: "CONFIRMING" };
    }
    return { ...candidate, candidateStatus: "ELIGIBLE" };
  });
}

function buildEvidence(
  decision: ArbitrationDecisionKind,
  selected: StrategyCandidate | null,
  supports: readonly string[],
  penalties: readonly string[],
  candidates: readonly StrategyCandidate[],
): ArbitrationEvidence {
  const rejected = candidates
    .filter((candidate) => !candidate.eligible && candidate.rejectionReason)
    .map((candidate) => ({
      strategyId: candidate.strategyId,
      strategyName: candidate.strategyName,
      reason: candidate.rejectionReason ?? "Rejected.",
    }));
  const summary =
    decision === "SELECT_STRATEGY"
      ? `Select ${selected?.strategyName ?? "strategy"}. Candidate action ${selected?.action ?? "—"}.`
      : decision === "MULTI_STRATEGY_CONFIRMATION"
        ? `Multiple strategies agree on ${selected?.action ?? "the same action"}.`
        : decision === "CONFLICT"
          ? "Strategies conflict. Resolution: NO ACTION."
          : decision === "DATA_BLOCKED"
            ? "Data blocked. No strategy is selected."
            : decision === "INSUFFICIENT_EVIDENCE"
              ? "Evidence is not sufficient to select a strategy."
              : "No opportunity. No strategy is selected.";
  return { summary, supports, penalties, rejected };
}

function applyHistoricalHealth(base: number, memory: HistoricalHealthInput | undefined): number {
  if (!memory) {
    return base;
  }
  return Math.round(base * historicalFactor(memory.status, memory.sample) * 10_000) / 10_000;
}

function healthOf(evaluation: StrategyEvaluation): StrategyHealth {
  const dataFailure = evaluation.evaluation === "INSUFFICIENT_DATA" || evaluation.evaluation === "STALE_DATA";
  return {
    strategyId: evaluation.signalStrategyId,
    status: evaluation.status,
    recentEvaluations: 1,
    validSignals: evaluation.evaluation === "SIGNAL" ? 1 : 0,
    failedEvaluations: evaluation.evaluation === "NO_SIGNAL" ? 1 : 0,
    dataFailures: dataFailure ? 1 : 0,
  };
}

function statusFor(reason: string, evaluation: StrategyEvaluation): CandidateStatus {
  if (evaluation.evaluation === "STALE_DATA" || reason === "Stale data.") {
    return "STALE";
  }
  if (evaluation.evaluation === "INSUFFICIENT_DATA" || reason === "Insufficient data.") {
    return "INSUFFICIENT_DATA";
  }
  return "REJECTED";
}

function byScore(left: StrategyCandidate, right: StrategyCandidate): number {
  return right.score - left.score || left.strategyId.localeCompare(right.strategyId);
}
