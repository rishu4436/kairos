import { parseDecimal, type Scaled } from "@/domain/money";

/**
 * How the paper simulator behaves.
 * This is not a user risk policy. User risk says what is allowed.
 * This policy says how a simulated fill is priced.
 */
export const PAPER_POLICY_VERSION = "1.0";

export interface ImpactModel {
  version: "1.0";
  /** Always applied, in basis points. This is a cost, not an edge. */
  baseImpactBps: number;
  /** Cap on the volatility term. */
  volatilityPenaltyCapBps: number;
  /** Realized volatility, in bps, at which the penalty reaches the cap. */
  volatilityReferenceBps: number;
  /** Hard cap on the sum of impact terms. */
  maxImpactBps: number;
  /**
   * Added only when a verified liquidity input exists.
   * The default is 0. Candle volume is not treated as USD liquidity.
   */
  liquidityPenaltyBps: number;
}

export interface PaperExecutionPolicy {
  version: typeof PAPER_POLICY_VERSION;
  paperStartingCash: Scaled;
  /** Fee in basis points of execution notional. 10 = 0.10%. */
  baseFeeBps: number;
  impactModel: ImpactModel;
  minimumTradeNotional: Scaled;
  minimumActionIntervalMs: number;
  intentTtlMs: number;
  /** Extra paper-book cap on one position's notional. The user policy can be tighter. */
  maxPaperPosition: Scaled;
}

export const DEFAULT_PAPER_POLICY: PaperExecutionPolicy = {
  version: PAPER_POLICY_VERSION,
  paperStartingCash: parseDecimal("10000"),
  baseFeeBps: 10,
  impactModel: {
    version: "1.0",
    baseImpactBps: 8,
    volatilityPenaltyCapBps: 12,
    volatilityReferenceBps: 80,
    maxImpactBps: 40,
    liquidityPenaltyBps: 0,
  },
  minimumTradeNotional: parseDecimal("25"),
  minimumActionIntervalMs: 15 * 60 * 1000,
  intentTtlMs: 15 * 60 * 1000,
  maxPaperPosition: parseDecimal("1500"),
};
