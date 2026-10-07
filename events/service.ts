import type { CompanyNewsItem, EarningsEvent, ProviderFailure, UnderlyingEventRead } from "@/events/model";
import { earningsTtlMs, eventTradingPolicy, newsTtlMs } from "@/events/policy";
import { newsFreshness, selectCurrentNews } from "@/events/news";
import { earningsWindow } from "@/events/window";
import { earningsUrl, fetchFmp, fmpApiKey, newsUrl } from "@/events/fmp/client";
import { mapEarningsPayload, mapNewsPayload, selectEarnings } from "@/events/fmp/map";
import { notConfiguredRead } from "@/events/project";
import { normalizeTickers } from "@/domain/watchlist";

interface Cached<T> {
  cachedAtMs: number;
  latencyMs: number | null;
  value: T;
}

interface TickerMemory {
  earnings: Cached<EarningsEvent | null> | null;
  earningsFailure: { atMs: number; code: ProviderFailure; latencyMs: number | null } | null;
  news: Cached<CompanyNewsItem[]> | null;
  newsFailure: { atMs: number; code: ProviderFailure; latencyMs: number | null } | null;
  archive: CompanyNewsItem[];
  blockedUntilMs: number;
  backoffMs: number;
}

const memory = new Map<string, TickerMemory>();
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export function resetEventIntelligence(): void {
  memory.clear();
}

export function readCachedUnderlyingEvents(input: {
  ticker: string;
  nowMs: number;
  fidelity: "live" | "paper";
}): UnderlyingEventRead {
  const ticker = acceptTicker(input.ticker);
  const policy = eventTradingPolicy(input.fidelity);
  const observedAt = new Date(input.nowMs).toISOString();
  if (!ticker) {
    return failureRead(input.ticker.toUpperCase(), observedAt, policy, "INVALID_RESPONSE", null);
  }
  if (!fmpApiKey()) {
    return notConfiguredRead(ticker, observedAt, policy);
  }
  const stored = memory.get(ticker);
  if (!stored) {
    return failureRead(ticker, observedAt, policy, "UNKNOWN_ERROR", null, "EVENT_CACHE_COLD");
  }
  return assemble(ticker, observedAt, input.nowMs, policy, stored);
}

/**
 * One earnings read and one news read per ticker when the cache is cold.
 * Call this from the server entry before the synchronous context build.
 */
export async function warmUnderlyingEvents(input: {
  tickers: readonly string[];
  nowMs: number;
  fidelity: "live" | "paper";
}): Promise<void> {
  if (!fmpApiKey()) {
    return;
  }
  const tickers = normalizeTickers(input.tickers).tickers;
  for (const ticker of tickers) {
    await warmTicker(ticker, input.nowMs);
  }
}

export function openPositionTickers(symbols: readonly string[]): string[] {
  return normalizeTickers(symbols).tickers;
}

async function warmTicker(ticker: string, nowMs: number): Promise<void> {
  const key = fmpApiKey();
  if (!key) {
    return;
  }
  const stored = ensure(ticker);
  if (nowMs < stored.blockedUntilMs && (fresh(stored.earnings, nowMs, earningsTtlMs()) || fresh(stored.news, nowMs, newsTtlMs()))) {
    return;
  }
  if (nowMs < stored.blockedUntilMs) {
    return;
  }
  if (!fresh(stored.earnings, nowMs, earningsTtlMs())) {
    const result = await fetchFmp(earningsUrl(ticker, key));
    if (!result.ok) {
      noteFailure(stored, "earnings", result.code, result.latencyMs, nowMs);
    } else {
      const mapped = mapEarningsPayload(result.body, ticker, new Date(nowMs).toISOString(), nowMs);
      if (mapped.invalid) {
        noteFailure(stored, "earnings", "INVALID_RESPONSE", result.latencyMs, nowMs);
      } else {
        stored.earnings = { cachedAtMs: nowMs, latencyMs: result.latencyMs, value: selectEarnings(mapped.events, nowMs) };
        stored.earningsFailure = null;
        stored.backoffMs = BASE_BACKOFF_MS;
      }
    }
  }
  if (!fresh(stored.news, nowMs, newsTtlMs())) {
    const result = await fetchFmp(newsUrl(ticker, key));
    if (!result.ok) {
      noteFailure(stored, "news", result.code, result.latencyMs, nowMs);
    } else {
      const mapped = mapNewsPayload(result.body, ticker, new Date(nowMs).toISOString(), nowMs);
      if (mapped.invalid) {
        noteFailure(stored, "news", "INVALID_RESPONSE", result.latencyMs, nowMs);
      } else {
        stored.archive = mergeArchive(stored.archive, mapped.items);
        stored.news = { cachedAtMs: nowMs, latencyMs: result.latencyMs, value: stored.archive };
        stored.newsFailure = null;
        stored.backoffMs = BASE_BACKOFF_MS;
      }
    }
  }
}

function noteFailure(stored: TickerMemory, side: "earnings" | "news", code: ProviderFailure, latencyMs: number | null, nowMs: number): void {
  const failure = { atMs: nowMs, code, latencyMs };
  if (side === "earnings") {
    stored.earningsFailure = failure;
  } else {
    stored.newsFailure = failure;
  }
  if (code === "RATE_LIMITED") {
    stored.blockedUntilMs = nowMs + stored.backoffMs;
    stored.backoffMs = Math.min(stored.backoffMs * 2, MAX_BACKOFF_MS);
  }
}

