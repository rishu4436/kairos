import type { EventTradingPolicy } from "@/events/policy";

export type { EventTradingPolicy };

export const PROVIDER_FAILURES = [
  "NOT_CONFIGURED",
  "AUTHENTICATION_ERROR",
  "RATE_LIMITED",
  "TIMEOUT",
  "UPSTREAM_ERROR",
  "INVALID_RESPONSE",
  "UNKNOWN_ERROR",
] as const;

export type ProviderFailure = (typeof PROVIDER_FAILURES)[number];

export const EARNINGS_STATES = ["UPCOMING", "REPORTED", "UNKNOWN", "TODAY"] as const;
export type EarningsState = (typeof EARNINGS_STATES)[number];

export const REPORT_TIMINGS = ["BEFORE_OPEN", "AFTER_CLOSE", "DURING_SESSION", "UNKNOWN"] as const;
export type ReportTiming = (typeof REPORT_TIMINGS)[number];

export const EARNINGS_WINDOWS = ["PRE_EVENT", "EVENT_DAY", "POST_EVENT", "NORMAL"] as const;
export type EarningsWindow = (typeof EARNINGS_WINDOWS)[number];

export const NEWS_FRESHNESS = ["FRESH", "RECENT", "AGING", "STALE"] as const;
export type NewsFreshness = (typeof NEWS_FRESHNESS)[number];

export const CORRELATION_STATES = ["CORROBORATED", "INDEPENDENT"] as const;
export type CorrelationState = (typeof CORRELATION_STATES)[number];

/** Underlying-equity earnings. Missing provider fields stay null. */
export interface EarningsEvent {
  eventId: string;
  underlyingTicker: string;
  reportedDate: string | null;
  reportTime: ReportTiming;
  status: EarningsState;
  epsEstimated: string | null;
  epsActual: string | null;
  revenueEstimated: string | null;
  revenueActual: string | null;
  epsSurprise: string | null;
  epsSurprisePct: string | null;
  revenueSurprise: string | null;
  revenueSurprisePct: string | null;
  source: "FMP";
  sourceUpdatedAt: string | null;
  observedAt: string;
}

/** A headline is observed news. It is not a trade signal. */
export interface CompanyNewsItem {
  newsId: string;
  underlyingTicker: string;
  headline: string;
  snippet: string | null;
  publisher: string | null;
  publishedAt: string;
  url: string | null;
  imageUrl: string | null;
  provider: "FMP";
  observedAt: string;
  freshness: NewsFreshness;
}

export interface EventRiskContext {
  earningsWindow: EarningsWindow;
  scheduledEventNear: boolean;
  corporateRestrictionActive: boolean;
  highUncertaintyWindow: boolean;
}

export interface EventProviderHealth {
  provider: "FMP";
  earnings: "CONNECTED" | "NOT_CONFIGURED" | "ERROR";
  news: "CONNECTED" | "NOT_CONFIGURED" | "ERROR";
  lastSuccessAt: string | null;
  /** Null unless a request was actually timed. */
  latencyMs: number | null;
}

export interface CorrelatedMarketEvent {
  correlationId: string;
  state: CorrelationState;
  underlyingTicker: string;
  binanceEventId: string | null;
  earningsEventId: string | null;
  /** Null when the two records were not placed in the same window. */
  window: EarningsWindow | null;
}

/** Public market payload for one underlying ticker. It has no user or portfolio fields. */
export interface UnderlyingEventRead {
  ticker: string;
  observedAt: string;
  /** When this process stored the provider payload. Not the article or filing time. */
  cachedAt: string | null;
  newsStatus: "AVAILABLE" | "STALE" | "UNAVAILABLE";
  newsReason: string | null;
  /** Null when the provider did not answer. An empty list means it answered with nothing current. */
  newsItems: readonly CompanyNewsItem[] | null;
  newsHistoricalCount: number;
  earningsStatus: "AVAILABLE" | "UNAVAILABLE";
  earningsReason: string | null;
  earnings: EarningsEvent | null;
  window: EarningsWindow;
  policy: EventTradingPolicy;
  health: EventProviderHealth;
}
