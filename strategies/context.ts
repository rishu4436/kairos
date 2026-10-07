import type { Candle } from "@/domain/candle";
import { scaleDecimal } from "@/domain/candle";
import { classifySeries } from "@/domain/candle-quality";
import type { FreshnessStatus } from "@/domain/freshness";
import { computeFeatures, simpleReturnBps, type FeatureSet } from "@/domain/features";
import type { DataQuality } from "@/domain/quality";
import { assessDataQuality } from "@/domain/quality";
import { classifyRegime, type RegimeAssessment } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";
import type { Scaled } from "@/domain/money";

export interface StrategyContext {
  ticker: string;
  assetName: string;
  representationId: string;
  tokenSymbol: string;
  price: Scaled | null;
  referencePrice: Scaled | null;
  referenceDeviationBps: bigint | null;
  session: MarketSessionState;
  freshness: FreshnessStatus | "SAMPLE";
  latestAgeMs: number | null;
  referenceAgeMs: number | null;
  candles: readonly Candle[];
  features: FeatureSet;
  regime: RegimeAssessment;
  dataQuality: DataQuality;
  fidelity: "live" | "paper";
  asOfMs: number;
  /** Optional external intelligence. Existing strategies may ignore these fields. */
  externalSignals?: readonly { signalId: string | null; direction: "BUY" | "SELL" | null; freshness: string }[];
  securityAssessment?: { available: boolean; supported: boolean; riskLevelEnum: string | null } | null;
  events?: readonly { eventType: string | null; status: string | null; effectiveTime: string | null }[];
  /** Optional event context. Strategy formulas may ignore these fields. */
  eventWindow?: string | null;
  earningsState?: string | null;
  newsAvailability?: "AVAILABLE" | "UNAVAILABLE" | "STALE" | null;
  recentEventCount?: number | null;
}

export function buildStrategyContext(input: {
  ticker: string;
  assetName: string;
  representationId: string;
  tokenSymbol: string;
  price: string | null;
  referencePrice: string | null;
  session: MarketSessionState;
  freshness: FreshnessStatus | "SAMPLE";
  latestAgeMs: number | null;
  candles: readonly Candle[];
  fidelity: "live" | "paper";
  asOfMs: number;
  requiredPoints: number;
  requiredMissing?: readonly string[];
}): StrategyContext {
  const price = input.price === null ? null : scaleDecimal(input.price);
  const referencePrice = input.referencePrice === null ? null : scaleDecimal(input.referencePrice);
  const referenceDeviationBps =
    price !== null && referencePrice !== null ? simpleReturnBps(price, referencePrice) : null;
  const asOf = new Date(input.asOfMs).toISOString();
  const features = computeFeatures({
    candles: input.candles,
    asOf,
    referenceDeviationBps,
    freshnessLabel: input.freshness,
  });
  const regime = classifyRegime(input.candles, asOf);
  const missing = [...(input.requiredMissing ?? [])];
  if (price === null) {
    missing.push("price");
  }
  const dataQuality = assessDataQuality({
    historyPoints: input.candles.length,
    requiredPoints: input.requiredPoints,
    freshness: input.freshness,
    latestAgeMs: input.latestAgeMs,
    referenceAgeMs: referencePrice === null ? null : input.latestAgeMs,
    missingFields: missing,
    fidelity: input.fidelity,
    barClass: classifySeries(input.candles),
  });
  return {
    ticker: input.ticker,
    assetName: input.assetName,
    representationId: input.representationId,
    tokenSymbol: input.tokenSymbol,
    price,
    referencePrice,
    referenceDeviationBps,
    session: input.session,
    freshness: input.freshness,
    latestAgeMs: input.latestAgeMs,
    referenceAgeMs: referencePrice === null ? null : input.latestAgeMs,
    candles: input.candles,
    features,
    regime,
    dataQuality,
    fidelity: input.fidelity,
    asOfMs: input.asOfMs,
  };
}