function assemble(
  ticker: string,
  observedAt: string,
  nowMs: number,
  policy: UnderlyingEventRead["policy"],
  stored: TickerMemory,
): UnderlyingEventRead {
  const earningsFresh = fresh(stored.earnings, nowMs, earningsTtlMs());
  const newsFresh = fresh(stored.news, nowMs, newsTtlMs());
  const earnings = earningsFresh ? stored.earnings?.value ?? null : null;
  const newsArchive = newsFresh ? refreshAges(stored.news?.value ?? [], nowMs) : [];
  const selected = newsFresh ? selectCurrentNews(newsArchive) : { current: [], historicalCount: stored.archive.length };
  const earningsReason = earningsFresh ? null : stored.earningsFailure?.code ?? "UNKNOWN_ERROR";
  const newsReason = newsFresh ? (selected.current.length === 0 && selected.historicalCount > 0 ? "STALE" : null) : stored.newsFailure?.code ?? "UNKNOWN_ERROR";
  const latency = latestLatency(stored);
  return {
    ticker,
    observedAt,
    cachedAt: cacheStamp(stored),
    newsStatus: newsFresh ? (newsReason === "STALE" ? "STALE" : "AVAILABLE") : "UNAVAILABLE",
    newsReason,
    newsItems: newsFresh ? selected.current : null,
    newsHistoricalCount: selected.historicalCount,
    earningsStatus: earningsFresh ? "AVAILABLE" : "UNAVAILABLE",
    earningsReason: earningsFresh ? null : earningsReason,
    earnings: earningsFresh ? earnings : null,
    window: earningsWindow(earningsFresh ? earnings?.reportedDate ?? null : null, nowMs, policy),
    policy,
    health: {
      provider: "FMP",
      earnings: earningsFresh ? "CONNECTED" : "ERROR",
      news: newsFresh ? "CONNECTED" : "ERROR",
      lastSuccessAt: successAt(stored),
      latencyMs: latency,
    },
  };
}

function failureRead(
  ticker: string,
  observedAt: string,
  policy: UnderlyingEventRead["policy"],
  code: ProviderFailure,
  latencyMs: number | null,
  reason: string = code,
): UnderlyingEventRead {
  return {
    ticker,
    observedAt,
    cachedAt: null,
    newsStatus: "UNAVAILABLE",
    newsReason: reason,
    newsItems: null,
    newsHistoricalCount: 0,
    earningsStatus: "UNAVAILABLE",
    earningsReason: reason,
    earnings: null,
    window: "NORMAL",
    policy,
    health: {
      provider: "FMP",
      earnings: "ERROR",
      news: "ERROR",
      lastSuccessAt: null,
      latencyMs,
    },
  };
}

function acceptTicker(ticker: string): string | null {
  return normalizeTickers([ticker]).tickers[0] ?? null;
}

function ensure(ticker: string): TickerMemory {
  const existing = memory.get(ticker);
  if (existing) {
    return existing;
  }
  const created: TickerMemory = {
    earnings: null,
    earningsFailure: null,
    news: null,
    newsFailure: null,
    archive: [],
    blockedUntilMs: 0,
    backoffMs: BASE_BACKOFF_MS,
  };
  memory.set(ticker, created);
  return created;
}

function fresh<T>(entry: Cached<T> | null, nowMs: number, ttl: number): boolean {
  return entry !== null && nowMs - entry.cachedAtMs < ttl;
}

function mergeArchive(prior: readonly CompanyNewsItem[], next: readonly CompanyNewsItem[]): CompanyNewsItem[] {
  const byId = new Map<string, CompanyNewsItem>();
  for (const item of [...prior, ...next]) {
    byId.set(item.newsId, item);
  }
  return [...byId.values()];
}

function cacheStamp(stored: TickerMemory): string | null {
  const stamps = [stored.earnings?.cachedAtMs, stored.news?.cachedAtMs].filter((value): value is number => value !== undefined);
  if (stamps.length === 0) {
    return null;
  }
  return new Date(Math.max(...stamps)).toISOString();
}

function refreshAges(items: readonly CompanyNewsItem[], nowMs: number): CompanyNewsItem[] {
  const next: CompanyNewsItem[] = [];
  for (const item of items) {
    const freshness = newsFreshness(item.publishedAt, nowMs);
    if (freshness) {
      next.push({ ...item, freshness });
    }
  }
  return next;
}

function successAt(stored: TickerMemory): string | null {
  const stamps = [stored.earnings?.cachedAtMs, stored.news?.cachedAtMs].filter((value): value is number => value !== undefined);
  if (stamps.length === 0) {
    return null;
  }
  return new Date(Math.max(...stamps)).toISOString();
}

function latestLatency(stored: TickerMemory): number | null {
  const values = [stored.earnings?.latencyMs, stored.news?.latencyMs, stored.earningsFailure?.latencyMs, stored.newsFailure?.latencyMs];
  const measured = values.filter((value): value is number => typeof value === "number");
  return measured.length === 0 ? null : measured[measured.length - 1] ?? null;
}
