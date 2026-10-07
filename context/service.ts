import { arbitrationViewFromContext } from "@/context/arbitration-view";
import { fuseContext, type FusionInput } from "@/context/fusion";
import { SOURCES } from "@/context/sources";
import { readContextPrior, selectionTransition, writeContextPrior, type ContextPrior } from "@/context/transitions";
import { BLANK_POSITION_MEMORY, type ExternalSignalReading, type KAIROSContext, type PositionSliceValue, type SecuritySliceValue, type TimelineEntry } from "@/context/types";
import type { ArbitrationDecision } from "@/domain/arbitration";
import type { Candle } from "@/domain/candle";
import { asAgentId, asUserId } from "@/domain/ids";
import { formatDecimal, mul, parseDecimal } from "@/domain/money";
import type { ObservationRow, SignalView } from "@/domain/observation";
import { realizedLossToday, summarizePortfolio, valuePosition } from "@/domain/portfolio";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { localPaperSession } from "@/paper/session";
import { DEFAULT_PAPER_POLICY } from "@/paper/policy";
import { positionPolicyFor } from "@/position/policy";
import type { DataQuality } from "@/domain/quality";
import type { RegimeAssessment } from "@/domain/regime";
import { formatClock } from "@/lib/format";
import { listStrategyCandidates } from "@/lifecycle/candidates";
import { strategyMemory } from "@/lifecycle/store";
import { readPaperBook } from "@/paper/store";
import { researchStore } from "@/research/store";
import { readAssetIntelligence } from "@/skills/store";
import type { ExternalSignal, TokenSecurityAssessment } from "@/skills/types";
import { assessSecurityGate } from "@/skills/security";
import type { UnderlyingEventRead } from "@/events/model";
import { readCachedUnderlyingEvents } from "@/events/service";

const HISTORY_BAR_MS = 15 * 60 * 1000;

export function buildObservationContext(input: {
  userId: string;
  agentId: string;
  cycleId: string;
  nowMs: number;
  watchlist: readonly string[];
  row: ObservationRow;
  candles: readonly Candle[];
  signals: readonly SignalView[];
  regime: RegimeAssessment;
  dataQuality: DataQuality;
  versions: Readonly<Record<string, string>>;
}): KAIROSContext {
  const prior = readContextPrior(input.userId, input.row.representationId);
  const underlyingEvents = readCachedUnderlyingEvents({
    ticker: input.row.ticker,
    nowMs: input.nowMs,
    fidelity: input.row.fidelity,
  });
  const context = fuseContext(toFusionInput(input, prior, underlyingEvents));
  if (context.validation.ok) {
    writeContextPrior(input.userId, input.row.representationId, {
      session: input.row.session,
      regime: input.regime.regime,
      referenceFreshness: context.reference.freshness,
      selectedStrategy: prior?.selectedStrategy ?? null,
      selectedAction: prior?.selectedAction ?? null,
      opportunity: context.opportunity.state,
    });
  }
  return context;
}

/** Records a strategy-selection change after arbitration. The first selection is stored and is not an event. */
export function noteStrategySelection(context: KAIROSContext, decision: ArbitrationDecision | null): KAIROSContext {
  const prior = readContextPrior(context.userId, context.assetId);
  const strategyId = decision?.selectedStrategy ?? null;
  const action = decision?.selectedAction ?? null;
  const transition = selectionTransition({
    at: context.timestamp,
    prior,
    strategyId,
    action,
  });
  const next: ContextPrior = {
    session: prior?.session ?? context.session.value?.session ?? null,
    regime: prior?.regime ?? context.regime.value?.regime ?? null,
    referenceFreshness: prior?.referenceFreshness ?? context.reference.freshness,
    selectedStrategy: strategyId,
    selectedAction: action,
    opportunity: prior?.opportunity ?? context.opportunity.state,
  };
  writeContextPrior(context.userId, context.assetId, next);
  if (!transition) {
    return context;
  }
  const entry: TimelineEntry = {
    id: `tl:${context.timestamp}:selection:${transition.from}:${transition.to}`,
    at: context.timestamp,
    clock: formatClock(context.timestamp).slice(0, 5),
    label: transition.label,
    detail: `${transition.from} → ${transition.to}`,
    origin: context.market.value?.fidelity === "paper" ? "MOCK" : "REAL",
  };
  return {
    ...context,
    transitions: [...context.transitions, transition],
    timeline: [...context.timeline, entry],
  };
}

