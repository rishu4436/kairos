import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { fuseContext, type FusionInput } from "@/context/fusion";
import { serializeContext } from "@/context/snapshot";
import { earningsUrl, fetchFmp, newsUrl, setFmpTransport, type FmpTransport } from "@/events/fmp/client";
import { mapEarningsPayload, mapNewsPayload, selectEarnings } from "@/events/fmp/map";
import { correlateEvents } from "@/events/correlate";
import { surprise } from "@/events/surprise";
import { earningsWindow } from "@/events/window";
import { newsFreshness, newsIdFor, selectCurrentNews } from "@/events/news";
import { eventTradingPolicy } from "@/events/policy";
import { readCachedUnderlyingEvents, resetEventIntelligence, warmUnderlyingEvents } from "@/events/service";
import type { MarketEvent } from "@/context/types";
import { momentumStrategy } from "@/strategies/momentum";
import { buildStrategyContext } from "@/strategies/context";

const NOW = Date.parse("2026-10-06T15:00:00.000Z");
const POLICY = { ...eventTradingPolicy("paper"), eventReductionEnabled: false, preEventDays: 3, postEventDays: 2 };

describe("underlying event intelligence", () => {
  afterEach(() => {
    setFmpTransport(null);
    resetEventIntelligence();
    delete process.env.FMP_API_KEY;
  });

  it("normalizes upcoming and reported earnings without inventing missing fields", () => {
    const upcoming = mapEarningsPayload([{ symbol: "TSLA", date: "2026-10-09", epsEstimated: 0.5, time: "amc" }], "TSLA", "2026-10-06T15:00:00.000Z", NOW);
    expect(upcoming.invalid).toBe(false);
    expect(upcoming.events[0]?.status).toBe("UPCOMING");
    expect(upcoming.events[0]?.reportTime).toBe("AFTER_CLOSE");
    expect(upcoming.events[0]?.epsActual).toBeNull();
    expect(upcoming.events[0]?.epsSurprise).toBeNull();
    expect(earningsWindow(upcoming.events[0]?.reportedDate ?? null, NOW, POLICY)).toBe("PRE_EVENT");

    const reported = mapEarningsPayload([{ symbol: "TSLA", date: "2026-10-01", epsActual: 0.8, epsEstimated: 0.5, revenueActual: 100, revenueEstimated: 80, time: "bmo", lastUpdated: "2026-10-01" }], "TSLA", "2026-10-06T15:00:00.000Z", NOW);
    expect(reported.events[0]?.status).toBe("REPORTED");
    expect(reported.events[0]?.reportTime).toBe("BEFORE_OPEN");
    expect(reported.events[0]?.epsSurprise).toBe("0.3");
    expect(reported.events[0]?.epsSurprisePct).toBe("60");
    expect(reported.events[0]?.revenueSurprisePct).toBe("25");
    expect(earningsWindow("2026-10-01", NOW, POLICY)).toBe("NORMAL");

    const today = mapEarningsPayload([{ symbol: "TSLA", date: "2026-10-06", time: "dmh" }], "TSLA", "2026-10-06T15:00:00.000Z", NOW);
    expect(today.events[0]?.status).toBe("TODAY");
    expect(today.events[0]?.reportTime).toBe("UNKNOWN");
    expect(earningsWindow("2026-10-06", NOW, POLICY)).toBe("EVENT_DAY");
    expect(earningsWindow("2026-10-05", NOW, POLICY)).toBe("POST_EVENT");
    expect(earningsWindow("2026-10-04", NOW, POLICY)).toBe("POST_EVENT");
  });

  it("keeps a missing estimate or actual null and refuses to divide by zero", () => {
    const missing = mapEarningsPayload([{ symbol: "AAPL", date: "2026-10-20", epsEstimated: null, epsActual: null }], "AAPL", "2026-10-06T15:00:00.000Z", NOW);
    expect(missing.events[0]?.epsEstimated).toBeNull();
    expect(missing.events[0]?.epsActual).toBeNull();
    expect(missing.events[0]?.epsSurprise).toBeNull();
    expect(surprise("1.25", null)).toEqual({ absolute: null, percent: null });
    expect(surprise("1", "0")).toEqual({ absolute: "1", percent: null });
  });

  it("maps, dedupes, and ages news without storing a repeated article", () => {
    const observed = "2026-10-06T15:00:00.000Z";
    const first = mapNewsPayload([
      { symbol: "NVDA", title: "Chip supply update", text: "A short snippet", publisher: "Wire", publishedDate: "2026-10-06T14:30:00.000Z", url: "https://example.com/a", image: "https://example.com/a.jpg" },
      { symbol: "NVDA", title: "Chip supply update", text: "A short snippet", publisher: "Wire", publishedDate: "2026-10-06T14:30:00.000Z", url: "https://example.com/a" },
    ], "NVDA", observed, NOW);
    expect(first.invalid).toBe(false);
    expect(first.items).toHaveLength(2);
    expect(selectCurrentNews(first.items).current).toHaveLength(1);
    expect(first.items[0]?.newsId).toBe(first.items[1]?.newsId);
    expect(first.items[0]?.freshness).toBe("FRESH");
    expect(first.items[0]?.snippet).toBe("A short snippet");
    expect(first.items[0]?.imageUrl).toBe("https://example.com/a.jpg");
    const recent = newsFreshness("2026-10-06T08:00:00.000Z", NOW);
    const aging = newsFreshness("2026-10-05T15:00:00.000Z", NOW);
    const stale = newsFreshness("2026-10-01T15:00:00.000Z", NOW);
    expect(recent).toBe("RECENT");
    expect(aging).toBe("AGING");
    expect(stale).toBe("STALE");
    expect(newsIdFor({ id: null, url: null, headline: "Same", publishedAt: observed, ticker: "NVDA" }))
      .toBe(newsIdFor({ id: null, url: null, headline: "  same  ", publishedAt: observed, ticker: "NVDA" }));
  });

  it("classifies auth, rate limit, timeout, and malformed payloads", async () => {
    process.env.FMP_API_KEY = "test-key";
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ "Error Message": "Invalid API KEY" }), { status: 200 });
      setFmpTransport(null);
      const auth = await fetchFmp(earningsUrl("TSLA", "test-key"));
      expect(auth.ok).toBe(false);
      if (!auth.ok) {
        expect(auth.code).toBe("AUTHENTICATION_ERROR");
      }
      globalThis.fetch = async () => new Response("nope", { status: 429 });
      const limited = await fetchFmp(newsUrl("TSLA", "test-key"));
      expect(limited.ok).toBe(false);
      if (!limited.ok) {
        expect(limited.code).toBe("RATE_LIMITED");
      }
      globalThis.fetch = async () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      };
      const timed = await fetchFmp(newsUrl("TSLA", "test-key"));
      expect(timed.ok).toBe(false);
      if (!timed.ok) {
        expect(timed.code).toBe("TIMEOUT");
      }
    } finally {
      globalThis.fetch = original;
    }
    expect(mapEarningsPayload({ error: "nope" }, "TSLA", "2026-10-06T15:00:00.000Z", NOW).invalid).toBe(true);
    const cold = readCachedUnderlyingEvents({ ticker: "TSLA", nowMs: NOW, fidelity: "paper" });
    expect(cold.newsReason).toBe("EVENT_CACHE_COLD");
    expect(cold.newsItems).toBeNull();
    expect(cold.earningsReason).not.toBe("NO_EARNINGS");
  });

  it("uses one cached read per ticker and never sends a contract address", async () => {
    process.env.FMP_API_KEY = "test-key";
    const urls: string[] = [];
    const transport: FmpTransport = async (url) => {
      urls.push(url.toString().replace(/apikey=[^&]+/, "apikey=REDACTED"));
      if (url.pathname.endsWith("/earnings")) {
        return { ok: true, latencyMs: 12, body: [{ symbol: "TSLA", date: "2026-10-08", epsEstimated: 1.2, time: "amc" }] };
      }
      return { ok: true, latencyMs: 18, body: [{ symbol: "TSLA", title: "Factory note", publishedDate: "2026-10-06T14:00:00.000Z", publisher: "Desk", url: "https://example.com/tsla" }] };
    };
    setFmpTransport(transport);
    await warmUnderlyingEvents({ tickers: ["TSLA", "0xabc", "TSLA"], nowMs: NOW, fidelity: "paper" });
    await warmUnderlyingEvents({ tickers: ["TSLA"], nowMs: NOW + 1_000, fidelity: "paper" });
    expect(urls.some((url) => url.includes("0x"))).toBe(false);
    expect(urls.filter((url) => url.includes("/earnings"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("/news/stock"))).toHaveLength(1);
    expect(urls.every((url) => url.includes("apikey=REDACTED"))).toBe(true);
    const read = readCachedUnderlyingEvents({ ticker: "TSLA", nowMs: NOW + 1_000, fidelity: "paper" });
    expect(read.earnings?.underlyingTicker).toBe("TSLA");
    expect(read.window).toBe("PRE_EVENT");
    expect(read.newsItems).toHaveLength(1);
    expect(read.health.latencyMs).toBe(18);
    expect(JSON.stringify(read)).not.toContain("test-key");
    expect(JSON.stringify(read)).not.toContain("user_");
    const other = readCachedUnderlyingEvents({ ticker: "TSLA", nowMs: NOW + 1_000, fidelity: "paper" });
    expect(other.earnings?.eventId).toBe(read.earnings?.eventId);
  });

  it("keeps a provider failure distinct from an empty calendar and reuses the cache on 429", async () => {
    process.env.FMP_API_KEY = "test-key";
    let calls = 0;
    setFmpTransport(async (url) => {
      calls += 1;
      if (calls <= 2) {
        return url.pathname.endsWith("/earnings")
          ? { ok: true, latencyMs: 5, body: [{ symbol: "AMD", date: "2026-11-01", epsEstimated: 0.4 }] }
          : { ok: true, latencyMs: 5, body: [] };
      }
      return { ok: false, code: "RATE_LIMITED", latencyMs: 4 };
    });
    await warmUnderlyingEvents({ tickers: ["AMD"], nowMs: NOW, fidelity: "paper" });
    const answered = readCachedUnderlyingEvents({ ticker: "AMD", nowMs: NOW + 1_000, fidelity: "paper" });
    expect(answered.newsStatus).toBe("AVAILABLE");
    expect(answered.newsItems).toEqual([]);
    expect(answered.newsReason).toBeNull();
    await warmUnderlyingEvents({ tickers: ["AMD"], nowMs: NOW + 46 * 60 * 1000, fidelity: "paper" });
    const limited = readCachedUnderlyingEvents({ ticker: "AMD", nowMs: NOW + 46 * 60 * 1000, fidelity: "paper" });
    expect(limited.newsItems).toBeNull();
    expect(limited.newsReason).toBe("RATE_LIMITED");
    expect(limited.earningsReason).toBe("RATE_LIMITED");
  });

  it("corroborates a Binance earnings restriction only inside the date window", () => {
    const earnings = selectEarnings(mapEarningsPayload([{ symbol: "TSLA", date: "2026-10-08", epsEstimated: 1 }], "TSLA", "2026-10-06T15:00:00.000Z", NOW).events, NOW);
    const near = binanceEvent("2026-10-08T13:00:00.000Z");
    const far = binanceEvent("2026-01-01T13:00:00.000Z");
    const corroborated = correlateEvents({ ticker: "TSLA", earnings, binanceEvents: [near], policy: POLICY });
    const independent = correlateEvents({ ticker: "TSLA", earnings, binanceEvents: [far], policy: POLICY });
    expect(corroborated[0]?.state).toBe("CORROBORATED");
    expect(independent[0]?.state).toBe("INDEPENDENT");
    expect(correlateEvents({ ticker: "TSLA", earnings: null, binanceEvents: [], policy: POLICY })).toEqual([]);
  });

  it("does not let event fields change a momentum signal", () => {
    const plain = buildStrategyContext({
      ticker: "TSLA",
      assetName: "Tesla",
      representationId: "paper:TSLA",
      tokenSymbol: "TSLA",
      price: "100",
      referencePrice: null,
      session: "UNKNOWN",
      freshness: "SAMPLE",
      latestAgeMs: null,
      candles: [],
      fidelity: "paper",
      asOfMs: NOW,
      requiredPoints: 21,
    });
    const withEvents = { ...plain, eventWindow: "PRE_EVENT" as const, earningsState: "UPCOMING", newsAvailability: "AVAILABLE" as const, recentEventCount: 4 };
    expect(momentumStrategy.evaluate(withEvents).action).toBe(momentumStrategy.evaluate(plain).action);
    expect(momentumStrategy.evaluate(withEvents).evaluation).toBe(momentumStrategy.evaluate(plain).evaluation);
  });

  it("keeps the api key out of client source and context snapshots", () => {
    const client = readFileSync("events/fmp/client.ts", "utf8");
    expect(client).toContain("FMP_API_KEY");
    const bundle = ["components/markets/event-intelligence.tsx", "components/command/event-risk.tsx", "app/paper-lab/page.tsx"]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(bundle).not.toContain("FMP_API_KEY");
    expect(bundle).not.toContain("apikey");
    const read = readCachedUnderlyingEvents({ ticker: "TSLA", nowMs: NOW, fidelity: "paper" });
    expect(read.newsReason).toBe("NOT_CONFIGURED");
    expect(JSON.stringify(read)).not.toContain("FMP_API_KEY");
  });
});

