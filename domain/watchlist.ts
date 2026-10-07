export interface UserWatchlist {
  id: string;
  userId: string;
  name: string;
  tickers: readonly string[];
}

export interface TickerNormalization {
  tickers: string[];
  rejected: string[];
}

const TICKER = /^[A-Z][A-Z0-9.]{0,11}$/;

/** Uppercase, trim, and drop duplicates. Invalid entries are returned, not coerced. */
export function normalizeTickers(input: readonly string[]): TickerNormalization {
  const tickers: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const ticker = raw.trim().toUpperCase();
    if (!TICKER.test(ticker)) {
      rejected.push(raw);
      continue;
    }
    if (seen.has(ticker)) {
      continue;
    }
    seen.add(ticker);
    tickers.push(ticker);
  }
  return { tickers, rejected };
}

/**
 * One watchlist belongs to one user. Callers pass the user id.
 * This function does not read or write a shared list.
 */
export function createUserWatchlist(
  userId: string,
  input: readonly string[],
  name = "Primary",
): UserWatchlist {
  const user = userId.trim();
  if (user.length === 0) {
    throw new Error("A watchlist requires a user id.");
  }
  const normalized = normalizeTickers(input);
  if (normalized.rejected.length > 0) {
    throw new Error(`Watchlist rejected invalid tickers: ${normalized.rejected.join(", ")}`);
  }
  if (normalized.tickers.length === 0) {
    throw new Error("A watchlist requires at least one ticker.");
  }
  return {
    id: `wl_${user}_${normalized.tickers.join("-")}`,
    userId: user,
    name,
    tickers: normalized.tickers,
  };
}

/** First live watchlist. Resolved through the RWA search API. Symbols are not assumed. */
export const DEMO_USER_ID = "user_demo";

export const DEMO_WATCH_TICKERS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "SPY"] as const;

export function demoWatchlist(userId: string = DEMO_USER_ID): UserWatchlist {
  return createUserWatchlist(userId, DEMO_WATCH_TICKERS, "Tokenized equities");
}

const PLATFORM_LABELS: Record<string, string> = {
  ondo: "Ondo Finance",
  bstock: "bStocks",
};

/** Known labels only. Any other platform id is shown as the source returned it. */
export function platformLabel(platformId: string): string {
  return PLATFORM_LABELS[platformId] ?? platformId;
}

const CHAIN_LABELS: Record<string, string> = {
  "56": "BNB Smart Chain",
  "1": "Ethereum",
  CT_501: "Solana",
};

export function chainLabel(chainId: string): string {
  return CHAIN_LABELS[chainId] ?? chainId;
}

export type UnderlyingKind = "stock" | "etf" | "pre_ipo" | "unknown";

export function underlyingKind(assetType: number | null | undefined): UnderlyingKind {
  if (assetType === 1) {
    return "stock";
  }
  if (assetType === 2) {
    return "pre_ipo";
  }
  if (assetType === 3) {
    return "etf";
  }
  return "unknown";
}
