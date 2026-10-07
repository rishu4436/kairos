import { binanceTokenizedSecurityEventProvider, isActive, marketEventsFromSecurity } from "@/context/events";
import { assessOpportunity } from "@/context/opportunity";
import type { EventProvider } from "@/context/providers";
import { SOURCES } from "@/context/sources";
import { correlateEvents } from "@/events/correlate";
import type { UnderlyingEventRead } from "@/events/model";
import { eventTradingPolicy } from "@/events/policy";
import { earningsMarketEvent, notConfiguredRead } from "@/events/project";
import { eventRisk } from "@/events/window";
import { summarizeContext } from "@/context/summary";
import { detectTransitions, type ContextPrior } from "@/context/transitions";
import type {
  AssetIdentity,
  Availability,
  ContextConflict,
  ContextFreshnessState,
  ContextQuality,
  ContextSlice,
  EarningsContextValue,
  NewsContextValue,
  EventOrigin,
  ExternalSignalReading,
  FeatureReading,
  KAIROSContext,
  MarketEvent,
  PositionSliceValue,
  Provenance,
  ResearchCandidateReading,
  ResearchThesisReading,
  SecurityEventReading,
  SecuritySliceValue,
  StrategyHealthReading,
  StrategyPerformanceReading,
  StrategySignalReading,
  TimelineEntry,
} from "@/context/types";
import { validateKairosContext } from "@/context/validate";
import { formatClock } from "@/lib/format";

const REFERENCE_DIVERGENCE_MS = 15 * 60 * 1000;
const HISTORY_GAP_BARS = 2;

export interface FusionInput {
  userId: string;
  agentId: string;
  cycleId: string;
  nowMs: number;
  watchlist: readonly string[];
  identity: AssetIdentity;
  fidelity: "live" | "paper";
  marketFreshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN" | "SAMPLE";
  marketAgeMs: number | null;
  price: string | null;
  priceObservedAt: string | null;
  receivedAt: string;
  session: string;
  sessionLabel: string;
  rawMarketStatus: string | null;
  referencePrice: string | null;
  referenceObservedAt: string | null;
  deviationPct: number | null;
  historyPoints: number;
  historyTimestampsMs: readonly number[];
  historyLatestClose: string | null;
  historyBarMs: number;
  historySource: string;
  features: readonly FeatureReading[];
  regime: string;
  regimeDetail: string | null;
  regimeSufficient: boolean;
  dataQualityStatus: string;
  dataQualityHistoryPoints: number;
  dataQualityLatestAgeMs: number | null;
  dataQualityReferenceAgeMs: number | null;
  dataQualityMissing: readonly string[];
  signals: readonly StrategySignalReading[];
  health: readonly StrategyHealthReading[];
  performance: readonly StrategyPerformanceReading[];
  /** ABSENT and ERROR are not a successful empty read. */
  externalRead: "ABSENT" | "ERROR" | "PRESENT";
  externalError: string | null;
  externalSignals: readonly ExternalSignalReading[];
  /** Null when no assessment was stored. */
  security: SecuritySliceValue | null;
  securityObservedAt: string | null;
  securityEvents: readonly SecurityEventReading[];
  tokenizedStatus: {
    marketStatus: string | null;
    reasonCode: string | null;
    reasonMsg: string | null;
    openState: boolean | null;
    nextOpenAt: string | null;
    observedAt: string | null;
    source: string;
  } | null;
  /** Null when the ledger was not read. A read with nothing open is NO_POSITION. */
  position: PositionSliceValue | null;
  positionConflict: "USER" | "REPRESENTATION" | null;
  researchTheses: readonly ResearchThesisReading[];
  researchCandidates: readonly ResearchCandidateReading[];
  prior: ContextPrior | null;
  eventProvider?: EventProvider;
  /** Pre-read underlying events. Omitted means the earnings and news providers are not configured. */
  underlyingEvents?: UnderlyingEventRead | null;
}