function binanceEvent(effectiveAt: string): MarketEvent {
  return {
    eventId: `binance:${effectiveAt}`,
    assetId: "paper:TSLA",
    type: "EARNINGS",
    status: "ASSET_LIMITED",
    source: "BINANCE_TOKENIZED_SECURITY",
    observedAt: effectiveAt,
    effectiveAt,
    expiresAt: "2026-10-09T00:00:00.000Z",
    confidence: null,
    severity: "RESTRICTION",
    reason: "earnings",
    details: "earnings",
    semantics: { detected: "earnings", interpreted: "EARNINGS", hypothesis: null },
    freshness: "FRESH",
    origin: "REAL",
    active: true,
  };
}

describe("context keeps event facts replayable", () => {
  it("serializes provider status without a secret and leaves the score unchanged", () => {
    const base = minimalInput();
    const plain = fuseContext(base);
    const withEvents = fuseContext({
      ...base,
      underlyingEvents: {
        ticker: "NVDA",
        observedAt: new Date(NOW).toISOString(),
        cachedAt: new Date(NOW).toISOString(),
        newsStatus: "AVAILABLE",
        newsReason: null,
        newsItems: [{
          newsId: "fmp:news:nvda-1",
          underlyingTicker: "NVDA",
          headline: "Data center note",
          snippet: null,
          publisher: "Desk",
          publishedAt: new Date(NOW - 60_000).toISOString(),
          url: "https://example.com/nvda",
          imageUrl: null,
          provider: "FMP",
          observedAt: new Date(NOW).toISOString(),
          freshness: "FRESH",
        }],
        newsHistoricalCount: 1,
        earningsStatus: "AVAILABLE",
        earningsReason: null,
        earnings: {
          eventId: "fmp:earnings:NVDA:2026-10-08:0",
          underlyingTicker: "NVDA",
          reportedDate: "2026-10-08",
          reportTime: "AFTER_CLOSE",
          status: "UPCOMING",
          epsEstimated: "1.20",
          epsActual: null,
          revenueEstimated: null,
          revenueActual: null,
          epsSurprise: null,
          epsSurprisePct: null,
          revenueSurprise: null,
          revenueSurprisePct: null,
          source: "FMP",
          sourceUpdatedAt: null,
          observedAt: new Date(NOW).toISOString(),
        },
        window: "PRE_EVENT",
        policy: { version: "1.0", preEventDays: 3, postEventDays: 2, eventReductionEnabled: false },
        health: { provider: "FMP", earnings: "CONNECTED", news: "CONNECTED", lastSuccessAt: new Date(NOW).toISOString(), latencyMs: 21 },
      },
    });
    const saved = serializeContext(withEvents);
    expect(saved).toContain("fmp:news:nvda-1");
    expect(saved).toContain("fmp:earnings:NVDA:2026-10-08:0");
    expect(saved).toContain("PRE_EVENT");
    expect(saved).not.toContain("FMP_API_KEY");
    expect(saved).not.toContain("apikey");
    expect(withEvents.opportunity.state).not.toBe("BLOCKED");
    expect(withEvents.createsOrders).toBe(false);
    void plain;
  });
});

