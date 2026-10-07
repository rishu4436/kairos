import { decisionLabel } from "@/arbitration/labels";
import { STRATEGY_MIN_HISTORY } from "@/arbitration/policy";
import { StrategyArbitrator } from "@/arbitration/service";
import { formatDecimal } from "@/domain/money";
import type { Candle } from "@/domain/candle";
import type { StrategyEvaluation } from "@/domain/arbitration";
import type { AgentEventType } from "@/domain/events";
import type { ChartBar, FeatureView, ObservationBoard, ObservationEventView, ObservationRow, SignalView } from "@/domain/observation";
import type { AnalyticalSignal } from "@/domain/signal";
import { formatClock } from "@/lib/format";
import { buildStrategyContext } from "@/strategies/context";
import { createStrategyRegistry } from "@/strategies/catalog";
import type { IntelligenceStrategy } from "@/strategies/types";
import { buildObservationContext, noteStrategySelection, observationArbitrationView } from "@/context/service";
import { readCachedUnderlyingEvents } from "@/events/service";
import { paperResearchEvaluations, reviewShadowCandidates } from "@/lifecycle/universe";
import { readAssetIntelligence } from "@/skills/store";
import { buildBinanceIntelligenceView } from "@/skills/view";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { defaultOperatorConfig, type OperatorConfig } from "@/operator/config";

const arbitrator = new StrategyArbitrator();

export function enrichBoard(
  board: ObservationBoard,
  input: {
    candles: ReadonlyMap<string, readonly Candle[]>;
    asOfMs: number;
    historyHealth: ObservationBoard["health"]["history"];
    record?: (signal: SignalView) => void;
    strategies?: readonly IntelligenceStrategy[];
    operator?: OperatorConfig;
  },
): ObservationBoard {
  const operator = input.operator ?? defaultOperatorConfig();
  const allowedAssets = mandateAssets(operator);
  const strategies = (input.strategies ?? createStrategyRegistry().list()).filter((item) => {
    const id = item.metadata.id;
    if (id === "momentum") return operator.strategies.momentum.enabled;
    if (id === "mean-reversion") return operator.strategies["mean-reversion"].enabled;
    if (id === "weekend") return operator.strategies.weekend.enabled;
    if (id === "dca") return operator.strategies.dca.enabled;
    if (operator.mandate?.operatorMode === "MANUAL" && !operator.mandate.selectedManualStrategies.includes(id)) {
      return false;
    }
    return true;
  });
  const events = [...board.events];
  const recent: SignalView[] = [];
  const watchlist = [...new Set(board.rows.map((row) => row.ticker))];
  const cycleId = `cycle:${board.userId}:${new Date(input.asOfMs).toISOString()}`;
  const rows = board.rows.filter((row) => allowedAssets === null || allowedAssets.has(row.ticker)).map((row) => {
    const candles = input.candles.get(row.representationId) ?? [];
    const analysis = analyzeRow(row, candles, input.asOfMs, strategies, board.userId, watchlist, cycleId, operator);
    events.push(...analysis.events);
    for (const signal of analysis.signals) {
      recent.push(signal);
      input.record?.(signal);
    }
    return analysis.row;
  });
  return {
    ...board,
    rows,
    health: { ...board.health, history: input.historyHealth },
    events: events.slice(-200),
    recentEvaluations: recent.slice(-40),
  };
}

function mandateAssets(operator: OperatorConfig): Set<string> | null {
  if (operator.mandate?.operatorMode === "MANUAL") {
    return new Set(operator.mandate.selectedManualAssets);
  }
  if (operator.mandate?.operatorMode === "AUTO") {
    return new Set(operator.watchlist?.entries.map((entry) => entry.ticker) ?? []);
  }
  return null;
}