/** Pure given the input, including the prior snapshot. It does not read the network or a wallet. */
export function fuseContext(input: FusionInput): KAIROSContext {
  const timestamp = new Date(input.nowMs).toISOString();
  const conflicts: ContextConflict[] = [];
  const marketFreshness = toFreshness(input.marketFreshness);
  const marketStatus = input.price === null || input.price.trim().length === 0 ? "UNAVAILABLE" : input.marketFreshness === "STALE" ? "STALE" : "AVAILABLE";
  const reference = referenceSlice(input, conflicts);
  const history = historySlice(input, conflicts);
  const signals = signalSlice(input);
  const external = externalSlice(input, conflicts);
  const security = securitySlice(input, conflicts);
  const underlying = input.underlyingEvents ?? notConfiguredRead(input.identity.underlyingTicker, timestamp, eventTradingPolicy(input.fidelity));
  const events = eventSlice(input, conflicts, underlying);
  const news = newsSlice(underlying);
  const earnings = earningsSlice(underlying, events.value?.events ?? []);
  const position = positionSlice(input, timestamp, conflicts);
  const research = researchSlice(input);
  const candidates = candidateSlice(input);
  const health = healthSlice(input);
  const performance = performanceSlice(input);
  const features = featureSlice(input, timestamp);
  const regime = regimeSlice(input, timestamp);
  const session = sessionSlice(input, timestamp);
  if (!input.watchlist.includes(input.identity.underlyingTicker)) {
    conflicts.push({
      code: "WATCHLIST_EXCLUDED",
      severity: "BLOCKING",
      message: "The asset is outside this user's watchlist. No context is shared across users.",
    });
  }
  const quality = classifyQuality({
    marketStatus,
    marketFreshness,
    dataQualityStatus: input.dataQualityStatus,
    externalStatus: external.status,
    externalFreshness: external.freshness,
    referenceFreshness: reference.freshness,
    historyFreshness: history.freshness,
    securityFreshness: security.freshness,
    eventsFreshness: events.freshness,
    securityLabel: security.value?.label ?? "UNKNOWN",
    conflicts,
  });
  const externalAbsence: KAIROSContext["externalAbsence"] =
    input.externalRead === "ERROR" ? "SOURCE_ERROR" : input.externalRead === "ABSENT" ? "SOURCE_UNAVAILABLE" : "NONE";
  const opportunity = assessOpportunity({
    nowMs: input.nowMs,
    marketBlocked: quality === "BLOCKED",
    securityLabel: security.value?.label ?? "UNKNOWN",
    signals: signals.value?.signals ?? [],
    externalFreshness: external.freshness,
    healthInsufficient: (health.value?.reports ?? []).length > 0 && (health.value?.reports ?? []).every((report) => report.sampleSize > 0 && report.status === "INSUFFICIENT_DATA"),
    fidelity: input.fidelity,
    position: position.value
      ? { state: position.value.state, lastDecision: position.value.lastDecision, quantity: position.value.quantity }
      : null,
    tradingRestriction: earnings.value?.eventRisk.corporateRestrictionActive === true,
    eventWindow: earnings.value?.window ?? null,
  });
  const transitions = detectTransitions({
    at: timestamp,
    prior: input.prior,
    session: input.session,
    regime: input.regime,
    referenceFreshness: reference.freshness,
    opportunity: opportunity.state,
  });
  conflicts.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
  const origin: EventOrigin = input.fidelity === "paper" ? "MOCK" : "REAL";
  const timeline = buildTimeline({
    at: timestamp,
    origin,
    transitions,
    events: events.value?.events ?? [],
    signals: external.value?.signals ?? [],
    eventsAnswered: events.value?.providerAnswered === true,
    conflicts,
    news,
    earnings,
    position: position.value,
  });
  const draft = {
    contextId: `ctx:${input.userId}:${input.identity.representationId}:${input.cycleId}`,
    cycleId: input.cycleId,
    userId: input.userId,
    agentId: input.agentId,
    assetId: input.identity.representationId,
    timestamp,
    snapshotTimestamp: timestamp,
    sourceTimestamps: {
      market: input.priceObservedAt,
      reference: input.referenceObservedAt,
      history: history.provenance.observedAt,
      externalSignals: newest(external.value?.signals.map((signal) => signal.observedAt) ?? []),
      security: input.securityObservedAt,
      events: newest((events.value?.events ?? []).map((event) => event.observedAt)),
      position: position.provenance.observedAt,
    },
    identity: input.identity,
    watchlist: [...input.watchlist],
    market: slice(marketStatus, marketFreshness, input.fidelity === "paper" ? SOURCES.PAPER_SAMPLE : SOURCES.BINANCE_RWA_API, input.priceObservedAt, input.priceObservedAt, marketStatus === "UNAVAILABLE" ? null : {
      price: input.price ?? "",
      session: input.session,
      sessionLabel: input.sessionLabel,
      rawMarketStatus: input.rawMarketStatus,
      fidelity: input.fidelity,
    }, marketStatus === "UNAVAILABLE" ? "Market price was not supplied." : marketStatus === "STALE" ? "Market price is stale." : null),
    reference,
    history,
    features,
    regime,
    session,
    dataQuality: slice(
      input.dataQualityStatus === "INSUFFICIENT" ? "INSUFFICIENT" : input.dataQualityStatus === "STALE" ? "STALE" : "AVAILABLE",
      marketFreshness,
      SOURCES.KAIROS_FEATURE_ENGINE,
      input.priceObservedAt,
      input.priceObservedAt,
      {
        status: input.dataQualityStatus,
        historyPoints: input.dataQualityHistoryPoints,
        latestAgeMs: input.dataQualityLatestAgeMs,
        referenceAgeMs: input.dataQualityReferenceAgeMs,
        missingFields: [...input.dataQualityMissing],
      },
      null,
    ),
    strategySignals: signals,
    strategyHealth: health,
    strategyPerformance: performance,
    externalSignals: external,
    tokenSecurity: security,
    securityEvents: securityEventSlice(input, timestamp),
    researchContext: research,
    researchCandidates: candidates,
    positionContext: position,
    eventContext: events,
    newsContext: news,
    earningsContext: earnings,
    freshness: {
      market: marketFreshness,
      reference: reference.freshness,
      history: history.freshness,
      externalSignals: external.freshness,
      security: security.freshness,
      events: events.freshness,
      position: position.freshness,
    },
    quality,
    conflicts,
    opportunity,
    transitions,
    timeline,
    walletAccess: false as const,
    createsOrders: false as const,
    externalAbsence,
  };
  const summary = summarizeContext(draft);
  const context: KAIROSContext = { ...draft, ...summary, validation: { ok: false, admitsArbitration: false, reasons: [] } };
  const validated = validateKairosContext(context, input.nowMs);
  const blocking = conflicts.some((conflict) => conflict.severity === "BLOCKING");
  context.validation = {
    ok: validated.ok && !blocking,
    admitsArbitration: validated.ok && !blocking && quality !== "BLOCKED",
    reasons: validated.reasons,
  };
  return context;
}

