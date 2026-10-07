import type { MarketEvent } from "@/context/types";
import { SOURCES } from "@/context/sources";
import type { EarningsEvent, EarningsWindow, UnderlyingEventRead } from "@/events/model";
import type { EventTradingPolicy } from "@/events/policy";
import { windowBounds } from "@/events/window";

/** A structured FMP earnings row can become one market event. A news article does not. */
export function earningsMarketEvent(input: {
  earnings: EarningsEvent | null;
  window: EarningsWindow;
  representationId: string;
  policy: EventTradingPolicy;
}): MarketEvent | null {
  const earnings = input.earnings;
  if (!earnings?.reportedDate || input.window === "NORMAL") {
    return null;
  }
  const bounds = windowBounds(earnings.reportedDate, input.policy);
  if (!bounds) {
    return null;
  }
  const detected = [
    earnings.underlyingTicker,
    earnings.reportedDate,
    earnings.reportTime,
    earnings.status,
  ].join(" ");
  return {
    eventId: `${earnings.eventId}:${input.representationId}`,
    assetId: input.representationId,
    type: "EARNINGS",
    status: earnings.status,
    source: SOURCES.FMP_EARNINGS,
    observedAt: earnings.observedAt,
    effectiveAt: bounds.effectiveAt,
    expiresAt: bounds.expiresAt,
    confidence: null,
    severity: "INFO",
    reason: null,
    details: detected,
    semantics: {
      detected,
      interpreted: input.window,
      hypothesis: null,
    },
    freshness: "FRESH",
    origin: "REAL",
    active: true,
  };
}

export function notConfiguredRead(ticker: string, observedAt: string, policy: UnderlyingEventRead["policy"]): UnderlyingEventRead {
  return {
    ticker,
    observedAt,
    cachedAt: null,
    newsStatus: "UNAVAILABLE",
    newsReason: "NOT_CONFIGURED",
    newsItems: null,
    newsHistoricalCount: 0,
    earningsStatus: "UNAVAILABLE",
    earningsReason: "NOT_CONFIGURED",
    earnings: null,
    window: "NORMAL",
    policy,
    health: {
      provider: "FMP",
      earnings: "NOT_CONFIGURED",
      news: "NOT_CONFIGURED",
      lastSuccessAt: null,
      latencyMs: null,
    },
  };
}
