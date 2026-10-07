import {
  EXECUTABLE_CODE,
  isDslFeature,
  isDslOperator,
  isResearchRegime,
  isResearchSession,
  MAX_CONDITIONS,
  MAX_HOLDING_BARS,
  PRICE_VS_SMA,
  PROPOSAL_ACTIONS,
  RESEARCH_ASSETS,
  type DslCondition,
  type DslFeature,
} from "@/research/dsl";
import type { FalsifiableHypothesis, ResearchContext, ResearchThesis, StrategyProposal } from "@/research/types";

const CODE_PATTERN = EXECUTABLE_CODE;
const PREDICTION_AS_FACT = /\bwill\b|\bgoing to\b|\bguarantee|\bexpected to\b/i;

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

export function validateThesis(thesis: ResearchThesis): ValidationResult {
  const reasons: string[] = [];
  collectForbiddenInstructions({ title: thesis.title, summary: thesis.summary, hypothesis: thesis.hypothesis, observations: thesis.observations, assumptions: thesis.assumptions, supportingEvidence: thesis.supportingEvidence, contradictingEvidence: thesis.contradictingEvidence, requiredData: thesis.requiredData, invalidationConditions: thesis.invalidationConditions, riskConsiderations: thesis.riskConsiderations }, reasons);
  if (thesis.title.trim().length === 0) {
    reasons.push("Title is required.");
  }
  collectCode(thesis.title, "title", reasons);
  collectCode(thesis.summary, "summary", reasons);
  reasons.push(...hypothesisReasons(thesis.hypothesis));
  if (thesis.supportingEvidence.length === 0) {
    reasons.push("Supporting evidence is required.");
  }
  if (thesis.contradictingEvidence.length === 0) {
    reasons.push("Contradicting or missing evidence is required.");
  }
  for (const item of [...thesis.supportingEvidence, ...thesis.contradictingEvidence, ...thesis.observations]) {
    reasons.push(...evidenceReasons(item.kind, item.statement, item.source));
  }
  if (thesis.invalidationConditions.length === 0) {
    reasons.push("Invalidation conditions are required.");
  }
  if (!Number.isFinite(thesis.confidence) || thesis.confidence < 0 || thesis.confidence > 1) {
    reasons.push("Confidence must be between 0 and 1.");
  }
  if (thesis.requiredData.length === 0) {
    reasons.push("Required data must be named.");
  }
  return finish(reasons);
}

const UNSUPPORTED_FACT = /because earnings|earnings are|read the news|according to (the |a )?filing|\b10-k\b|\b10-q\b/i;
const NO_NEWS_CLAIM = /\bno news\b|there is no news|no relevant news|news calendar is empty/i;
const EARNINGS_RESULT = /actual eps|estimated eps|earnings date|earnings beat|earnings result|upcoming earnings/i;
const WHALE_CLAIM = /whales are buying|smart money (is|are) buying/i;
const GUARANTEED_RETURN = /guaranteed (to )?(profit|return|win)|will (definitely )?profit|future returns are certain/i;

export function unobservedWhaleClaim(statement: string, context: ResearchContext): boolean {
  if (!WHALE_CLAIM.test(statement)) {
    return false;
  }
  return !(context.externalSignals ?? []).some(
    (signal) => signal.source === "SMART_MONEY" && signal.direction === "BUY" && signal.freshness === "FRESH",
  );
}