function analyzeRow(
  row: ObservationRow,
  candles: readonly Candle[],
  asOfMs: number,
  strategies: readonly IntelligenceStrategy[],
  userId: string,
  watchlist: readonly string[],
  cycleId: string,
  operator: OperatorConfig,
): { row: ObservationRow; signals: SignalView[]; events: ObservationEventView[] } {
  const asOf = new Date(asOfMs).toISOString();
  const clock = formatClock(asOf);
  const underlying = readCachedUnderlyingEvents({ ticker: row.ticker, nowMs: asOfMs, fidelity: row.fidelity });
  const context = {
    ...buildStrategyContext({
    ticker: row.ticker,
    assetName: row.companyName,
    representationId: row.representationId,
    tokenSymbol: row.tokenSymbol,
    price: row.price,
    referencePrice: row.referencePrice,
    session: row.session,
    freshness: row.freshness,
    latestAgeMs: row.ageMs,
    candles,
    fidelity: row.fidelity,
    asOfMs,
    requiredPoints: 21,
  }),
    eventWindow: underlying.window,
    earningsState: underlying.earnings?.status ?? null,
    newsAvailability: underlying.newsStatus === "AVAILABLE" ? "AVAILABLE" as const : underlying.newsStatus === "STALE" ? "STALE" as const : "UNAVAILABLE" as const,
    recentEventCount: underlying.newsItems?.length ?? null,
    operator: {
      configVersion: operator.version,
      strategies: operator.strategies,
      dca: null,
    },
  };
  const events: ObservationEventView[] = [
    event(asOf, clock, "HISTORY_UPDATED", row.ticker, null, `${row.ticker} history ${candles.length === 0 ? "is empty" : `holds ${candles.length} candles`}`),
    event(asOf, clock, "FEATURES_UPDATED", row.ticker, null, `${row.ticker} features updated`),
    event(asOf, clock, "REGIME_UPDATED", row.ticker, null, `${row.ticker} regime: ${context.regime.regime}`),
  ];
  const signals: SignalView[] = [];
  const evaluations: StrategyEvaluation[] = [];
  for (const strategy of strategies) {
    if (!strategy.metadata.supportedAssets.includes("*") && !strategy.metadata.supportedAssets.includes(row.ticker)) {
      continue;
    }
    const raw = strategy.evaluate(context);
    const view = toView(raw, strategy.metadata.name, row.tokenSymbol);
    signals.push(view);
    evaluations.push(toEvaluation(strategy, raw));
    events.push(event(asOf, clock, "STRATEGY_EVALUATED", row.ticker, strategy.metadata.id, `${strategy.metadata.name} evaluated ${row.ticker}`));
    events.push(outcomeEvent(asOf, clock, row.ticker, strategy.metadata.name, view));
  }
  if (row.fidelity === "paper") {
    try {
      evaluations.push(...paperResearchEvaluations(userId, context, asOfMs));
      reviewShadowCandidates(userId, context, asOfMs);
    } catch {
      events.push(event(asOf, clock, "STRATEGY_EVALUATED", row.ticker, null, `${row.ticker} research candidate review failed`));
    }
  }
  const features = context.features.features.map(toFeature);
  const versions = Object.fromEntries(strategies.map((strategy) => [strategy.metadata.id, strategy.metadata.version]));
  let kairos = buildObservationContext({
    userId,
    agentId: userId === LOCAL_RUNTIME_USER_ID ? DEFAULT_AGENT_ID : `agent_${userId}`,
    cycleId,
    nowMs: asOfMs,
    watchlist,
    row: { ...row, features },
    candles,
    signals,
    regime: context.regime,
    dataQuality: context.dataQuality,
    versions,
  });
  const intelligence = readAssetIntelligence(userId, row.representationId);
  const decision = kairos.validation.admitsArbitration
    ? arbitrator.arbitrate(observationArbitrationView(kairos, asOfMs), evaluations)
    : null;
  if (decision) {
    kairos = noteStrategySelection(kairos, decision);
  }
  events.push(...arbitrationEvents(asOf, clock, row.ticker, decision));
  return {
    row: {
      ...row,
      regime: context.regime.regime,
      regimeDetail: context.regime.reasons[0] ?? null,
      dataQuality: context.dataQuality.status,
      historyPoints: candles.length,
      features,
      signals,
      candles: candles.slice(-48).map(toBar),
      arbitration: decision,
      kairos,
      binanceIntelligence: buildBinanceIntelligenceView({
        signals: intelligence.signals,
        skillError: intelligence.signalRead.kind === "SKILL_ERROR" ? intelligence.signalRead.message : null,
        security: intelligence.security,
        securityEvents: intelligence.securityEvents,
        confirmation: decision?.externalConfirmation ?? "NO_SIGNAL",
        conflict: decision?.externalConflict ?? "NONE",
      }),
    },
    signals,
    events,
  };
}

function toEvaluation(strategy: IntelligenceStrategy, signal: AnalyticalSignal): StrategyEvaluation {
  return {
    signalStrategyId: signal.strategyId,
    strategyName: strategy.metadata.name,
    status: strategy.metadata.status,
    supportedAssets: strategy.metadata.supportedAssets,
    supportedSessions: strategy.metadata.supportedSessions,
    minHistory: STRATEGY_MIN_HISTORY[signal.strategyId] ?? 21,
    requiresReference: strategy.metadata.requiredData.includes("reference"),
    action: signal.action,
    evaluation: signal.evaluation,
    confidence: signal.confidence,
    evidence: signal.evidence,
    featuresUsed: signal.featuresUsed,
    tags: signal.tags,
    validUntil: signal.validUntil,
    signalTimestamp: signal.timestamp,
    signalQuality: signal.dataQuality.status,
  };
}