function referenceSlice(input: FusionInput, conflicts: ContextConflict[]): ContextSlice<{ referencePrice: string; deviationPct: number | null }> {
  if (input.referencePrice === null || input.referencePrice.trim().length === 0) {
    return missing("Reference price was not supplied.");
  }
  const priceAt = input.priceObservedAt === null ? null : Date.parse(input.priceObservedAt);
  const referenceAt = input.referenceObservedAt === null ? null : Date.parse(input.referenceObservedAt);
  if (priceAt !== null && referenceAt !== null && Number.isFinite(priceAt) && Number.isFinite(referenceAt) && Math.abs(priceAt - referenceAt) > REFERENCE_DIVERGENCE_MS) {
    conflicts.push({
      code: "REFERENCE_TIMESTAMP_DIVERGENCE",
      severity: "DEGRADE",
      message: "Reference timestamp is much older or newer than the token price. Neither source was discarded.",
    });
  }
  const freshness = input.referenceObservedAt === null ? toFreshness(input.marketFreshness) : ageFreshness(referenceAt, input.nowMs);
  return slice(
    freshness === "STALE" ? "STALE" : "AVAILABLE",
    freshness,
    input.fidelity === "paper" ? SOURCES.PAPER_SAMPLE : SOURCES.BINANCE_RWA_API,
    input.referenceObservedAt,
    input.referenceObservedAt,
    { referencePrice: input.referencePrice, deviationPct: input.deviationPct },
    null,
  );
}

function historySlice(input: FusionInput, conflicts: ContextConflict[]): ContextSlice<{ points: number; latestTimestampMs: number | null; latestClose: string | null }> {
  if (input.historyPoints <= 0) {
    return missing("No candle history was supplied.");
  }
  const stamps = [...input.historyTimestampsMs].filter((stamp) => Number.isFinite(stamp)).sort((left, right) => left - right);
  const bar = input.historyBarMs > 0 ? input.historyBarMs : 15 * 60 * 1000;
  for (let index = 1; index < stamps.length; index += 1) {
    if (stamps[index]! - stamps[index - 1]! > bar * HISTORY_GAP_BARS) {
      conflicts.push({
        code: "HISTORY_TIMESTAMP_GAP",
        severity: "DEGRADE",
        message: "Candle history has a timestamp gap. The series was not rewritten.",
      });
      break;
    }
  }
  const latest = stamps.at(-1) ?? null;
  const observedAt = latest === null ? null : new Date(latest).toISOString();
  const freshness = ageFreshness(latest, input.nowMs);
  return slice(
    "AVAILABLE",
    freshness,
    input.historySource,
    observedAt,
    observedAt,
    { points: input.historyPoints, latestTimestampMs: latest, latestClose: input.historyLatestClose },
    null,
  );
}