export function validateEvidenceAgainstContext(thesis: ResearchThesis, context: ResearchContext): ValidationResult {
  const allowed = new Set<string>(["observation", "regime", "market_session", ...context.features.map((feature) => feature.id)]);
  const reasons: string[] = [];
  for (const item of [...thesis.observations, ...thesis.supportingEvidence, ...thesis.contradictingEvidence]) {
    if (item.kind !== "OBSERVED_FACT") {
      continue;
    }
    if (item.source === null || !allowed.has(item.source)) {
      reasons.push(`Observed fact source ${item.source ?? "missing"} was not in the supplied context.`);
    }
    if (newsOrEventUnsupported(item.statement, context)) {
      reasons.push("Observed fact cites news, earnings, or filings that were not in the context.");
    }
    if (PREDICTION_AS_FACT.test(item.statement)) {
      reasons.push("An observed fact cannot be a prediction.");
    }
  }
  const externalIds = new Set([
    ...(context.externalSignals ?? []).map((signal) => signal.id),
    ...(context.securityEvents ?? []).map((event) => event.id),
  ]);
  const eventIds = new Set(context.eventContext.events.map((event) => event.eventId));
  for (const item of [...thesis.observations, ...thesis.supportingEvidence, ...thesis.contradictingEvidence]) {
    if (item.kind === "OBSERVED_EXTERNAL_SIGNAL" && (item.source === null || !externalIds.has(item.source))) {
      reasons.push("Observed external signal source was not in the supplied context.");
    }
    if (item.kind === "OBSERVED_EVENT" && (item.source === null || !eventIds.has(item.source))) {
      reasons.push("Observed event source was not in the supplied context.");
    }
    if (item.kind === "OBSERVED_EVENT" && EARNINGS_RESULT.test(item.statement)) {
      reasons.push("An observed event cannot invent an earnings result, EPS, or earnings date.");
    }
    if (context.earningsContext.status === "UNAVAILABLE" && EARNINGS_RESULT.test(item.statement) && item.kind !== "OBSERVED_EVENT") {
      reasons.push("An earnings date or EPS figure was not in the context.");
    }
    if (context.newsContext.status !== "AVAILABLE" && NO_NEWS_CLAIM.test(item.statement)) {
      reasons.push("Missing news cannot be stated as no news.");
    }
    if (item.kind === "OBSERVED_NEWS") {
      const ids = new Set((context.newsContext.items ?? []).map((news) => news.newsId));
      if (item.source === null || !ids.has(item.source)) {
        reasons.push("Observed news source was not in the supplied context.");
      }
    }
    if (item.kind === "OBSERVED_EARNINGS") {
      const eventId = context.earningsContext.eventId;
      if (item.source === null || eventId === null || item.source !== eventId) {
        reasons.push("Observed earnings source was not in the supplied context.");
      }
      if (unknownFinancialClaim(item.statement, earningsFigures(context))) {
        reasons.push("An earnings date, EPS, or revenue figure was not in the context.");
      }
    }
    if (unobservedWhaleClaim(item.statement, context)) {
      reasons.push("The context does not contain a fresh Smart Money buy signal.");
    }
    if (GUARANTEED_RETURN.test(item.statement)) {
      reasons.push("Past performance is not a guaranteed future return.");
    }
    if (item.kind === "OBSERVED_HISTORICAL_RESULT") {
      const known = new Set((context.strategyHealth ?? []).map((row) => row.strategyId));
      if (item.source === null || !known.has(item.source)) {
        reasons.push("Historical result was not in the supplied context.");
      }
    }
  }
  return finish(reasons);
}

function earningsFigures(context: { earningsContext: { expectedEarningsDate: string | null; actualEps: string | null; estimatedEps: string | null; revenue: string | null; estimatedRevenue: string | null } }): string[] {
  return [
    context.earningsContext.expectedEarningsDate,
    context.earningsContext.actualEps,
    context.earningsContext.estimatedEps,
    context.earningsContext.revenue,
    context.earningsContext.estimatedRevenue,
  ].filter((value): value is string => value !== null && value.length > 0);
}

function unknownFinancialClaim(statement: string, known: readonly string[]): boolean {
  if (/earnings date|reported date/i.test(statement)) {
    const dates = statement.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    if (dates.some((date) => !known.includes(date))) {
      return true;
    }
  }
  if (/\beps\b|revenue/i.test(statement)) {
    const numbers = statement.match(/-?\d+(?:\.\d+)?/g) ?? [];
    if (numbers.some((number) => !known.includes(number))) {
      return true;
    }
  }
  return false;
}

