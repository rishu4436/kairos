import type { EarningsProvider, EarningsQuery, EarningsRead, NewsProvider, NewsQuery, NewsRead } from "@/context/providers";
import { readCachedUnderlyingEvents } from "@/events/service";

export const fmpNewsProvider: NewsProvider = {
  id: "FmpNewsProvider",
  read(input: NewsQuery): NewsRead {
    const read = readCachedUnderlyingEvents({
      ticker: input.underlyingTicker,
      nowMs: input.nowMs,
      fidelity: input.fidelity,
    });
    return {
      status: read.newsStatus === "STALE" ? "STALE" : read.newsStatus,
      providerConnected: read.health.news === "CONNECTED",
      items: read.newsItems,
      historicalCount: read.newsHistoricalCount,
      reason: read.newsReason ?? (read.newsStatus === "AVAILABLE" ? "PROVIDER_ANSWERED" : "NOT_CONFIGURED"),
      health: read.health,
      cachedAt: read.cachedAt,
      observedAt: read.observedAt,
    };
  },
};

export const fmpEarningsProvider: EarningsProvider = {
  id: "FmpEarningsProvider",
  read(input: EarningsQuery): EarningsRead {
    const read = readCachedUnderlyingEvents({
      ticker: input.underlyingTicker,
      nowMs: input.nowMs,
      fidelity: input.fidelity,
    });
    return {
      status: read.earningsStatus,
      event: read.earnings,
      window: read.window,
      policy: read.policy,
      reason: read.earningsReason ?? (read.earningsStatus === "AVAILABLE" ? "PROVIDER_ANSWERED" : "NOT_CONFIGURED"),
      health: read.health,
      cachedAt: read.cachedAt,
      observedAt: read.observedAt,
    };
  },
};
