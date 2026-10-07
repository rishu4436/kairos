import type { OperatorConfig } from "@/operator/config";
import { MEAN_REVERSION_PARAMS, MOMENTUM_PARAMS, WEEKEND_PARAMS } from "@/strategies/parameters";

export const POSTURES = ["CONSERVATIVE", "MEDIUM", "HIGH"] as const;
export type RiskPosture = (typeof POSTURES)[number];

export interface PosturePreset {
  id: RiskPosture;
  title: string;
  summary: string;
  momentum: string;
  meanReversion: string;
  weekend: string;
  dca: string;
}

/**
 * Auto presets only change operator parameters.
 * They do not change strategy formulas, wallet scope, or live admission.
 * Medium matches the documented KAIROS defaults.
 */
export function posturePreset(id: RiskPosture, base: OperatorConfig): OperatorConfig {
  const strategies = { ...base.strategies };
  const capital = { ...base.capital };
  const risk = { ...base.risk };
  if (id === "CONSERVATIVE") {
    strategies.momentum = { ...strategies.momentum, enabled: true, minReturnBps: 80, maxVolatilityBps: 50, maxTradeNotional: "150" };
    strategies["mean-reversion"] = { ...strategies["mean-reversion"], enabled: true, entryBps: 180, maxTradeNotional: "150" };
    strategies.weekend = { ...strategies.weekend, enabled: true, minDeviationBps: 100 };
    strategies.dca = { ...strategies.dca, enabled: false, mode: "DIP_BASED", dipThresholdBps: 800, baseOrderNotional: "5", maxBudgetNotional: "25", maxTranches: 5 };
    capital.maxPerTradeNotional = "150";
    risk.maxAllocationBps = 1000;
    risk.maxDailyLoss = "200";
  } else if (id === "HIGH") {
    strategies.momentum = { ...strategies.momentum, enabled: true, minReturnBps: 30, maxVolatilityBps: 150, maxTradeNotional: "800" };
    strategies["mean-reversion"] = { ...strategies["mean-reversion"], enabled: true, entryBps: 80, maxTradeNotional: "800" };
    strategies.weekend = { ...strategies.weekend, enabled: true, minDeviationBps: 50 };
    strategies.dca = { ...strategies.dca, enabled: true, mode: "DIP_BASED", dipThresholdBps: 300, baseOrderNotional: "15", maxBudgetNotional: "150", maxTranches: 15 };
    capital.maxPerTradeNotional = "800";
    risk.maxAllocationBps = 4000;
    risk.maxDailyLoss = "800";
  } else {
    strategies.momentum = { ...strategies.momentum, enabled: true, minReturnBps: MOMENTUM_PARAMS.minReturnBps, maxVolatilityBps: MOMENTUM_PARAMS.maxVolatilityBps, momentumBars: MOMENTUM_PARAMS.momentumBars, trendPeriod: MOMENTUM_PARAMS.trendPeriod, minCandles: MOMENTUM_PARAMS.minCandles, maxTradeNotional: "" };
    strategies["mean-reversion"] = { ...strategies["mean-reversion"], enabled: true, entryBps: MEAN_REVERSION_PARAMS.entryBps, period: MEAN_REVERSION_PARAMS.period, minCandles: MEAN_REVERSION_PARAMS.minCandles, maxTradeNotional: "" };
    strategies.weekend = { ...strategies.weekend, enabled: true, minDeviationBps: WEEKEND_PARAMS.minDeviationBps };
    strategies.dca = { ...strategies.dca, enabled: false, mode: "DIP_BASED", dipThresholdBps: 500, baseOrderNotional: "5", maxBudgetNotional: "50", maxTranches: 10 };
    capital.maxPerTradeNotional = "500";
    risk.maxAllocationBps = 2500;
    risk.maxDailyLoss = "500";
  }
  return { ...base, strategies, capital, risk };
}

export const POSTURE_COPY: readonly PosturePreset[] = [
  {
    id: "CONSERVATIVE",
    title: "Conservative",
    summary: "Fewer trades, smaller size, DCA off.",
    momentum: "Act only after a 0.80% move, and only in calm markets.",
    meanReversion: "Buy or sell only when price is 1.80% away from the average.",
    weekend: "Note off-hours gaps from 1.00%. This strategy does not trade.",
    dca: "Off.",
  },
  {
    id: "MEDIUM",
    title: "Medium",
    summary: "KAIROS defaults. Balanced size.",
    momentum: "Act from a 0.50% move when volatility stays under 0.80%.",
    meanReversion: "Act when price is 1.20% away from the 20-bar average.",
    weekend: "Note off-hours gaps from 0.75%. This strategy does not trade.",
    dca: "Off. Manual can turn on a 5% dip.",
  },
  {
    id: "HIGH",
    title: "High",
    summary: "More signals, larger size, DCA on.",
    momentum: "Act from a 0.30% move and allow livelier markets.",
    meanReversion: "Act when price is 0.80% away from the average.",
    weekend: "Note off-hours gaps from 0.50%. This strategy does not trade.",
    dca: "On. Buy 15 USDT after each 3% dip, up to 150 USDT.",
  },
];

export function detectPosture(config: OperatorConfig): RiskPosture | "MANUAL" {
  for (const id of POSTURES) {
    const preset = posturePreset(id, config);
    if (samePosture(config, preset)) {
      return id;
    }
  }
  return "MANUAL";
}

function samePosture(left: OperatorConfig, right: OperatorConfig): boolean {
  return (
    left.strategies.momentum.minReturnBps === right.strategies.momentum.minReturnBps &&
    left.strategies.momentum.maxVolatilityBps === right.strategies.momentum.maxVolatilityBps &&
    left.strategies.momentum.maxTradeNotional === right.strategies.momentum.maxTradeNotional &&
    left.strategies["mean-reversion"].entryBps === right.strategies["mean-reversion"].entryBps &&
    left.strategies.weekend.minDeviationBps === right.strategies.weekend.minDeviationBps &&
    left.strategies.dca.enabled === right.strategies.dca.enabled &&
    left.strategies.dca.dipThresholdBps === right.strategies.dca.dipThresholdBps &&
    left.strategies.dca.baseOrderNotional === right.strategies.dca.baseOrderNotional &&
    left.capital.maxPerTradeNotional === right.capital.maxPerTradeNotional &&
    left.risk.maxAllocationBps === right.risk.maxAllocationBps
  );
}
