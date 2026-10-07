import { referenceDeviationPct } from "@/domain/deviation";
import { classifyFreshness, type FreshnessPolicy } from "@/domain/freshness";
import type { MarketObservationRecord } from "@/domain/observation";
import { REFERENCE_PRICE_NOTE } from "@/domain/observation";
import { mapMarketSession } from "@/domain/session-state";
import { chainLabel, platformLabel, underlyingKind } from "@/domain/watchlist";
import { KairosApiError, safeMessage } from "@/services/binance/errors";
import { RWA_ENDPOINTS } from "@/services/binance/rwa-data";
import type { BinanceListedToken, BinancePlatform, BinanceRwaPrice, BinanceSearchAsset, BinanceStatusInfo } from "@/services/binance/types";

export interface RepresentationDraft {
  ticker: string;
  companyName: string;
  asset: BinanceSearchAsset;
}

export interface MappedRepresentation {
  ok: true;
  observation: MarketObservationRecord;
}

export interface RejectedRepresentation {
  ok: false;
  ticker: string;
  reason: string;
}

export function mapRepresentation(input: {
  userId: string;
  draft: RepresentationDraft;
  listed: BinanceListedToken | null;
  price: BinanceRwaPrice | null;
  platform: BinancePlatform | null;
  receivedAtMs: number;
  policy: FreshnessPolicy;
}): MappedRepresentation | RejectedRepresentation {
  const asset = input.draft.asset;
  const chainId = requiredText(asset.binanceChainId);
  const contract = requiredText(asset.tokenContractAddress);
  const platformId = requiredText(asset.platformId);
  const tokenSymbol = requiredText(asset.tokenSymbol ?? input.listed?.tokenSymbol);
  if (!chainId || !contract || !platformId || !tokenSymbol) {
    return {
      ok: false,
      ticker: input.draft.ticker,
      reason: "Search result is missing platform, chain, contract, or token symbol.",
    };
  }

  const tokenPrice = decimalString(input.price?.tokenPrice);
  const referencePrice = decimalString(input.price?.referencePrice);
  const updatedAt = epochMillis(input.price?.tokenPriceUpdatedAt);
  if (input.price && tokenPrice === null && referencePrice === null) {
    return {
      ok: false,
      ticker: input.draft.ticker,
      reason: "Price response did not include a numeric token or reference price.",
    };
  }

  const status = input.listed?.statusInfo ?? null;
  const rawStatus = optionalText(status?.marketStatus);
  const freshness = classifyFreshness(updatedAt, input.receivedAtMs, input.policy);
  const deviation = tokenPrice !== null && referencePrice !== null ? referenceDeviationPct(tokenPrice, referencePrice) : null;
  const assetType = asset.assetType ?? input.listed?.assetType ?? null;
  const id = representationId(chainId, contract);

  const observation: MarketObservationRecord = {
    id: `${id}:${updatedAt ?? input.receivedAtMs}`,
    timestamp: new Date(input.receivedAtMs).toISOString(),
    userId: input.userId,
    underlying: {
      ticker: input.draft.ticker,
      name: optionalText(input.draft.companyName) || optionalText(input.listed?.underlyingName) || input.draft.ticker,
      kind: underlyingKind(assetType),
    },
    representation: {
      id,
      underlyingTicker: input.draft.ticker,
      tokenSymbol,
      tokenName: optionalText(input.listed?.tokenName) || tokenSymbol,
      platformId,
      platformLabel: platformLabel(platformId),
      chainId,
      chainLabel: chainLabel(chainId),
      contractAddress: contract,
      decimals: optionalText(input.listed?.decimals),
      tokenToShareRatio: optionalText(input.listed?.tokenToShareRatio),
      logoUrl: optionalText(input.listed?.tokenLogoUrl) || optionalText(input.platform?.logoUrl),
      website: optionalText(input.platform?.website),
    },
    price: tokenPrice,
    referencePrice,
    priceDeviation: deviation === null ? null : { percent: deviation, label: "reference_deviation" },
    change24hPct: null,
    marketSession: mapMarketSession(rawStatus),
    rawMarketStatus: rawStatus,
    openState: typeof status?.openState === "boolean" ? status.openState : null,
    reasonCode: optionalText(status?.reasonCode),
    reasonMessage: optionalText(status?.reasonMsg),
    nextOpenAt: isoFromEpoch(status?.nextOpenTime),
    nextCloseAt: isoFromEpoch(status?.nextCloseTime),
    freshness,
    liquidity: {
      volume24hUsd: decimalString(input.listed?.volume24H),
      marketCapUsd: decimalString(input.listed?.marketCap),
    },
    source: {
      provider: "binance_web3",
      endpoints: [RWA_ENDPOINTS.SEARCH, RWA_ENDPOINTS.TOKENS, RWA_ENDPOINTS.PRICE, RWA_ENDPOINTS.PLATFORMS],
      fidelity: "live",
    },
    metadata: {
      priceUpdatedAt: freshness.sourceTimestamp,
      responseTimestamp: null,
      referencePriceNote: REFERENCE_PRICE_NOTE,
    },
  };

  return { ok: true, observation };
}

export function assertStatusTimes(status: BinanceStatusInfo | null): void {
  if (!status) {
    return;
  }
  for (const field of ["nextOpenTime", "nextCloseTime"] as const) {
    const value = status[field];
    if (value !== undefined && value !== null && epochMillis(value) === null) {
      throw new KairosApiError({
        category: "MALFORMED_RESPONSE",
        safeMessage: safeMessage("MALFORMED_RESPONSE"),
        technicalMessage: `${field} is not a millisecond timestamp.`,
      });
    }
  }
}

export function addressKey(chainId: string, address: string): string {
  if (chainId === "CT_501") {
    return `${chainId}:${address}`;
  }
  return `${chainId}:${address.toLowerCase()}`;
}

function representationId(chainId: string, contract: string): string {
  return addressKey(chainId, contract);
}

function requiredText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function optionalText(value: string | null | undefined): string | null {
  return requiredText(value);
}

function decimalString(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return value.trim();
}

export function epochMillis(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function isoFromEpoch(value: number | string | null | undefined): string | null {
  const ms = epochMillis(value);
  if (ms === null) {
    return null;
  }
  return new Date(ms).toISOString();
}