export function observationArbitrationView(context: KAIROSContext, nowMs: number) {
  return arbitrationViewFromContext(context, nowMs);
}

function toFusionInput(
  input: {
    userId: string;
    agentId: string;
    cycleId: string;
    nowMs: number;
    watchlist: readonly string[];
    row: ObservationRow;
    candles: readonly Candle[];
    signals: readonly SignalView[];
    regime: RegimeAssessment;
    dataQuality: DataQuality;
    versions: Readonly<Record<string, string>>;
  },
  prior: ContextPrior | null,
  underlyingEvents: UnderlyingEventRead,
): FusionInput {
  const intelligence = readAssetIntelligence(input.userId, input.row.representationId);
  const latest = input.candles.at(-1) ?? null;
  const position = readPosition(input.userId, input.agentId, input.row, input.nowMs);
  const theses = researchStore()
    .listTheses(asUserId(input.userId))
    .filter((thesis) => thesis.userId === input.userId && thesis.assetId === input.row.representationId)
    .map((thesis) => ({
      thesisId: thesis.thesisId,
      title: thesis.title,
      status: thesis.status,
      source: thesis.provenance.provider.toLowerCase().includes("qwen") ? SOURCES.QWEN : SOURCES.KAIROS_RESEARCH,
    }));
  const candidates = listStrategyCandidates(input.userId).map((candidate) => ({
    candidateId: candidate.candidateId,
    status: candidate.status,
  }));
  const health = input.signals.map((signal) => {
    const version = input.versions[signal.strategyId] ?? "1";
    const report = strategyMemory().getHealth(input.userId, signal.strategyId, version, "PAPER");
    return {
      strategyId: signal.strategyId,
      strategyVersion: version,
      status: report.status,
      sample: report.sampleState,
      sampleSize: report.sampleSize,
      expectancy: report.expectancy,
      source: SOURCES.KAIROS_STRATEGY_HEALTH,
    };
  });
  const performance = strategyMemory()
    .list(input.userId, "PAPER")
    .filter((record) => record.context.assetId === null && record.context.regime === null && record.context.session === null)
    .map((record) => ({
      strategyId: record.strategyId,
      dataset: record.dataset,
      netPnL: record.netPnL,
      tradeCount: record.tradeCount,
    }));
  const tokenized = tokenizedStatus(input.row, input.nowMs);
  return {
    userId: input.userId,
    agentId: input.agentId,
    cycleId: input.cycleId,
    nowMs: input.nowMs,
    watchlist: input.watchlist,
    identity: {
      underlyingTicker: input.row.ticker,
      underlyingName: input.row.companyName,
      representationId: input.row.representationId,
      tokenSymbol: input.row.tokenSymbol,
      chainId: input.row.chainId ?? null,
      chainLabel: input.row.chainLabel,
      contractAddress: input.row.contractAddress,
    },
    fidelity: input.row.fidelity,
    marketFreshness: input.row.freshness === "SAMPLE" ? "SAMPLE" : input.row.freshness,
    marketAgeMs: input.row.ageMs,
    price: input.row.price,
    priceObservedAt: input.row.sourceTimestamp,
    receivedAt: input.row.receivedAt,
    session: input.row.session,
    sessionLabel: input.row.sessionLabel,
    rawMarketStatus: input.row.rawMarketStatus,
    referencePrice: input.row.referencePrice,
    referenceObservedAt: input.row.referenceObservedAt ?? input.row.sourceTimestamp,
    deviationPct: input.row.deviationPct,
    historyPoints: input.candles.length,
    historyTimestampsMs: input.candles.map((candle) => candle.timestampMs),
    historyLatestClose: latest ? formatDecimal(latest.close) : null,
    historyBarMs: HISTORY_BAR_MS,
    historySource: input.row.fidelity === "paper" ? SOURCES.PAPER_SAMPLE : SOURCES.BINANCE_MARKET_CANDLES,
    features: input.row.features.map((feature) => ({ id: feature.id, value: feature.value, sufficient: feature.sufficient })),
    regime: input.regime.regime,
    regimeDetail: input.regime.reasons[0] ?? null,
    regimeSufficient: input.regime.sufficient,
    dataQualityStatus: input.dataQuality.status,
    dataQualityHistoryPoints: input.dataQuality.historyPoints,
    dataQualityLatestAgeMs: input.dataQuality.latestAgeMs,
    dataQualityReferenceAgeMs: input.dataQuality.referenceAgeMs,
    dataQualityMissing: input.dataQuality.missingFields,
    signals: input.signals.map((signal) => ({
      strategyId: signal.strategyId,
      strategyName: signal.strategyName,
      version: input.versions[signal.strategyId] ?? "1",
      action: signal.action,
      evaluation: signal.evaluation,
      confidence: signal.confidence,
      timestamp: signal.timestamp,
      validUntil: signal.validUntil,
      source: SOURCES.KAIROS_STRATEGY_ENGINE,
    })),
    health,
    performance,
    externalRead: intelligence.signalRead.kind === "SKILL_ERROR" ? "ERROR" : intelligence.signals.length === 0 ? "ABSENT" : "PRESENT",
    externalError: intelligence.signalRead.kind === "SKILL_ERROR" ? intelligence.signalRead.message : null,
    externalSignals: intelligence.signals.map((signal) => toExternal(signal, input.nowMs)),
    security: securityValue(intelligence.security),
    securityObservedAt: intelligence.security?.checkedAt ?? null,
    securityEvents: intelligence.securityEvents.map((event) => ({
      eventType: event.eventType,
      status: event.status,
      effectiveTime: event.effectiveTime,
      source: event.source,
      assetId: event.assetId,
    })),
    tokenizedStatus: tokenized,
    position: position.position,
    positionConflict: position.conflict,
    researchTheses: theses,
    researchCandidates: candidates,
    prior,
    underlyingEvents,
  };
}

