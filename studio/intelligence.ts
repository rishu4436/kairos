import type { ObservationRow } from "@/domain/observation";
import type { Candle } from "@/domain/candle";
import { classifyFreshness } from "@/domain/freshness";
import { buildStrategyContext } from "@/strategies/context";
import { createStrategyRegistry } from "@/strategies/catalog";

export const INTELLIGENCE_TICKERS = ["TSLA", "NVDA", "AAPL", "MSFT", "AMD", "SPY"] as const;
export const INTELLIGENCE_REPORT = "MARKET_INTELLIGENCE_BRIEF" as const;
export interface KairosIntelligenceJob {
  requestId: string;
  ticker: string;
  requestedReportType: typeof INTELLIGENCE_REPORT;
  timestamp: string;
}
export interface KairosIntelligenceBrief {
  requestId: string;
  generatedAt: string;
  underlyingTicker: string;
  reportType: typeof INTELLIGENCE_REPORT;
  marketStatus: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  representation: { id: string; tokenSymbol: string; contractAddress: string | null } | null;
  marketFreshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  referenceContext: { price: string | null; referencePrice: string | null; sourceTimestamp: string | null } | null;
  regime: string | null;
  session: string | null;
  strategySignals: { strategyId: string; action: string; confidence: number; executable: false }[];
  arbitration: "PUBLIC_ARBITRATION_UNAVAILABLE";
  eventSummary: "PUBLIC_EVENT_SNAPSHOT_UNAVAILABLE";
  researchEvidence: "RESEARCH_NOT_CONFIGURED";
  strategyHealth: "PUBLIC_STRATEGY_HEALTH_UNAVAILABLE";
  riskSummary: "USER_RISK_SETTINGS_PRIVATE";
  paperReadiness: "NO_EXECUTION_AUTHORITY";
  liveReadiness: "BLOCKED";
  provenance: { source: "LIVE_BINANCE_SNAPSHOT" | "NO_PUBLIC_SNAPSHOT"; observedAt: string | null };
}
export type IntelligenceResult = { ok: true; brief: KairosIntelligenceBrief } | {
  ok: false; code: "INVALID_REQUEST" | "UNSUPPORTED_ACTION" | "UNSUPPORTED_TICKER" | "UNSUPPORTED_REPORT_TYPE";
};

/** Narrow public read port. No user/account identifiers or mutation methods. */
export interface KairosPublicIntelligencePort {
  readPublicMarket(ticker: string, nowMs: number): Omit<KairosIntelligenceBrief, "requestId" | "generatedAt" | "reportType" | "underlyingTicker">;
}
type PublicSnapshot = Pick<KairosIntelligenceBrief, "representation" | "referenceContext" | "regime" | "session" | "strategySignals">;
const publicSnapshots = new Map<string, PublicSnapshot>();

/** Called by existing live observation ingestion, before user-specific enrichment.
 * Explicit projection: account, position, watchlist, policy, and context never enter this store.
 */
export function publishPublicMarketSnapshot(row: ObservationRow, candles: readonly Candle[], asOfMs: number): void {
  if (row.fidelity !== "live" || !INTELLIGENCE_TICKERS.some((ticker) => ticker === row.ticker)) return;
  const fresh = classifyFreshness(row.sourceTimestamp === null ? null : Date.parse(row.sourceTimestamp), asOfMs);
  const context = buildStrategyContext({ ticker: row.ticker, assetName: row.companyName,
    representationId: row.representationId, tokenSymbol: row.tokenSymbol, price: row.price,
    referencePrice: row.referencePrice, session: row.session, freshness: fresh.status,
    latestAgeMs: fresh.ageMs, candles, fidelity: "live", asOfMs, requiredPoints: 21 });
  const strategySignals = createStrategyRegistry().list().map((strategy) => {
    const signal = strategy.evaluate(context);
    return { strategyId: signal.strategyId, action: signal.action, confidence: signal.confidence, executable: false as const };
  });
  publicSnapshots.set(row.ticker, {
    representation: { id: row.representationId, tokenSymbol: row.tokenSymbol, contractAddress: row.contractAddress },
    referenceContext: { price: row.price, referencePrice: row.referencePrice, sourceTimestamp: row.sourceTimestamp },
    regime: context.regime.regime, session: row.session, strategySignals,
  });
}

export function clearPublicIntelligenceSnapshots(): void { publicSnapshots.clear(); }

