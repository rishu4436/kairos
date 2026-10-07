import type { KAIROSContext } from "@/context/types";
import { captureCycleSnapshot, diffPositionContext } from "@/position/diff";
import type { Candle } from "@/domain/candle";
import type { ObservationRow } from "@/domain/observation";
import type { MarketSessionState } from "@/domain/session-state";
import type { ResearchBar } from "@/research/snapshot";
import type { MarketDataSource, ResearchContext, ResearchEventContext } from "@/research/types";
import { researchNewsLimit } from "@/events/policy";
import { unavailableResearchBoundaries } from "@/research/types";
import { researchStore } from "@/research/store";
import { asUserId } from "@/domain/ids";
import { readAssetIntelligence } from "@/skills/store";
import { buildMarketContext } from "@/skills/market-context";
import { listStrategyCandidates } from "@/lifecycle/candidates";
import { strategyMemory } from "@/lifecycle/store";

export interface BuiltResearchContext {
  context: ResearchContext;
  bars: ResearchBar[];
  dataSource: MarketDataSource;
  contextTimestamp: string;
  contextDataVersion: string;
}

export function buildResearchContext(input: {
  userId: string;
  agentId: string;
  row: ObservationRow;
  candles: readonly Candle[];
  watchlist: readonly string[];
  dataSource: MarketDataSource;
  nowMs: number;
}): BuiltResearchContext {
  const last = input.candles.at(-1);
  const referenceBps = input.row.deviationPct === null ? null : BigInt(Math.round(input.row.deviationPct * 100));
  const session = input.row.session;
  const bars = input.candles.map((candle, index) => ({
    candle,
    session: (index === input.candles.length - 1 ? session : "UNKNOWN") as MarketSessionState,
    referenceDeviationBps: index === input.candles.length - 1 ? referenceBps : null,
  }));
  const featureIds = input.row.features.map((feature) => feature.id);
  const kairos = input.row.kairos ?? null;
  const boundaries = kairos ? boundariesFromContext(kairos) : unavailableResearchBoundaries();
  const intelligence = kairos ? null : readAssetIntelligence(input.userId, input.row.representationId);
  const market = intelligence
    ? buildMarketContext({
        marketObservations: [{ assetId: input.row.representationId, ticker: input.row.ticker, price: input.row.price }],
        features: input.row.features.map((feature) => ({ id: feature.id, value: feature.value })),
        regime: input.row.regime,
        session: input.row.session,
        strategySignals: input.row.signals.map((signal) => ({ strategyId: signal.strategyId, action: signal.action })),
        externalSignals: intelligence.signals,
        tokenSecurity: intelligence.security,
        tokenizedSecurityStatus: null,
        securityEvents: intelligence.securityEvents,
        dataQuality: input.row.dataQuality,
      })
    : null;
  const fromKairos = kairos ? projectKairos(kairos) : null;
  const context: ResearchContext = {
    userId: input.userId,
    agentId: input.agentId,
    assetId: input.row.representationId,
    ticker: input.row.ticker,
    watchlist: input.watchlist,
    observation: {
      price: input.row.price,
      session: input.row.session,
      regime: input.row.regime,
      freshness: input.row.freshnessLabel,
    },
    features: fromKairos?.features ?? input.row.features.map((feature) => ({ id: feature.id, value: feature.value, bps: null })),
    signals: fromKairos?.signals ?? input.row.signals.map((signal) => ({ strategyId: signal.strategyId, action: signal.action })),
    arbitration: input.row.arbitration
      ? { decision: input.row.arbitration.decision, action: input.row.arbitration.selectedAction }
      : null,
    paperPerformance: null,
    priorExperiments: researchStore()
      .listExperiments(asUserId(input.userId))
      .filter((experiment) => experiment.userId === input.userId)
      .map((experiment) => ({
        experimentId: experiment.experimentId,
        status: experiment.status,
        netPnl: experiment.result?.netPnl ?? null,
      })),
    contextId: kairos?.contextId ?? null,
    eventContext: boundaries.eventContext,
    newsContext: boundaries.newsContext,
    earningsContext: boundaries.earningsContext,
    externalSignals: fromKairos
      ? fromKairos.externalSignals
      : (market?.externalSignals ?? []).map((signal) => ({
          id: signal.signalId ?? signal.rawSourceReference,
          source: signal.source,
          direction: signal.direction,
          freshness: signal.freshness,
        })),
    tokenSecurity: fromKairos
      ? fromKairos.tokenSecurity
      : market?.tokenSecurity
        ? {
            available: market.tokenSecurity.available,
            supported: market.tokenSecurity.supported,
            riskLevel: market.tokenSecurity.riskLevel,
            riskLevelEnum: market.tokenSecurity.riskLevelEnum,
            source: market.tokenSecurity.source,
          }
        : null,
    securityEvents: fromKairos
      ? fromKairos.securityEvents
      : (market?.securityEvents ?? []).map((event, index) => ({
          id: `security-event:${event.assetId ?? "asset"}:${event.eventType ?? index}`,
          eventType: event.eventType,
          status: event.status,
          source: event.source,
        })),
    strategyHealth: fromKairos?.strategyHealth ?? strategyMemory()
      .list(input.userId, "PAPER")
      .filter((record) => record.context.assetId === null && record.context.regime === null && record.context.session === null)
      .map((record) => ({
        strategyId: record.strategyId,
        status: strategyMemory().getHealth(input.userId, record.strategyId, record.strategyVersion, "PAPER").status,
        sampleSize: record.sampleSize,
        expectancy: record.expectancy,
      })),
    strategyPerformance: fromKairos?.strategyPerformance ?? strategyMemory()
      .list(input.userId)
      .filter((record) => record.context.assetId === null && record.context.regime === null && record.context.session === null)
      .map((record) => ({ strategyId: record.strategyId, dataset: record.dataset, netPnL: record.netPnL, tradeCount: record.tradeCount })),
    candidatePerformance:
      fromKairos?.candidatePerformance ??
      listStrategyCandidates(input.userId).map((candidate) => ({ candidateId: candidate.candidateId, status: candidate.status })),
    ...(fromKairos ? { positionContext: fromKairos.positionContext } : {}),
  };
  return {
    context,
    bars,
    dataSource: input.dataSource,
    contextTimestamp: new Date(last?.timestampMs ?? input.nowMs).toISOString(),
    contextDataVersion: `${input.dataSource}:${input.row.representationId}:${input.candles.length}:${last?.timestampMs ?? "none"}:${featureIds.join(",")}`,
  };
}