export function validateProposal(proposal: StrategyProposal): ValidationResult {
  const reasons: string[] = [];
  collectForbiddenInstructions({ assetScope: proposal.assetScope, sessionScope: proposal.sessionScope, regimeScope: proposal.regimeScope, features: proposal.features, entryConditions: proposal.entryConditions, exitConditions: proposal.exitConditions, positionSizingHint: proposal.positionSizingHint, invalidationConditions: proposal.invalidationConditions, parameterSet: proposal.parameterSet }, reasons);
  if (!(PROPOSAL_ACTIONS as readonly string[]).includes(proposal.action)) {
    reasons.push("Action must be BUY, SELL, or OBSERVE.");
  }
  if (proposal.assetScope.length === 0) {
    reasons.push("Asset scope is required.");
  }
  for (const asset of proposal.assetScope) {
    if (!(RESEARCH_ASSETS as readonly string[]).includes(asset)) {
      reasons.push(`Unsupported asset ${asset}.`);
    }
  }
  if (proposal.sessionScope.length === 0) {
    reasons.push("Session scope is required.");
  }
  for (const session of proposal.sessionScope) {
    if (!isResearchSession(session)) {
      reasons.push(`Unknown session ${session}.`);
    }
  }
  if (proposal.regimeScope.length === 0) {
    reasons.push("Regime scope is required.");
  }
  for (const regime of proposal.regimeScope) {
    if (!isResearchRegime(regime)) {
      reasons.push(`Unknown regime ${regime}.`);
    }
  }
  if (!Number.isInteger(proposal.holdingPeriod) || proposal.holdingPeriod < 1 || proposal.holdingPeriod > MAX_HOLDING_BARS) {
    reasons.push("Holding period must be a positive number of 15-minute bars up to 96.");
  }
  if (proposal.invalidationConditions.length === 0) {
    reasons.push("Missing invalidation.");
  }
  for (const item of proposal.invalidationConditions) {
    collectCode(item, "invalidation", reasons);
  }
  const conditions = [...proposal.entryConditions, ...proposal.exitConditions];
  if (conditions.length === 0) {
    reasons.push("At least one condition is required.");
  }
  if (conditions.length > MAX_CONDITIONS) {
    reasons.push(`Condition count ${conditions.length} exceeds ${MAX_CONDITIONS}.`);
  }
  for (const condition of conditions) {
    reasons.push(...conditionReasons(condition));
  }
  for (const feature of proposal.features) {
    if (!isDslFeature(feature)) {
      reasons.push(`Unknown feature ${feature}.`);
    }
  }
  collectCode(proposal.positionSizingHint, "position sizing", reasons);
  collectCode(JSON.stringify(proposal.parameterSet), "parameters", reasons);
  return finish(reasons);
}

export function hypothesisReasons(hypothesis: FalsifiableHypothesis | null | undefined): string[] {
  const reasons: string[] = [];
  if (!hypothesis) {
    return ["Hypothesis must name conditions, session, windows, expected outcome, and invalidation."];
  }
  if (!Array.isArray(hypothesis.conditions) || hypothesis.conditions.length === 0 || hypothesis.conditions.some((item) => item.trim().length === 0)) {
    reasons.push("Hypothesis conditions are required.");
  }
  if (!isResearchSession(hypothesis.session)) {
    reasons.push("Hypothesis session is not a known session.");
  }
  if (!Number.isInteger(hypothesis.observationWindowBars) || hypothesis.observationWindowBars < 1) {
    reasons.push("Observation window must be a positive bar count.");
  }
  if (!Number.isInteger(hypothesis.testWindowBars) || hypothesis.testWindowBars < 1) {
    reasons.push("Test window must be a positive bar count.");
  }
  if (!/\d/.test(hypothesis.expectedOutcome ?? "")) {
    reasons.push("Expected outcome must include a numeric threshold.");
  }
  if (!hypothesis.invalidation || hypothesis.invalidation.trim().length === 0) {
    reasons.push("Hypothesis invalidation is required.");
  }
  collectCode(hypothesis.expectedOutcome ?? "", "expected outcome", reasons);
  collectCode(hypothesis.invalidation ?? "", "invalidation", reasons);
  return reasons;
}

function conditionReasons(condition: DslCondition): string[] {
  const reasons: string[] = [];
  if (!isDslFeature(condition.feature)) {
    reasons.push(`Unknown feature ${condition.feature}.`);
    return reasons;
  }
  if (!isDslOperator(condition.operator)) {
    reasons.push(`Unknown operator ${condition.operator}.`);
    return reasons;
  }
  if (condition.operator === "IN" && !Array.isArray(condition.threshold)) {
    reasons.push(`Operator IN on ${condition.feature} requires a list.`);
  }
  if (condition.operator !== "IN" && Array.isArray(condition.threshold)) {
    reasons.push(`Operator ${condition.operator} on ${condition.feature} does not take a list.`);
  }
  if (typeof condition.threshold === "number" && !Number.isFinite(condition.threshold)) {
    reasons.push(`Threshold for ${condition.feature} is not a finite number.`);
  }
  reasons.push(...thresholdDomain(condition.feature, condition.operator, condition.threshold));
  return reasons;
}