function tokenizedStatus(row: ObservationRow, nowMs: number): FusionInput["tokenizedStatus"] {
  if (row.fidelity === "paper") {
    return null;
  }
  if (row.rawMarketStatus === null && (row.reasonCode ?? null) === null && row.reasonMessage === null) {
    return null;
  }
  return {
    marketStatus: row.rawMarketStatus,
    reasonCode: row.reasonCode ?? null,
    reasonMsg: row.reasonMessage,
    openState: row.openState ?? null,
    nextOpenAt: row.nextOpenAt ?? null,
    observedAt: row.sourceTimestamp ?? new Date(nowMs).toISOString(),
    source: SOURCES.BINANCE_TOKENIZED_SECURITY,
  };
}

function securityValue(assessment: TokenSecurityAssessment | null): SecuritySliceValue | null {
  if (!assessment) {
    return null;
  }
  const gate = assessSecurityGate(assessment);
  const label = gate === "ELIGIBLE" ? "PASS" : gate === "BLOCK" ? "BLOCK" : "UNKNOWN";
  return {
    gate,
    label,
    riskLevel: assessment.riskLevel,
    riskLevelEnum: assessment.riskLevelEnum,
    chainId: assessment.chainId,
    contractAddress: assessment.contractAddress,
  };
}

function toExternal(signal: ExternalSignal, nowMs: number): ExternalSignalReading {
  const observed = Date.parse(signal.observedAt);
  return {
    id: signal.signalId ?? signal.rawSourceReference,
    provider: signal.provider,
    contract: signal.contractAddress,
    chainId: signal.chainId,
    direction: signal.direction,
    freshness: signal.freshness,
    signalAgeMs: Number.isFinite(observed) ? Math.max(0, nowMs - observed) : null,
    source: signal.source,
    relevance: "MAPPED",
    observedAt: signal.observedAt,
  };
}