function arbitrationEvents(
  at: string,
  clock: string,
  ticker: string,
  decision: ObservationRow["arbitration"],
): ObservationEventView[] {
  if (!decision) {
    return [];
  }
  const rows: ObservationEventView[] = [
    event(at, clock, "STRATEGIES_EVALUATED", ticker, null, `${ticker} strategies evaluated`, { decision: decision.decision }),
    event(at, clock, "ARBITRATION_STARTED", ticker, null, `${ticker} arbitration started`, { version: decision.version }),
  ];
  for (const candidate of decision.candidates) {
    if (candidate.eligible || candidate.candidateStatus === "SELECTED" || candidate.candidateStatus === "CONFIRMING" || candidate.candidateStatus === "CONFLICTED") {
      rows.push(
        event(at, clock, "CANDIDATE_ACCEPTED", ticker, candidate.strategyId, `${candidate.strategyName} candidate score ${candidate.score.toFixed(2)}`, {
          score: candidate.score,
          action: candidate.action,
        }),
      );
    } else {
      rows.push(
        event(at, clock, "CANDIDATE_REJECTED", ticker, candidate.strategyId, `${candidate.strategyName} rejected. ${candidate.rejectionReason ?? "Not eligible."}`, {
          status: candidate.candidateStatus,
        }),
      );
    }
  }
  if (decision.decision === "CONFLICT") {
    rows.push(event(at, clock, "STRATEGY_CONFLICT", ticker, null, `${ticker} strategy conflict. Resolution: NO ACTION.`));
  } else if (decision.decision === "SELECT_STRATEGY" || decision.decision === "MULTI_STRATEGY_CONFIRMATION") {
    rows.push(
      event(at, clock, "STRATEGY_SELECTED", ticker, decision.selectedStrategy, `${ticker} ${decisionLabel(decision.decision, decision.selectedStrategyName)}`, {
        score: decision.score,
        action: decision.selectedAction,
      }),
    );
  } else if (decision.decision === "DATA_BLOCKED") {
    rows.push(event(at, clock, "ARBITRATION_BLOCKED", ticker, null, `${ticker} arbitration blocked. ${decision.evidence.summary}`));
  } else {
    rows.push(event(at, clock, "ARBITRATION_ABSTAINED", ticker, null, `${ticker} ${decisionLabel(decision.decision, null)}`));
  }
  return rows;
}

function outcomeEvent(at: string, clock: string, ticker: string, name: string, signal: SignalView): ObservationEventView {
  if (signal.evaluation === "INSUFFICIENT_DATA") {
    return event(at, clock, "INSUFFICIENT_DATA", ticker, signal.strategyId, `${name}: insufficient data`);
  }
  if (signal.evaluation === "STALE_DATA") {
    return event(at, clock, "SIGNAL_REJECTED", ticker, signal.strategyId, `${name}: stale data`);
  }
  if (signal.evaluation === "SIGNAL") {
    const label = signal.tags.includes("OFF_HOURS_DISLOCATION") ? "off-hours dislocation" : signal.action;
    return event(at, clock, "SIGNAL_CREATED", ticker, signal.strategyId, `${name}: ${label}`);
  }
  if (signal.action === "HOLD") {
    return event(at, clock, "SIGNAL_REJECTED", ticker, signal.strategyId, `${name}: hold`);
  }
  return event(at, clock, "SIGNAL_REJECTED", ticker, signal.strategyId, `${name}: no signal`);
}

function event(
  at: string,
  clock: string,
  type: AgentEventType,
  ticker: string | null,
  strategyId: string | null,
  message: string,
  metadata?: ObservationEventView["metadata"],
): ObservationEventView {
  return {
    id: `${at}:${type}:${ticker ?? "board"}:${strategyId ?? "none"}:${message}`,
    at,
    clock,
    type,
    message,
    metadata,
  };
}

function toView(signal: AnalyticalSignal, strategyName: string, tokenSymbol: string): SignalView {
  return {
    id: `${signal.timestamp}:${signal.strategyId}:${signal.representationId}`,
    strategyId: signal.strategyId,
    strategyName,
    ticker: signal.ticker,
    tokenSymbol,
    representationId: signal.representationId,
    timestamp: signal.timestamp,
    action: signal.action,
    evaluation: signal.evaluation,
    confidence: signal.confidence,
    reasons: [...signal.reasons],
    evidence: [...signal.evidence],
    featuresUsed: [...signal.featuresUsed],
    riskHints: [...signal.riskHints],
    validUntil: signal.validUntil,
    dataQuality: signal.dataQuality.status,
    historyPoints: signal.dataQuality.historyPoints,
    tags: [...signal.tags],
    executable: false,
  };
}

function toFeature(feature: { id: string; label: string; value: string | null; lookback: string; sufficient: boolean; note: string | null }): FeatureView {
  return {
    id: feature.id,
    label: feature.label,
    value: feature.value,
    lookback: feature.lookback,
    sufficient: feature.sufficient,
    note: feature.note,
  };
}

function toBar(candle: Candle): ChartBar {
  return {
    timeMs: candle.timestampMs,
    open: formatDecimal(candle.open, 4),
    high: formatDecimal(candle.high, 4),
    low: formatDecimal(candle.low, 4),
    close: formatDecimal(candle.close, 4),
  };
}
