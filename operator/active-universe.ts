import type { OperatorConfig } from "@/operator/config";
import type { UserWatchlist } from "@/domain/watchlist";
import { configuredWatchlist, createUserWatchlist } from "@/domain/watchlist";

export const AUTO_WATCHLIST_MAX = 5;

export interface ActiveUniverse {
  ok: true;
  watchlist: UserWatchlist;
  entries: OperatorConfig["watchlist"]["entries"];
}

export interface EmptyUniverse {
  ok: false;
  reason: "AUTO_WATCHLIST_EMPTY" | "UNCONFIGURED" | "MANUAL_EMPTY";
}

/** Supported representations come from the configured discovery list. Contracts are not invented. */
export function supportedRepresentations(userId: string) {
  return configuredWatchlist(userId).items.filter((item) => item.enabled && item.chainId === "56");
}

export function ensureAutoWatchlist(config: OperatorConfig, maxAssets = AUTO_WATCHLIST_MAX): ActiveUniverse | EmptyUniverse {
  const supported = supportedRepresentations(config.identity.userId);
  const pins = config.watchlist.entries.filter((entry) => entry.pinned && supported.some((item) => item.ticker === entry.ticker));
  const room = Math.max(0, Math.min(maxAssets, AUTO_WATCHLIST_MAX) - pins.length);
  const auto = supported
    .filter((item) => !pins.some((entry) => entry.ticker === item.ticker))
    .slice(0, room)
    .map((item) => ({
      ticker: item.ticker,
      representationId: item.representationId ?? `${item.chainId}:${item.ticker}`,
      chainId: item.chainId,
      contractAddress: item.contractAddress,
      source: "AUTO" as const,
      pinned: false,
    }));
  const entries = [...pins, ...auto];
  if (entries.length === 0) {
    return { ok: false, reason: "AUTO_WATCHLIST_EMPTY" };
  }
  return { ok: true, entries, watchlist: watchlistFrom(config.identity.userId, entries.map((entry) => entry.ticker)) };
}

export function observationUniverse(config: OperatorConfig): ActiveUniverse | EmptyUniverse {
  const mode = config.mandate.operatorMode;
  if (mode === "UNCONFIGURED") {
    return { ok: false, reason: "UNCONFIGURED" };
  }
  const supported = new Set(supportedRepresentations(config.identity.userId).map((item) => item.ticker));
  if (mode === "MANUAL") {
    const tickers = config.mandate.selectedManualAssets.filter((ticker) => supported.has(ticker));
    if (tickers.length === 0) {
      return { ok: false, reason: "MANUAL_EMPTY" };
    }
    return { ok: true, entries: config.watchlist.entries.filter((entry) => tickers.includes(entry.ticker)), watchlist: watchlistFrom(config.identity.userId, tickers) };
  }
  const tickers = config.watchlist.entries.map((entry) => entry.ticker).filter((ticker) => supported.has(ticker));
  if (tickers.length === 0) {
    return { ok: false, reason: "AUTO_WATCHLIST_EMPTY" };
  }
  return { ok: true, entries: config.watchlist.entries, watchlist: watchlistFrom(config.identity.userId, tickers) };
}

export function mandateReady(config: OperatorConfig): boolean {
  if (config.mandate.operatorMode === "AUTO") {
    return config.mandate.autoProfile !== null && Boolean(config.mandate.autoProfileVersion) && config.watchlist.entries.length > 0;
  }
  if (config.mandate.operatorMode === "MANUAL") {
    const supported = new Set(supportedRepresentations(config.identity.userId).map((item) => item.ticker));
    return config.mandate.selectedManualStrategies.length > 0 && config.mandate.selectedManualAssets.some((ticker) => supported.has(ticker));
  }
  return false;
}

function watchlistFrom(userId: string, tickers: string[]): UserWatchlist {
  return createUserWatchlist(userId, tickers, "Operating universe");
}