function minimalInput(): FusionInput {
  const at = new Date(NOW - 1_000).toISOString();
  return {
    userId: "user_a",
    agentId: "agent_a",
    cycleId: "cycle-1",
    nowMs: NOW,
    watchlist: ["NVDA"],
    identity: {
      underlyingTicker: "NVDA",
      underlyingName: "NVIDIA",
      representationId: "paper:NVDA",
      tokenSymbol: "NVDA",
      chainId: null,
      chainLabel: "Paper",
      contractAddress: null,
    },
    fidelity: "paper",
    marketFreshness: "SAMPLE",
    marketAgeMs: null,
    price: "100.00",
    priceObservedAt: at,
    receivedAt: new Date(NOW).toISOString(),
    session: "UNKNOWN",
    sessionLabel: "Unknown",
    rawMarketStatus: null,
    referencePrice: null,
    referenceObservedAt: null,
    deviationPct: null,
    historyPoints: 0,
    historyTimestampsMs: [],
    historyLatestClose: null,
    historyBarMs: 900_000,
    historySource: "PAPER_SAMPLE",
    features: [],
    regime: "UNKNOWN",
    regimeDetail: null,
    regimeSufficient: false,
    dataQualityStatus: "DEGRADED",
    dataQualityHistoryPoints: 0,
    dataQualityLatestAgeMs: null,
    dataQualityReferenceAgeMs: null,
    dataQualityMissing: [],
    signals: [],
    health: [],
    performance: [],
    externalRead: "ABSENT",
    externalError: null,
    externalSignals: [],
    security: null,
    securityObservedAt: null,
    securityEvents: [],
    tokenizedStatus: null,
    position: null,
    positionConflict: null,
    researchTheses: [],
    researchCandidates: [],
    prior: null,
  };
}

