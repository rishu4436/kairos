/** Transport shapes from the Binance Web3 RWA endpoints. Not domain types. */

export interface BinanceEnvelope<T> {
  code?: number | string;
  msg?: string;
  data?: T;
  timestamp?: number;
  success?: boolean;
}

export interface BinancePlatformChain {
  binanceChainId?: string;
  tokenCount?: number;
}

export interface BinancePlatform {
  platformId?: string;
  tickerCount?: number;
  chainDistribution?: BinancePlatformChain[];
  website?: string | null;
  logoUrl?: string | null;
}

export interface BinanceSearchAsset {
  platformId?: string;
  binanceChainId?: string;
  tokenContractAddress?: string;
  tokenSymbol?: string;
  assetType?: number;
}

export interface BinanceSearchHit {
  ticker?: string;
  companyName?: string;
  assets?: BinanceSearchAsset[];
}

export interface BinanceStatusInfo {
  openState?: boolean;
  marketStatus?: string;
  reasonCode?: string | null;
  reasonMsg?: string | null;
  nextOpenTime?: number | string | null;
  nextCloseTime?: number | string | null;
}

export interface BinanceListedToken {
  binanceChainId?: string;
  tokenContractAddress?: string;
  platformId?: string;
  assetType?: number;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogoUrl?: string;
  decimals?: string;
  underlyingTicker?: string;
  underlyingName?: string;
  tokenToShareRatio?: string;
  statusInfo?: BinanceStatusInfo;
  tokenPrice?: string;
  referencePrice?: string;
  volume24H?: string;
  marketCap?: string;
}

export interface BinanceRwaPrice {
  binanceChainId?: string;
  tokenContractAddress?: string;
  platformId?: string;
  tokenPrice?: string;
  referencePrice?: string;
  tokenPriceUpdatedAt?: number | string;
}
