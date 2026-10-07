/**
 * KAIROS event-window and news-freshness defaults.
 * These are local policy. They are not exchange rules and not market truths.
 */

export const EVENT_POLICY_VERSION = "1.0";

export const DEFAULT_PRE_EVENT_DAYS = 3;
export const DEFAULT_POST_EVENT_DAYS = 2;

export const DEFAULT_NEWS_FRESH_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_NEWS_RECENT_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_NEWS_AGING_MS = 48 * 60 * 60 * 1000;

export const DEFAULT_NEWS_CONTEXT_LIMIT = 10;
export const DEFAULT_RESEARCH_NEWS_LIMIT = 5;
export const NEWS_SNIPPET_MAX = 280;

export const DEFAULT_NEWS_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_EARNINGS_TTL_MS = 45 * 60 * 1000;
export const DEFAULT_FMP_TIMEOUT_MS = 8_000;

export const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

export interface EventTradingPolicy {
  version: typeof EVENT_POLICY_VERSION;
  preEventDays: number;
  postEventDays: number;
  /** Paper-only. Live fidelity never enables a reduction from this flag. */
  eventReductionEnabled: boolean;
}

export function eventTradingPolicy(fidelity: "live" | "paper"): EventTradingPolicy {
  const requested = process.env.EVENT_REDUCTION_ENABLED === "1" || process.env.EVENT_REDUCTION_ENABLED === "true";
  return {
    version: EVENT_POLICY_VERSION,
    preEventDays: positiveInt(process.env.EVENT_PRE_DAYS, DEFAULT_PRE_EVENT_DAYS),
    postEventDays: positiveInt(process.env.EVENT_POST_DAYS, DEFAULT_POST_EVENT_DAYS),
    eventReductionEnabled: fidelity === "paper" && requested,
  };
}

export function newsFreshMs(): { fresh: number; recent: number; aging: number } {
  return {
    fresh: positiveInt(process.env.FMP_NEWS_FRESH_MS, DEFAULT_NEWS_FRESH_MS),
    recent: positiveInt(process.env.FMP_NEWS_RECENT_MS, DEFAULT_NEWS_RECENT_MS),
    aging: positiveInt(process.env.FMP_NEWS_AGING_MS, DEFAULT_NEWS_AGING_MS),
  };
}

export function newsContextLimit(): number {
  return positiveInt(process.env.FMP_NEWS_CONTEXT_LIMIT, DEFAULT_NEWS_CONTEXT_LIMIT);
}

export function researchNewsLimit(): number {
  return positiveInt(process.env.FMP_RESEARCH_NEWS_LIMIT, DEFAULT_RESEARCH_NEWS_LIMIT);
}

export function newsTtlMs(): number {
  return positiveInt(process.env.FMP_NEWS_TTL_MS, DEFAULT_NEWS_TTL_MS);
}

export function earningsTtlMs(): number {
  return positiveInt(process.env.FMP_EARNINGS_TTL_MS, DEFAULT_EARNINGS_TTL_MS);
}

export function fmpTimeoutMs(): number {
  return positiveInt(process.env.FMP_TIMEOUT_MS, DEFAULT_FMP_TIMEOUT_MS);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}
