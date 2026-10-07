import { isEvmAddress, PRODUCTION_CHAIN_ID, representationIdentity } from "@/domain/network";

export interface WatchlistItem {
  ticker: string;
  tokenSymbol: string | null;
  chainId: string;
  contractAddress: string | null;
  enabled: boolean;
  representationId: string | null;
}

export interface UserWatchlist {
  id: string;
  userId: string;
  name: string;
  tickers: readonly string[];
  items: readonly WatchlistItem[];
}

export type WatchlistAdmitResult =
  | { ok: true; item: WatchlistItem }
  | { ok: false; reason: "UNLISTED" | "DISABLED" | "WRONG_CHAIN" | "INVALID_CONTRACT" | "DUPLICATE" | "EMPTY" };

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
    items: normalized.tickers.map((ticker) => tickerItem(ticker)),
  };
}

export function emptyWatchlist(userId: string, name = "Empty"): UserWatchlist {
  const user = userId.trim();
  if (user.length === 0) {
    throw new Error("A watchlist requires a user id.");
  }
  return { id: `wl_${user}_empty`, userId: user, name, tickers: [], items: [] };
}

function tickerItem(ticker: string): WatchlistItem {
  return {
    ticker,
    tokenSymbol: null,
    chainId: PRODUCTION_CHAIN_ID,
    contractAddress: null,
    enabled: true,
    representationId: null,
  };
}

export function admitWatchlistItem(
  universe: UserWatchlist,
  candidate: Partial<WatchlistItem> & { ticker: string },
): WatchlistAdmitResult {
  const ticker = candidate.ticker.trim().toUpperCase();
  if (universe.tickers.length === 0 && universe.items.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }
  const listed = universe.items.find((item) => item.ticker === ticker) ?? (universe.tickers.includes(ticker) ? tickerItem(ticker) : null);
  if (!listed) {
    return { ok: false, reason: "UNLISTED" };
  }
  if (listed.enabled === false || candidate.enabled === false) {
    return { ok: false, reason: "DISABLED" };
  }
  const chainId = (candidate.chainId ?? listed.chainId).trim();
  if (chainId !== PRODUCTION_CHAIN_ID) {
    return { ok: false, reason: "WRONG_CHAIN" };
  }
  const contract = candidate.contractAddress ?? listed.contractAddress;
  if (contract !== null && contract.trim().length > 0 && !isEvmAddress(contract)) {
    return { ok: false, reason: "INVALID_CONTRACT" };
  }
  const representationId =
    contract && isEvmAddress(contract) ? representationIdentity(chainId, contract) : listed.representationId;
  return {
    ok: true,
    item: {
      ticker,
      tokenSymbol: candidate.tokenSymbol ?? listed.tokenSymbol,
      chainId,
      contractAddress: contract,
      enabled: true,
      representationId,
    },
  };
}

/**
 * Persisted Redis/paper identity for the single local operating agent.
 * Literal values stay stable so existing durable keys continue to load.
 */
export const LOCAL_RUNTIME_USER_ID = "user_demo";
export const DEFAULT_AGENT_ID = "agent_demo";
export const DEFAULT_POLICY_ID = "policy_demo";
export const CONFIGURED_WATCHLIST_TICKERS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "SPY"] as const;

/** @deprecated Use LOCAL_RUNTIME_USER_ID. Stored value is unchanged. */
export const DEMO_USER_ID = LOCAL_RUNTIME_USER_ID;
/** @deprecated Use CONFIGURED_WATCHLIST_TICKERS. */
export const DEMO_WATCH_TICKERS = CONFIGURED_WATCHLIST_TICKERS;

export function configuredWatchlist(userId: string = LOCAL_RUNTIME_USER_ID): UserWatchlist {
  return createUserWatchlist(userId, CONFIGURED_WATCHLIST_TICKERS, "Tokenized equities");
}

/** @deprecated Use configuredWatchlist. */
export function demoWatchlist(userId: string = LOCAL_RUNTIME_USER_ID): UserWatchlist {
  return configuredWatchlist(userId);
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