function readPosition(
  userId: string,
  agentId: string,
  row: ObservationRow,
  nowMs: number,
): { position: PositionSliceValue | null; conflict: "USER" | "REPRESENTATION" | null } {
  let book: ReturnType<typeof readPaperBook>;
  try {
    book = readPaperBook(asUserId(userId), asAgentId(agentId));
  } catch {
    return { position: null, conflict: null };
  }
  if (!book) {
    return { position: emptyPosition(row.representationId), conflict: null };
  }
  if (book.account.userId !== userId || book.account.agentId !== agentId) {
    return { position: null, conflict: "USER" };
  }
  const held = book.account.positions.find((position) => position.assetSymbol === row.ticker);
  const risk = riskSnapshot(userId, book.account, nowMs);
  if (!held) {
    return { position: { ...emptyPosition(row.representationId), risk }, conflict: null };
  }
  if (held.userId !== userId) {
    return { position: null, conflict: "USER" };
  }
  const meta = book.metas.get(row.ticker);
  const represented = meta?.tokenizedRepresentationId ?? null;
  const paperId = `paper:${row.ticker}`;
  const sameRepresentation = represented === row.representationId || (represented === null && row.representationId === paperId);
  if (!sameRepresentation) {
    return { position: null, conflict: "REPRESENTATION" };
  }
  const mark = row.price ? safeDecimal(row.price) : held.currentPrice;
  const marked = { ...held, currentPrice: mark ?? held.currentPrice };
  const valued = valuePosition(marked);
  const lifecycle = meta?.lifecycle;
  const state = lifecycle === "BLOCKED" || lifecycle === "ADDING" || lifecycle === "REDUCING" || lifecycle === "CLOSING" ? lifecycle : "OPEN";
  return {
    position: {
      state,
      quantity: formatDecimal(held.quantity),
      averageEntry: formatDecimal(held.entryPrice),
      currentMark: formatDecimal(marked.currentPrice),
      unrealizedPnL: formatDecimal(valued.unrealizedPnl),
      notional: formatDecimal(mul(marked.currentPrice, held.quantity)),
      originStrategy: meta?.strategyId ?? held.strategyId,
      strategyVersion: meta?.strategyVersion ?? null,
      openedAt: meta?.openedAt ?? null,
      representationId: represented ?? row.representationId,
      positionId: held.id,
      correlationId: meta?.correlationId ?? null,
      addCount: meta?.addCount ?? 0,
      lastAddAt: meta?.lastAddAt ?? null,
      appliedReductions: meta?.appliedReductions ?? [],
      entry: meta?.entry ?? null,
      risk,
      lastDecision: meta?.lastDecision ?? null,
      lastDecisionAt: meta?.lastDecisionAt ?? null,
      reduceCount: meta?.reduceCount ?? 0,
      lastReduceAt: meta?.lastReduceAt ?? null,
      thesisState: meta?.thesisState ?? null,
      entryContextId: meta?.entryContextId ?? meta?.entry?.entryContextId ?? null,
      highestMark: meta?.highestMark ?? null,
      previousSnapshot: meta?.previousSnapshot ?? null,
      alternateStrategyId: meta?.alternateStrategyId ?? null,
      exitClass: meta?.exitClass ?? null,
      managementPolicy: positionPolicyFor(meta?.strategyId ?? held.strategyId)?.risk ?? null,
    },
    conflict: null,
  };
}

function emptyPosition(representationId: string): PositionSliceValue {
  return {
    state: "NO_POSITION",
    quantity: null,
    averageEntry: null,
    currentMark: null,
    unrealizedPnL: null,
    notional: null,
    originStrategy: null,
    strategyVersion: null,
    openedAt: null,
    representationId,
    positionId: null,
    correlationId: null,
    addCount: 0,
    lastAddAt: null,
    appliedReductions: [],
    entry: null,
    risk: null,
    ...BLANK_POSITION_MEMORY,
  };
}

function riskSnapshot(
  userId: string,
  account: NonNullable<ReturnType<typeof readPaperBook>>["account"],
  nowMs: number,
): PositionSliceValue["risk"] {
  const policy = userId === DEMO_USER_ID ? localPaperSession(userId)?.policy ?? null : null;
  const summary = summarizePortfolio(account);
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return {
    maxPositionNotional: policy ? formatDecimal(policy.maxPositionNotional) : null,
    maxAllocationBps: policy?.maxAllocationBps ?? null,
    equity: formatDecimal(summary.equity),
    invested: formatDecimal(summary.invested),
    dailyLossReached: policy ? realizedLossToday(account.trades, day) >= policy.maxDailyLoss : null,
    minimumTradeNotional: formatDecimal(DEFAULT_PAPER_POLICY.minimumTradeNotional),
  };
}

function safeDecimal(value: string) {
  try {
    return parseDecimal(value);
  } catch {
    return null;
  }
}