function boundariesFromContext(context: KAIROSContext): ReturnType<typeof unavailableResearchBoundaries> {
  const base = unavailableResearchBoundaries();
  const newsItems = context.newsContext.value?.items;
  const newsContext = context.newsContext.status === "AVAILABLE" || context.newsContext.status === "STALE"
    ? {
        status: context.newsContext.status === "STALE" ? "STALE" as const : "AVAILABLE" as const,
        providerConnected: context.newsContext.value?.providerConnected === true,
        reason: context.newsContext.reason ?? "PROVIDER_ANSWERED",
        items: (newsItems ?? []).slice(0, researchNewsLimit()).map((item) => ({
          newsId: item.newsId,
          headline: item.headline,
          publisher: item.publisher,
          publishedAt: item.publishedAt,
          freshness: item.freshness,
        })),
      }
    : base.newsContext;
  const earnings = context.earningsContext.value?.event ?? null;
  const earningsContext = context.earningsContext.status === "AVAILABLE" && earnings
    ? {
        status: "AVAILABLE" as const,
        reason: "PROVIDER_ANSWERED",
        eventId: earnings.eventId,
        expectedEarningsDate: earnings.reportedDate,
        reportTime: earnings.reportTime,
        state: earnings.status,
        window: context.earningsContext.value?.window ?? null,
        actualEps: earnings.epsActual,
        estimatedEps: earnings.epsEstimated,
        revenue: earnings.revenueActual,
        estimatedRevenue: earnings.revenueEstimated,
      }
    : {
        ...base.earningsContext,
        reason: context.earningsContext.reason ?? base.earningsContext.reason,
      };
  if (!context.eventContext.value?.providerAnswered) {
    return { ...base, newsContext, earningsContext };
  }
  const eventContext: ResearchEventContext = {
    status: context.eventContext.status === "STALE" ? "STALE" : "AVAILABLE",
    providerAnswered: true,
    events: context.eventContext.value.events.map((event) => ({
      eventId: event.eventId,
      type: event.type,
      status: event.status,
      reason: event.reason,
      semantics: "OBSERVED_EVENT",
      detected: event.semantics.detected,
      interpreted: event.semantics.interpreted,
      hypothesis: null,
    })),
  };
  return { ...base, eventContext, newsContext, earningsContext };
}

