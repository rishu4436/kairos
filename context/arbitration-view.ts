import type { ArbitrationContext, ArbitrationSecurityInput, HistoricalHealthInput } from "@/domain/arbitration";
import type { FreshnessStatus } from "@/domain/freshness";
import type { DataQuality } from "@/domain/quality";
import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { KAIROSContext, StrategyHealthReading } from "@/context/types";

const REGIMES = new Set<MarketRegime>(["TRENDING_UP", "TRENDING_DOWN", "RANGE_BOUND", "HIGH_VOLATILITY", "LOW_VOLATILITY", "UNKNOWN"]);
const SESSIONS = new Set<MarketSessionState>(["OPEN", "CLOSED", "PRE_OPEN", "POST_CLOSE", "UNKNOWN"]);
const HEALTH = new Set<HistoricalHealthInput["status"]>(["UNKNOWN", "INSUFFICIENT_DATA", "HEALTHY", "DEGRADED", "UNSTABLE", "RETIRED"]);
const SAMPLES = new Set<HistoricalHealthInput["sample"]>(["INSUFFICIENT", "EARLY", "DEVELOPING", "ESTABLISHED"]);

/**
 * The arbitrator reads this view. It does not fetch a wallet, a market, a skill, or a model.
 * Measured health is included only when a sample exists. An empty history leaves the 0.06 weight unchanged.
 */
export function arbitrationViewFromContext(context: KAIROSContext, nowMs: number): ArbitrationContext {
  const quality = context.dataQuality.value;
  const dataQuality: DataQuality = {
    status: (quality?.status ?? "INSUFFICIENT") as DataQuality["status"],
    historyPoints: quality?.historyPoints ?? 0,
    latestAgeMs: quality?.latestAgeMs ?? null,
    referenceAgeMs: quality?.referenceAgeMs ?? null,
    missingFields: quality?.missingFields ?? [],
  };
  const historical = historicalHealth(context.strategyHealth.value?.reports ?? []);
  const external = externalSignals(context);
  return {
    userId: context.userId,
    asset: { id: context.assetId, ticker: context.identity.underlyingTicker },
    timestamp: context.timestamp,
    asOfMs: nowMs,
    regime: asRegime(context.regime.value?.regime ?? "UNKNOWN"),
    session: asSession(context.session.value?.session ?? "UNKNOWN"),
    dataQuality,
    freshness: asFreshness(context),
    pricePresent: context.market.status === "AVAILABLE" && context.market.value !== null,
    referencePresent: context.reference.status === "AVAILABLE" && context.reference.value !== null,
    historyPoints: context.history.value?.points ?? dataQuality.historyPoints,
    featureIds: (context.features.value?.features ?? []).filter((feature) => feature.sufficient).map((feature) => feature.id),
    priorSelection: null,
    ...(external === undefined ? {} : { externalSignals: external }),
    ...(context.externalAbsence === "SOURCE_ERROR" || context.externalAbsence === "SOURCE_UNAVAILABLE"
      ? { externalAbsence: context.externalAbsence }
      : {}),
    securityAssessment: securityInput(context),
    ...(historical ? { historicalHealth: historical } : {}),
    eventWindow: context.earningsContext.value?.window ?? null,
    eventContextStatus: context.eventContext.status,
    paperResearchEligible: context.market.value?.fidelity === "paper",
  };
}

function historicalHealth(reports: readonly StrategyHealthReading[]): Readonly<Record<string, HistoricalHealthInput>> | undefined {
  const mapped: Record<string, HistoricalHealthInput> = {};
  for (const report of reports) {
    if (report.sampleSize <= 0 || !HEALTH.has(report.status as HistoricalHealthInput["status"]) || !SAMPLES.has(report.sample as HistoricalHealthInput["sample"])) {
      continue;
    }
    if (report.status === "UNKNOWN") {
      continue;
    }
    mapped[report.strategyId] = {
      status: report.status as HistoricalHealthInput["status"],
      sample: report.sample as HistoricalHealthInput["sample"],
    };
  }
  return Object.keys(mapped).length === 0 ? undefined : mapped;
}

function externalSignals(context: KAIROSContext): ArbitrationContext["externalSignals"] {
  if (context.externalSignals.status === "UNAVAILABLE" || context.externalSignals.value === null) {
    return undefined;
  }
  return context.externalSignals.value.signals
    .filter((signal) => signal.relevance === "MAPPED")
    .map((signal) => ({
      direction: signal.direction,
      freshness: signal.freshness as "FRESH" | "AGING" | "STALE" | "EXPIRED" | "UNKNOWN",
      source: signal.source,
      mapStatus: "MAPPED" as const,
    }));
}

function securityInput(context: KAIROSContext): ArbitrationSecurityInput | null {
  const security = context.tokenSecurity.value;
  if (!security || security.gate === "NOT_EVALUATED") {
    return null;
  }
  return {
    available: security.gate === "ELIGIBLE" || security.gate === "BLOCK",
    supported: security.gate !== "UNAVAILABLE",
    riskLevel: security.riskLevel,
    riskLevelEnum: security.riskLevelEnum,
  };
}

function asRegime(value: string): MarketRegime {
  return REGIMES.has(value as MarketRegime) ? (value as MarketRegime) : "UNKNOWN";
}

function asSession(value: string): MarketSessionState {
  return SESSIONS.has(value as MarketSessionState) ? (value as MarketSessionState) : "UNKNOWN";
}

function asFreshness(context: KAIROSContext): FreshnessStatus | "SAMPLE" {
  if (context.market.value?.fidelity === "paper") {
    return "SAMPLE";
  }
  const freshness = context.market.freshness;
  if (freshness === "FRESH" || freshness === "AGING" || freshness === "STALE") {
    return freshness;
  }
  return "UNKNOWN";
}