function signalSlice(input: FusionInput): ContextSlice<{ signals: readonly StrategySignalReading[] }> {
  if (input.signals.length === 0) {
    return missing("No strategy signal was evaluated for this cycle.");
  }
  const observedAt = input.signals[0]?.timestamp ?? null;
  return slice("AVAILABLE", toFreshness(input.marketFreshness), SOURCES.KAIROS_STRATEGY_ENGINE, observedAt, observedAt, { signals: input.signals }, null);
}

function externalSlice(input: FusionInput, conflicts: ContextConflict[]): ContextSlice<{ signals: readonly ExternalSignalReading[] }> {
  if (input.externalRead === "ERROR") {
    return missing(input.externalError ?? "External signal read failed.");
  }
  if (input.externalRead === "ABSENT") {
    return missing("No external signal read is stored for this asset.");
  }
  const signals = input.externalSignals.map((signal) => ({ ...signal, relevance: relevanceOf(signal, input.identity) }));
  for (const signal of signals) {
    if (signal.relevance === "MISMATCH") {
      conflicts.push({
        code: "EXTERNAL_CONTRACT_MISMATCH",
        severity: "DEGRADE",
        message: `External signal ${signal.id} references a different chain or contract. It was not merged into this representation.`,
      });
    }
  }
  const usable = signals.filter((signal) => signal.relevance === "MAPPED");
  const freshness = worstFreshness(usable.map((signal) => signal.freshness));
  const status: Availability = usable.length > 0 && freshness === "STALE" ? "STALE" : "AVAILABLE";
  const observedAt = newest(signals.map((signal) => signal.observedAt));
  return slice(status, freshness, SOURCES.BINANCE_TRADING_SIGNAL, observedAt, observedAt, { signals }, null);
}

function securitySlice(input: FusionInput, conflicts: ContextConflict[]): ContextSlice<SecuritySliceValue> {
  if (input.security === null) {
    conflicts.push({
      code: "SECURITY_UNAVAILABLE",
      severity: "DEGRADE",
      message: "Token security was not assessed. The state is UNKNOWN.",
    });
    return slice(
      "UNAVAILABLE",
      "UNKNOWN",
      null,
      null,
      null,
      { gate: "NOT_EVALUATED", label: "UNKNOWN", riskLevel: null, riskLevelEnum: null, chainId: null, contractAddress: null },
      "No token security assessment is stored.",
    );
  }
  if (input.identity.chainId && input.security.chainId && input.identity.chainId !== input.security.chainId) {
    conflicts.push({ code: "CHAIN_MISMATCH", severity: "BLOCKING", message: "Token security chain does not match this representation." });
  }
  if (
    input.identity.contractAddress &&
    input.security.contractAddress &&
    input.identity.contractAddress.toLowerCase() !== input.security.contractAddress.toLowerCase()
  ) {
    conflicts.push({ code: "CHAIN_MISMATCH", severity: "BLOCKING", message: "Token security contract does not match this representation." });
  }
  const freshness = ageFreshness(input.securityObservedAt === null ? null : Date.parse(input.securityObservedAt), input.nowMs);
  if (input.security.gate === "ELIGIBLE" || input.security.gate === "BLOCK") {
    return slice("AVAILABLE", freshness, input.security.label === "PASS" || input.security.gate === "BLOCK" ? SOURCES.BINANCE_TOKEN_AUDIT : SOURCES.BINANCE_TOKEN_AUDIT, input.securityObservedAt, input.securityObservedAt, input.security, null);
  }
  conflicts.push({
    code: "SECURITY_UNAVAILABLE",
    severity: "DEGRADE",
    message: "Token security was returned as unavailable. It was not treated as a pass.",
  });
  return slice("UNAVAILABLE", freshness, SOURCES.BINANCE_TOKEN_AUDIT, input.securityObservedAt, input.securityObservedAt, input.security, "Token security assessment is unavailable.");
}