export const publicIntelligencePort: KairosPublicIntelligencePort = {
  readPublicMarket(ticker, nowMs) {
    const cached = publicSnapshots.get(ticker);
    const snapshot = cached ? structuredClone(cached) : null;
    const sourceTime = snapshot?.referenceContext?.sourceTimestamp ?? null;
    const freshness = classifyFreshness(sourceTime === null ? null : Date.parse(sourceTime), nowMs).status;
    return {
      marketStatus: !snapshot ? "UNAVAILABLE" : freshness === "FRESH" ? "AVAILABLE" : "DEGRADED",
      representation: snapshot?.representation ?? null,
      marketFreshness: freshness,
      referenceContext: snapshot?.referenceContext ?? null,
      regime: snapshot?.regime ?? null, session: snapshot?.session ?? null,
      strategySignals: freshness === "FRESH" ? snapshot?.strategySignals ?? [] : [],
      arbitration: "PUBLIC_ARBITRATION_UNAVAILABLE", eventSummary: "PUBLIC_EVENT_SNAPSHOT_UNAVAILABLE",
      researchEvidence: "RESEARCH_NOT_CONFIGURED", strategyHealth: "PUBLIC_STRATEGY_HEALTH_UNAVAILABLE",
      riskSummary: "USER_RISK_SETTINGS_PRIVATE", paperReadiness: "NO_EXECUTION_AUTHORITY", liveReadiness: "BLOCKED",
      provenance: { source: snapshot ? "LIVE_BINANCE_SNAPSHOT" : "NO_PUBLIC_SNAPSHOT", observedAt: sourceTime },
    };
  },
};

export function fulfillIntelligenceJob(input: unknown, port: KairosPublicIntelligencePort = publicIntelligencePort, nowMs = Date.now()): IntelligenceResult {
  if (typeof input === "string") return { ok: false, code: "UNSUPPORTED_ACTION" };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "INVALID_REQUEST" };
  const job = input as Record<string, unknown>;
  if (Object.keys(job).some((key) => !["requestId", "ticker", "requestedReportType", "timestamp"].includes(key))) return { ok: false, code: "UNSUPPORTED_ACTION" };
  if (typeof job.ticker !== "string" || /\s/.test(job.ticker)) return { ok: false, code: "UNSUPPORTED_ACTION" };
  const ticker = job.ticker.toUpperCase();
  if (!INTELLIGENCE_TICKERS.some((supported) => supported === ticker)) return { ok: false, code: "UNSUPPORTED_TICKER" };
  if (job.requestedReportType !== INTELLIGENCE_REPORT) return { ok: false, code: "UNSUPPORTED_REPORT_TYPE" };
  if (typeof job.requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(job.requestId)
    || typeof job.timestamp !== "string" || !/^\d{4}-\d\d-\d\dT/.test(job.timestamp) || !Number.isFinite(Date.parse(job.timestamp))) return { ok: false, code: "INVALID_REQUEST" };
  const view = port.readPublicMarket(ticker, nowMs);
  // Re-project even injected ports: extra private fields cannot be serialized.
  return { ok: true, brief: {
    requestId: job.requestId, generatedAt: new Date(nowMs).toISOString(), underlyingTicker: ticker, reportType: INTELLIGENCE_REPORT,
    marketStatus: view.marketStatus, marketFreshness: view.marketFreshness,
    representation: view.representation ? { id: view.representation.id, tokenSymbol: view.representation.tokenSymbol, contractAddress: view.representation.contractAddress } : null,
    referenceContext: view.referenceContext ? { price: view.referenceContext.price, referencePrice: view.referenceContext.referencePrice, sourceTimestamp: view.referenceContext.sourceTimestamp } : null,
    regime: view.regime, session: view.session,
    strategySignals: view.strategySignals.map((signal) => ({ strategyId: signal.strategyId, action: signal.action, confidence: signal.confidence, executable: false })),
    arbitration: view.arbitration, eventSummary: view.eventSummary, researchEvidence: view.researchEvidence,
    strategyHealth: view.strategyHealth, riskSummary: "USER_RISK_SETTINGS_PRIVATE", paperReadiness: "NO_EXECUTION_AUTHORITY", liveReadiness: "BLOCKED",
    provenance: { source: view.provenance.source, observedAt: view.provenance.observedAt },
  } };
}

export const commerceCapability = Object.freeze({ kind: "erc8183_intelligence_service", permissions: ["read_public_intelligence"] as const });
export function refuseCommerceStockExecution() {
  return { ok: false as const, code: "COMMERCE_CAPABILITY_CANNOT_EXECUTE_STOCKS" as const };
}
