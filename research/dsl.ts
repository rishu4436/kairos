import type { MarketRegime } from "@/domain/regime";
import type { MarketSessionState } from "@/domain/session-state";

/** Features the research DSL is allowed to name. Unknown ids fail validation. */
export const DSL_FEATURES = [
  "return_15m",
  "return_1h",
  "return_4h",
  "volatility_20",
  "price_vs_sma20",
  "market_session",
  "regime",
  "reference_deviation_bps",
  "momentum_1h",
] as const;

export type DslFeature = (typeof DSL_FEATURES)[number];

export const DSL_OPERATORS = ["GT", "GTE", "LT", "LTE", "EQ", "NEQ", "IN", "CROSS_ABOVE", "CROSS_BELOW"] as const;

export type DslOperator = (typeof DSL_OPERATORS)[number];

export const PROPOSAL_ACTIONS = ["BUY", "SELL", "OBSERVE"] as const;

export type ProposalAction = (typeof PROPOSAL_ACTIONS)[number];

export const CATEGORICAL_FEATURES = ["market_session", "regime", "price_vs_sma20"] as const;

export type DslThreshold = number | string | readonly string[];

export interface DslCondition {
  feature: string;
  operator: string;
  threshold: DslThreshold;
}

export const RESEARCH_SESSIONS = ["OPEN", "CLOSED", "PRE_OPEN", "POST_CLOSE", "UNKNOWN", "ANY"] as const;

export const RESEARCH_REGIMES = [
  "TRENDING_UP",
  "TRENDING_DOWN",
  "RANGE_BOUND",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "UNKNOWN",
  "ANY",
] as const;

export const PRICE_VS_SMA = ["ABOVE", "BELOW", "EQUAL"] as const;

export const RESEARCH_ASSETS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "SPY"] as const;

export const MAX_CONDITIONS = 8;
export const MAX_HOLDING_BARS = 96;

/** Rejects JavaScript, TypeScript, Python, SQL, and shell. Declarative thresholds stay allowed. */
export const EXECUTABLE_CODE =
  /(?:function\s*\(|=>|\beval\s*\(|\bimport\s|\brequire\s*\(|<script|javascript:|\bdef\s|\bexec\s*\(|\bSELECT\s+\S+\s+FROM\b|\bDROP\s+TABLE\b|\bINSERT\s+INTO\b|\$\()/i;

export function isDslFeature(value: string): value is DslFeature {
  return (DSL_FEATURES as readonly string[]).includes(value);
}

export function isDslOperator(value: string): value is DslOperator {
  return (DSL_OPERATORS as readonly string[]).includes(value);
}

export function isResearchSession(value: string): value is MarketSessionState | "ANY" {
  return (RESEARCH_SESSIONS as readonly string[]).includes(value);
}

export function isResearchRegime(value: string): value is MarketRegime | "ANY" {
  return (RESEARCH_REGIMES as readonly string[]).includes(value);
}