function eventSlice(
  input: FusionInput,
  conflicts: ContextConflict[],
  underlying: UnderlyingEventRead,
): ContextSlice<{ providerAnswered: boolean; events: readonly MarketEvent[] }> {
  const provider = input.eventProvider ?? binanceTokenizedSecurityEventProvider;
  const read = provider.read({
    assetId: input.identity.representationId,
    ticker: input.identity.underlyingTicker,
    nowMs: input.nowMs,
    tokenizedStatus: input.tokenizedStatus,
  });
  const extra = marketEventsFromSecurity(input.securityEvents, input.identity.representationId, input.nowMs);
  const earningsEvent = earningsMarketEvent({
    earnings: underlying.earnings,
    window: underlying.window,
    representationId: input.identity.representationId,
    policy: underlying.policy,
  });
  const merged = dedupeEvents([...read.events, ...extra, ...(earningsEvent ? [earningsEvent] : [])]);
  const expired = merged.filter((event) => !isActive(event, input.nowMs));
  for (const event of expired) {
    conflicts.push({
      code: "EVENT_EXPIRED",
      severity: "NOTE",
      message: `${event.type} expired at ${event.expiresAt} and is not an active event.`,
    });
  }
  const active = merged.filter((event) => isActive(event, input.nowMs));
  if (!read.providerAnswered && extra.length === 0 && !earningsEvent) {
    return missing(read.reason ?? "Event provider did not answer.");
  }
  const freshness = worstFreshness(active.map((event) => event.freshness));
  const observedAt = newest(active.map((event) => event.observedAt));
  const source = active.some((event) => event.source === SOURCES.FMP_EARNINGS) && !read.providerAnswered ? SOURCES.FMP_EARNINGS : SOURCES.BINANCE_TOKENIZED_SECURITY;
  return slice(active.some((event) => event.freshness === "STALE") && active.every((event) => event.freshness === "STALE") ? "STALE" : "AVAILABLE", freshness, source, observedAt, observedAt, {
    providerAnswered: true,
    events: active,
  }, active.length === 0 ? "The provider answered. No event is inside its effective window." : null);
}

function newsSlice(underlying: UnderlyingEventRead): ContextSlice<NewsContextValue> {
  if (underlying.newsReason === "NOT_CONFIGURED") {
    return slice<NewsContextValue>("UNAVAILABLE", "UNKNOWN", null, null, null, null, "NOT_CONFIGURED");
  }
  const value = {
    providerConnected: underlying.health.news === "CONNECTED",
    items: underlying.newsItems,
    historicalCount: underlying.newsHistoricalCount,
    health: underlying.health,
    cachedAt: underlying.cachedAt,
  };
  if (underlying.newsStatus === "UNAVAILABLE" || underlying.newsItems === null) {
    return slice("UNAVAILABLE", "UNKNOWN", SOURCES.FMP_NEWS, underlying.observedAt, underlying.cachedAt, value, underlying.newsReason);
  }
  const freshness = underlying.newsStatus === "STALE" ? "STALE" : newsFreshnessOf(underlying.newsItems);
  return slice(underlying.newsStatus === "STALE" ? "STALE" : "AVAILABLE", freshness, SOURCES.FMP_NEWS, underlying.observedAt, underlying.cachedAt, value, underlying.newsReason);
}

function earningsSlice(
  underlying: UnderlyingEventRead,
  events: readonly MarketEvent[],
): ContextSlice<EarningsContextValue> {
  if (underlying.earningsReason === "NOT_CONFIGURED") {
    return slice<EarningsContextValue>("UNAVAILABLE", "UNKNOWN", null, null, null, null, "NOT_CONFIGURED");
  }
  const restriction = events.some((event) => event.active && event.severity === "RESTRICTION" && event.source !== SOURCES.FMP_EARNINGS);
  const value = {
    event: underlying.earnings,
    window: underlying.window,
    policy: underlying.policy,
    eventRisk: eventRisk(underlying.window, restriction),
    correlations: correlateEvents({
      ticker: underlying.ticker,
      earnings: underlying.earnings,
      binanceEvents: events.filter((event) => event.source !== SOURCES.FMP_EARNINGS),
      policy: underlying.policy,
    }),
    health: underlying.health,
    cachedAt: underlying.cachedAt,
  };
  if (underlying.earningsStatus === "UNAVAILABLE") {
    return slice("UNAVAILABLE", "UNKNOWN", SOURCES.FMP_EARNINGS, underlying.observedAt, underlying.cachedAt, value, underlying.earningsReason);
  }
  return slice("AVAILABLE", "UNKNOWN", SOURCES.FMP_EARNINGS, underlying.observedAt, underlying.cachedAt, value, null);
}

function newsFreshnessOf(items: readonly { freshness: string }[]): ContextFreshnessState {
  if (items.length === 0) {
    return "UNKNOWN";
  }
  if (items.some((item) => item.freshness === "FRESH")) {
    return "FRESH";
  }
  if (items.some((item) => item.freshness === "RECENT" || item.freshness === "AGING")) {
    return "AGING";
  }
  return "STALE";
}