function thresholdDomain(feature: DslFeature, operator: string, threshold: DslCondition["threshold"]): string[] {
  const categorical = feature === "market_session" || feature === "regime" || (feature === "price_vs_sma20" && typeof threshold === "string");
  if (categorical && (operator === "GT" || operator === "GTE" || operator === "LT" || operator === "LTE" || operator === "CROSS_ABOVE" || operator === "CROSS_BELOW")) {
    return [`${feature} does not use ${operator}.`];
  }
  const values = Array.isArray(threshold) ? threshold : [threshold];
  const reasons: string[] = [];
  for (const value of values) {
    if (typeof value === "number") {
      continue;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      reasons.push(`Threshold for ${feature} is empty.`);
      continue;
    }
    collectCode(value, feature, reasons);
    if (feature === "market_session" && !isResearchSession(value)) {
      reasons.push(`Unknown session ${value}.`);
    }
    if (feature === "regime" && !isResearchRegime(value)) {
      reasons.push(`Unknown regime ${value}.`);
    }
    if (feature === "price_vs_sma20" && !(PRICE_VS_SMA as readonly string[]).includes(value)) {
      reasons.push(`Unknown price_vs_sma20 value ${value}.`);
    }
  }
  return reasons;
}

function evidenceReasons(kind: string, statement: string, source: string | null): string[] {
  const reasons: string[] = [];
  if (
    kind !== "OBSERVED_FACT" &&
    kind !== "OBSERVED_EVENT" &&
    kind !== "OBSERVED_EXTERNAL_SIGNAL" &&
    kind !== "OBSERVED_HISTORICAL_RESULT" &&
    kind !== "MODEL_INFERENCE" &&
    kind !== "HYPOTHESIS"
  ) {
    reasons.push("Evidence kind must be OBSERVED_FACT, OBSERVED_EVENT, OBSERVED_EXTERNAL_SIGNAL, OBSERVED_HISTORICAL_RESULT, MODEL_INFERENCE, or HYPOTHESIS.");
  }
  if (statement.trim().length === 0) {
    reasons.push("Evidence statement is empty.");
  }
  collectCode(statement, "evidence", reasons);
  if (kind === "OBSERVED_FACT" && (source === null || source.trim().length === 0)) {
    reasons.push("An observed fact requires a source id.");
  }
  if (kind === "OBSERVED_FACT" && source !== null && !isDslFeature(source) && source !== "observation") {
    reasons.push(`Observed fact source ${source} is not a known feature.`);
  }
  if (kind === "OBSERVED_EVENT" && (source === null || source.trim().length === 0)) {
    reasons.push("An observed event requires a source id.");
  }
  if (kind === "OBSERVED_EXTERNAL_SIGNAL" && (source === null || source.trim().length === 0)) {
    reasons.push("An observed external signal requires a source id.");
  }
  if (kind === "OBSERVED_HISTORICAL_RESULT" && (source === null || source.trim().length === 0)) {
    reasons.push("A historical result requires a strategy id.");
  }
  if (kind !== "OBSERVED_FACT" && kind !== "OBSERVED_EVENT" && kind !== "OBSERVED_EXTERNAL_SIGNAL" && kind !== "OBSERVED_HISTORICAL_RESULT" && source !== null) {
    reasons.push("Inference and hypothesis cannot carry an observed source.");
  }
  return reasons;
}

function collectCode(value: string, label: string, reasons: string[]): void {
  if (CODE_PATTERN.test(value)) {
    reasons.push(`Executable code is not allowed in ${label}.`);
  }
}

function collectForbiddenInstructions(value: unknown, reasons: string[]): void {
  if (typeof value === "string") {
    // Conservative bounded research policy; these operations have no place in model output.
    if (/\b(connect|unlock|fund|access)\s+(your\s+|the\s+|a\s+)?wallet\b|\b(sign|broadcast|execute|submit|place)\s+(a\s+|the\s+|this\s+)?(transaction|trade|order)s?\b|\b(override|disable|bypass)\s+(the\s+)?(risk|safety)\b/i.test(value)) {
      reasons.push("Wallet, execution, or risk override instructions are not allowed in research output.");
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectForbiddenInstructions(item, reasons);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectForbiddenInstructions(item, reasons);
  }
}

function newsOrEventUnsupported(statement: string, context: ResearchContext): boolean {
  if (!UNSUPPORTED_FACT.test(statement)) {
    return false;
  }
  if (context.newsContext.status === "AVAILABLE") {
    return false;
  }
  const mentionsEarnings = /earnings/i.test(statement);
  if (!mentionsEarnings) {
    return true;
  }
  return !context.eventContext.events.some((event) => event.type === "EARNINGS");
}

function finish(reasons: string[]): ValidationResult {
  return { ok: reasons.length === 0, reasons };
}
