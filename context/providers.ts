import type { Availability, MarketEvent } from "@/context/types";
import type { CompanyNewsItem, EarningsEvent, EarningsWindow, EventProviderHealth, EventTradingPolicy } from "@/events/model";

/**
 * Future event sources. Only the Binance tokenized-security adapter is connected.
 * A provider returns what it was given. It does not invent an event.
 */
export interface EventReadInput {
  assetId: string;
  ticker: string;
  nowMs: number;
  tokenizedStatus: TokenizedStatusInput | null;
}

export interface TokenizedStatusInput {
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  openState: boolean | null;
  nextOpenAt: string | null;
  observedAt: string | null;
  source: string;
}

export interface EventReadResult {
  status: Availability;
  /** True only when the provider returned a payload for this cycle. */
  providerAnswered: boolean;
  events: readonly MarketEvent[];
  reason: string | null;
}

export interface EventProvider {
  readonly id: string;
  read(input: EventReadInput): EventReadResult;
}

export interface NewsQuery {
  userId: string;
  assetId: string;
  /** Underlying equity ticker. This is not a token contract. */
  underlyingTicker: string;
  nowMs: number;
  fidelity: "live" | "paper";
}

export interface NewsRead {
  status: Availability;
  providerConnected: boolean;
  /** Null when the provider did not answer. An empty list is an answer, not "no news" inferred from a failure. */
  items: readonly CompanyNewsItem[] | null;
  historicalCount: number;
  reason: string;
  health: EventProviderHealth;
  cachedAt: string | null;
  observedAt: string;
}

export interface NewsProvider {
  readonly id: string;
  read(input: NewsQuery): NewsRead;
}

export interface EarningsQuery {
  userId: string;
  assetId: string;
  underlyingTicker: string;
  nowMs: number;
  fidelity: "live" | "paper";
}

export interface EarningsRead {
  status: Availability;
  event: EarningsEvent | null;
  window: EarningsWindow;
  policy: EventTradingPolicy;
  reason: string;
  health: EventProviderHealth;
  cachedAt: string | null;
  observedAt: string;
}

/**
 * An earnings restriction on a tokenized security is not an earnings date
 * and is not a reported EPS. This provider reads the underlying equity.
 */
export interface EarningsProvider {
  readonly id: string;
  read(input: EarningsQuery): EarningsRead;
}