function positionSlice(input: FusionInput, timestamp: string, conflicts: ContextConflict[]): ContextSlice<PositionSliceValue> {
  if (input.positionConflict === "USER") {
    conflicts.push({ code: "POSITION_SCOPE_MISMATCH", severity: "BLOCKING", message: "The position belongs to a different user or agent." });
    return missing("Position scope does not match this context.");
  }
  if (input.positionConflict === "REPRESENTATION") {
    conflicts.push({
      code: "POSITION_REPRESENTATION_MISMATCH",
      severity: "DEGRADE",
      message: "The open position is not this tokenized representation. It was not merged.",
    });
    return missing("Position representation does not match this asset.");
  }
  if (input.position === null) {
    return missing("The position ledger was not read.");
  }
  return slice("AVAILABLE", "FRESH", SOURCES.KAIROS_PAPER_LEDGER, timestamp, input.position.openedAt, input.position, null);
}

function researchSlice(input: FusionInput): ContextSlice<{ theses: readonly ResearchThesisReading[]; candidates: readonly ResearchCandidateReading[] }> {
  if (input.researchTheses.length === 0 && input.researchCandidates.length === 0) {
    return missing("No research record is stored for this user and asset.");
  }
  return slice("AVAILABLE", "UNKNOWN", SOURCES.KAIROS_RESEARCH, null, null, { theses: input.researchTheses, candidates: input.researchCandidates }, null);
}

function candidateSlice(input: FusionInput): ContextSlice<{ candidates: readonly ResearchCandidateReading[] }> {
  if (input.researchCandidates.length === 0) {
    return missing("No research candidate is stored.");
  }
  return slice("AVAILABLE", "UNKNOWN", SOURCES.KAIROS_RESEARCH, null, null, { candidates: input.researchCandidates }, null);
}

function healthSlice(input: FusionInput): ContextSlice<{ reports: readonly StrategyHealthReading[] }> {
  if (input.health.length === 0) {
    return missing("Strategy health was not read.", "INSUFFICIENT");
  }
  return slice("AVAILABLE", "UNKNOWN", SOURCES.KAIROS_STRATEGY_HEALTH, null, null, { reports: input.health }, null);
}

function performanceSlice(input: FusionInput): ContextSlice<{ records: readonly StrategyPerformanceReading[] }> {
  if (input.performance.length === 0) {
    return missing("No measured performance is stored.", "INSUFFICIENT");
  }
  return slice("AVAILABLE", "UNKNOWN", SOURCES.KAIROS_STRATEGY_HEALTH, null, null, { records: input.performance }, null);
}

function featureSlice(input: FusionInput, timestamp: string): ContextSlice<{ features: readonly FeatureReading[] }> {
  if (input.features.length === 0) {
    return missing("Features were not computed.", "INSUFFICIENT");
  }
  return slice("AVAILABLE", toFreshness(input.marketFreshness), SOURCES.KAIROS_FEATURE_ENGINE, timestamp, timestamp, { features: input.features }, null);
}

function regimeSlice(input: FusionInput, timestamp: string): ContextSlice<{ regime: string; detail: string | null; sufficient: boolean }> {
  const value = { regime: input.regime, detail: input.regimeDetail, sufficient: input.regimeSufficient };
  if (!input.regimeSufficient) {
    return slice("INSUFFICIENT", toFreshness(input.marketFreshness), SOURCES.KAIROS_FEATURE_ENGINE, timestamp, timestamp, value, "Regime inputs were insufficient.");
  }
  return slice("AVAILABLE", toFreshness(input.marketFreshness), SOURCES.KAIROS_FEATURE_ENGINE, timestamp, timestamp, value, null);
}

function sessionSlice(input: FusionInput, timestamp: string): ContextSlice<{ session: string; label: string }> {
  if (input.session.trim().length === 0) {
    return missing("Session was not supplied.");
  }
  return slice("AVAILABLE", toFreshness(input.marketFreshness), input.fidelity === "paper" ? SOURCES.PAPER_SAMPLE : SOURCES.KAIROS_SESSION, input.priceObservedAt ?? timestamp, input.priceObservedAt, {
    session: input.session,
    label: input.sessionLabel,
  }, null);
}

function securityEventSlice(input: FusionInput, timestamp: string): ContextSlice<{ events: readonly SecurityEventReading[] }> {
  if (input.securityEvents.length === 0) {
    return missing("No security event is stored.");
  }
  return slice("AVAILABLE", "UNKNOWN", SOURCES.BINANCE_TOKENIZED_SECURITY, timestamp, timestamp, { events: input.securityEvents }, null);
}