function projectKairos(context: KAIROSContext) {
  const security = context.tokenSecurity.value;
  return {
    features: (context.features.value?.features ?? []).map((feature) => ({ id: feature.id, value: feature.value, bps: null as string | null })),
    signals: (context.strategySignals.value?.signals ?? []).map((signal) => ({ strategyId: signal.strategyId, action: signal.action })),
    externalSignals:
      context.externalSignals.status === "UNAVAILABLE" || context.externalSignals.value === null
        ? undefined
        : context.externalSignals.value.signals
            .filter((signal) => signal.relevance === "MAPPED")
            .map((signal) => ({
              id: signal.id,
              source: signal.source,
              direction: signal.direction,
              freshness: signal.freshness,
            })),
    tokenSecurity: security
      ? {
          available: security.gate === "ELIGIBLE" || security.gate === "BLOCK",
          supported: security.gate === "ELIGIBLE" || security.gate === "BLOCK",
          riskLevel: security.riskLevel,
          riskLevelEnum: security.riskLevelEnum,
          source: context.tokenSecurity.provenance.source ?? "BINANCE_TOKEN_AUDIT",
        }
      : null,
    securityEvents: (context.securityEvents.value?.events ?? []).map((event, index) => ({
      id: `security-event:${context.assetId}:${event.eventType ?? index}`,
      eventType: event.eventType,
      status: event.status,
      source: event.source,
    })),
    strategyHealth: (context.strategyHealth.value?.reports ?? []).map((report) => ({
      strategyId: report.strategyId,
      status: report.status,
      sampleSize: report.sampleSize,
      expectancy: report.expectancy,
    })),
    strategyPerformance: (context.strategyPerformance.value?.records ?? []).map((record) => ({
      strategyId: record.strategyId,
      dataset: record.dataset,
      netPnL: record.netPnL,
      tradeCount: record.tradeCount,
    })),
    candidatePerformance: (context.researchCandidates.value?.candidates ?? []).map((candidate) => ({
      candidateId: candidate.candidateId,
      status: candidate.status,
    })),
    positionContext: {
      status: context.positionContext.status,
      state: context.positionContext.value?.state ?? null,
      quantity: context.positionContext.value?.quantity ?? null,
      averageEntry: context.positionContext.value?.averageEntry ?? null,
      currentMark: context.positionContext.value?.currentMark ?? null,
      unrealizedPnL: context.positionContext.value?.unrealizedPnL ?? null,
      originStrategy: context.positionContext.value?.originStrategy ?? null,
      thesisState: context.positionContext.value?.thesisState ?? null,
    },
    positionContextDiff: positionDiff(context),
  };
}

function positionDiff(context: KAIROSContext): ResearchContext["positionContextDiff"] {
  const position = context.positionContext.value;
  if (!position || position.state === "NO_POSITION") {
    return null;
  }
  const diff = diffPositionContext({
    entry: position.entry,
    previous: position.previousSnapshot,
    current: captureCycleSnapshot(context),
  });
  return {
    regime: { entry: diff.regime.entry, previous: diff.regime.previous, current: diff.regime.current },
    strategyAction: { entry: diff.strategyAction.entry, previous: diff.strategyAction.previous, current: diff.strategyAction.current },
    externalConfirmation: {
      entry: diff.externalConfirmation.entry,
      previous: diff.externalConfirmation.previous,
      current: diff.externalConfirmation.current,
    },
  };
}
