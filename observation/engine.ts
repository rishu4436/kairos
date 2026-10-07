import type { FreshnessPolicy } from "@/domain/freshness";
import type { MarketObservationRecord } from "@/domain/observation";
import type { UserWatchlist } from "@/domain/watchlist";
import { addressKey, mapRepresentation } from "@/services/binance/mapper";
import type { RwaGateway } from "@/services/binance/gateway";
import type { BinanceListedToken, BinancePlatform, BinanceRwaPrice, BinanceSearchAsset, BinanceSearchHit } from "@/services/binance/types";

export interface ObservationRun {
  observations: MarketObservationRecord[];
  unresolved: { ticker: string; reason: string }[];
}

export async function observeWatchlist(input: {
  watchlist: UserWatchlist;
  gateway: RwaGateway;
  receivedAtMs: number;
  policy: FreshnessPolicy;
  signal?: AbortSignal;
}): Promise<ObservationRun> {
  const platforms = await input.gateway.listPlatforms(input.signal);
  const platformById = new Map<string, BinancePlatform>();
  for (const platform of platforms) {
    if (platform.platformId) {
      platformById.set(platform.platformId, platform);
    }
  }

  const drafts: { ticker: string; companyName: string; asset: BinanceSearchAsset }[] = [];
  const unresolved: { ticker: string; reason: string }[] = [];

  for (const ticker of input.watchlist.tickers) {
    const hits = await input.gateway.search(ticker, input.signal);
    const match = exactHit(hits, ticker);
    if (!match || !match.assets || match.assets.length === 0) {
      unresolved.push({ ticker, reason: "No tokenized representation was returned for this ticker." });
      continue;
    }
    const seen = new Set<string>();
    for (const asset of match.assets) {
      const chainId = asset.binanceChainId?.trim();
      const contract = asset.tokenContractAddress?.trim();
      if (!chainId || !contract) {
        unresolved.push({ ticker, reason: "A search row omitted the chain or contract address." });
        continue;
      }
      const key = addressKey(chainId, contract);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      drafts.push({
        ticker,
        companyName: match.companyName?.trim() || ticker,
        asset,
      });
    }
  }

  const byChain = new Map<string, string[]>();
  for (const draft of drafts) {
    const chainId = draft.asset.binanceChainId?.trim();
    const contract = draft.asset.tokenContractAddress?.trim();
    if (!chainId || !contract) {
      continue;
    }
    const list = byChain.get(chainId) ?? [];
    list.push(contract);
    byChain.set(chainId, list);
  }

  const listed = new Map<string, BinanceListedToken>();
  const prices = new Map<string, BinanceRwaPrice>();
  for (const [chainId, addresses] of byChain) {
    const tokens = await input.gateway.listTokens(chainId, input.signal);
    for (const token of tokens) {
      if (!token.binanceChainId || !token.tokenContractAddress) {
        continue;
      }
      listed.set(addressKey(token.binanceChainId, token.tokenContractAddress), token);
    }
    const quotes = await input.gateway.getPrices(chainId, addresses, input.signal);
    for (const quote of quotes) {
      if (!quote.binanceChainId || !quote.tokenContractAddress) {
        continue;
      }
      prices.set(addressKey(quote.binanceChainId, quote.tokenContractAddress), quote);
    }
  }

  const observations: MarketObservationRecord[] = [];
  for (const draft of drafts) {
    const chainId = draft.asset.binanceChainId?.trim() ?? "";
    const contract = draft.asset.tokenContractAddress?.trim() ?? "";
    const key = addressKey(chainId, contract);
    const mapped = mapRepresentation({
      userId: input.watchlist.userId,
      draft,
      listed: listed.get(key) ?? null,
      price: prices.get(key) ?? null,
      platform: draft.asset.platformId ? platformById.get(draft.asset.platformId) ?? null : null,
      receivedAtMs: input.receivedAtMs,
      policy: input.policy,
    });
    if (!mapped.ok) {
      unresolved.push({ ticker: mapped.ticker, reason: mapped.reason });
      continue;
    }
    observations.push(mapped.observation);
  }

  observations.sort((left, right) => compareObservations(left, right, input.watchlist.tickers));
  return { observations, unresolved };
}

function exactHit(hits: readonly BinanceSearchHit[], ticker: string): BinanceSearchHit | null {
  return hits.find((hit) => hit.ticker?.trim().toUpperCase() === ticker) ?? null;
}

function compareObservations(
  left: MarketObservationRecord,
  right: MarketObservationRecord,
  order: readonly string[],
): number {
  const tickerDelta = order.indexOf(left.underlying.ticker) - order.indexOf(right.underlying.ticker);
  if (tickerDelta !== 0) {
    return tickerDelta;
  }
  const leftBnb = left.representation.chainId === "56" ? 0 : 1;
  const rightBnb = right.representation.chainId === "56" ? 0 : 1;
  if (leftBnb !== rightBnb) {
    return leftBnb - rightBnb;
  }
  return left.representation.platformId.localeCompare(right.representation.platformId);
}