function classifyQuality(input: {
  marketStatus: Availability;
  marketFreshness: ContextFreshnessState;
  dataQualityStatus: string;
  externalStatus: Availability;
  externalFreshness: ContextFreshnessState;
  referenceFreshness: ContextFreshnessState;
  historyFreshness: ContextFreshnessState;
  securityFreshness: ContextFreshnessState;
  eventsFreshness: ContextFreshnessState;
  securityLabel: string;
  conflicts: readonly ContextConflict[];
}): ContextQuality {
  if (input.marketStatus === "UNAVAILABLE" || input.marketStatus === "STALE" || input.marketFreshness === "STALE") {
    return "BLOCKED";
  }
  if (input.conflicts.some((conflict) => conflict.severity === "BLOCKING")) {
    return "BLOCKED";
  }
  if (input.dataQualityStatus === "STALE") {
    return "BLOCKED";
  }
  const optionalStale =
    input.externalStatus === "STALE" ||
    input.externalFreshness === "STALE" ||
    input.referenceFreshness === "STALE" ||
    input.historyFreshness === "STALE" ||
    input.securityFreshness === "STALE" ||
    input.eventsFreshness === "STALE";
  const degraded =
    input.marketFreshness === "AGING" ||
    input.marketFreshness === "UNKNOWN" ||
    input.dataQualityStatus === "DEGRADED" ||
    input.dataQualityStatus === "INSUFFICIENT" ||
    input.externalStatus === "UNAVAILABLE" ||
    optionalStale ||
    input.securityLabel !== "PASS" ||
    input.conflicts.some((conflict) => conflict.severity === "DEGRADE");
  return degraded ? "DEGRADED" : "GOOD";
}

function buildTimeline(input: {
  at: string;
  origin: EventOrigin;
  transitions: KAIROSContext["transitions"];
  events: readonly MarketEvent[];
  signals: readonly ExternalSignalReading[];
  eventsAnswered: boolean;
  conflicts: readonly ContextConflict[];
  news: KAIROSContext["newsContext"];
  earnings: KAIROSContext["earningsContext"];
  position: KAIROSContext["positionContext"]["value"];
}): TimelineEntry[] {
  const { at, origin, transitions, events, signals, eventsAnswered, conflicts, news, earnings, position } = input;
  const clock = formatClock(at).slice(0, 5);
  const rows: TimelineEntry[] = [];
  for (const transition of transitions) {
    rows.push({
      id: `tl:${at}:${transition.kind}:${transition.from}:${transition.to}`,
      at,
      clock,
      label: transition.label,
      detail: `${transition.from} → ${transition.to}`,
      origin,
      source: "KAIROS",
    });
  }
  const earningsEvent = earnings.value?.event;
  if (earnings.status === "AVAILABLE" && earningsEvent) {
    rows.push({
      id: `tl:fmp:${earningsEvent.eventId}`,
      at: earningsEvent.observedAt,
      clock: formatClock(earningsEvent.observedAt).slice(0, 5),
      label: "Earnings scheduled",
      detail: [earningsEvent.reportedDate, earningsEvent.reportTime, earningsEvent.status].filter(Boolean).join(" · "),
      origin: "REAL",
      source: "FMP",
    });
  }
  for (const item of news.value?.items ?? []) {
    rows.push({
      id: `tl:news:${item.newsId}`,
      at: item.publishedAt,
      clock: formatClock(item.publishedAt).slice(0, 5),
      label: item.headline,
      detail: item.publisher ?? item.provider,
      origin: "REAL",
      source: "News",
    });
  }
  for (const event of events) {
    if (event.source === SOURCES.FMP_EARNINGS) {
      continue;
    }
    rows.push({
      id: `tl:${event.eventId}`,
      at: event.observedAt,
      clock: formatClock(event.observedAt).slice(0, 5),
      label: event.semantics.interpreted ?? event.type,
      detail: event.semantics.detected,
      origin: event.origin,
      source: "Binance",
    });
  }
  for (const signal of signals) {
    if (signal.relevance !== "MAPPED" || !signal.direction) {
      continue;
    }
    const when = signal.observedAt ?? at;
    rows.push({
      id: `tl:signal:${signal.id}:${when}`,
      at: when,
      clock: formatClock(when).slice(0, 5),
      label: `Smart Money ${signal.direction} detected`,
      detail: `${signal.source ?? signal.provider} · ${signal.freshness}`,
      origin: "REAL",
      source: "KAIROS",
    });
  }
  for (const conflict of conflicts) {
    if (conflict.code !== "EVENT_EXPIRED") {
      continue;
    }
    rows.push({
      id: `tl:${at}:expired:${conflict.message}`,
      at,
      clock,
      label: "Event expired",
      detail: conflict.message,
      origin,
      source: "KAIROS",
    });
  }
  if (!eventsAnswered && earnings.status !== "AVAILABLE") {
    rows.push({
      id: `tl:${at}:events-unavailable`,
      at,
      clock,
      label: "Events unavailable",
      detail: "No event provider answered for this cycle. This is not an empty calendar.",
      origin: "UNAVAILABLE",
      source: "KAIROS",
    });
  }
  if (news.status !== "AVAILABLE" && news.status !== "STALE") {
    rows.push({
      id: `tl:${at}:news-unavailable`,
      at,
      clock,
      label: "News unavailable",
      detail: news.reason === "NOT_CONFIGURED"
        ? "FMP is not configured. Missing news is not the same as no news."
        : `News provider status ${news.reason ?? news.status}. This is not an empty headline list.`,
      origin: "UNAVAILABLE",
      source: "News",
    });
  }
  if (position?.lastDecision) {
    rows.push({
      id: `tl:${at}:position:${position.lastDecision}`,
      at: position.lastDecisionAt ?? at,
      clock: formatClock(position.lastDecisionAt ?? at).slice(0, 5),
      label: `Position decision ${position.lastDecision}`,
      detail: position.thesisState ?? position.state,
      origin,
      source: "KAIROS",
    });
  }
  return rows;
}

function relevanceOf(signal: ExternalSignalReading, identity: AssetIdentity): ExternalSignalReading["relevance"] {
  if (signal.contract && identity.contractAddress && signal.contract.toLowerCase() !== identity.contractAddress.toLowerCase()) {
    return "MISMATCH";
  }
  if (signal.chainId && identity.chainId && signal.chainId !== identity.chainId) {
    return "MISMATCH";
  }
  if (signal.contract && !identity.contractAddress) {
    return "MISMATCH";
  }
  return "MAPPED";
}

function dedupeEvents(events: readonly MarketEvent[]): MarketEvent[] {
  const seen = new Set<string>();
  const rows: MarketEvent[] = [];
  for (const event of events) {
    const key = `${event.source}|${event.assetId}|${event.type}|${event.reason ?? ""}|${event.status}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(event);
  }
  return rows;
}

function missing<T>(reason: string, status: Availability = "UNAVAILABLE", freshness: ContextFreshnessState = "UNKNOWN"): ContextSlice<T> {
  return { status, freshness, provenance: { source: null, observedAt: null, effectiveAt: null }, value: null, reason };
}

function slice<T>(status: Availability, freshness: ContextFreshnessState, source: string | null, observedAt: string | null, effectiveAt: string | null, value: T | null, reason: string | null): ContextSlice<T> {
  const provenance: Provenance = { source: status === "UNAVAILABLE" && value === null ? null : source, observedAt, effectiveAt };
  return { status, freshness, provenance, value, reason };
}

function toFreshness(value: FusionInput["marketFreshness"]): ContextFreshnessState {
  if (value === "SAMPLE") {
    return "UNKNOWN";
  }
  return value;
}

function ageFreshness(sourceMs: number | null, nowMs: number): ContextFreshnessState {
  if (sourceMs === null || !Number.isFinite(sourceMs)) {
    return "UNKNOWN";
  }
  const age = nowMs - sourceMs;
  if (age < -5_000) {
    return "UNKNOWN";
  }
  if (age < 30_000) {
    return "FRESH";
  }
  if (age < 120_000) {
    return "AGING";
  }
  return "STALE";
}

/** The least current class in the set. One stale value keeps the slice from looking fresh. */
function worstFreshness(values: readonly string[]): ContextFreshnessState {
  if (values.length === 0) {
    return "UNKNOWN";
  }
  const rank: Record<string, number> = { FRESH: 0, AGING: 1, UNKNOWN: 2, STALE: 3, EXPIRED: 4 };
  let worst = -1;
  let label: ContextFreshnessState = "UNKNOWN";
  for (const value of values) {
    const score = rank[value] ?? 2;
    if (score > worst) {
      worst = score;
      label = value === "EXPIRED" ? "STALE" : value === "FRESH" || value === "AGING" || value === "STALE" || value === "UNKNOWN" ? value : "UNKNOWN";
    }
  }
  return label;
}

function newest(values: readonly (string | null)[]): string | null {
  const parsed = values
    .filter((value): value is string => value !== null && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return parsed[0] ?? null;
}
