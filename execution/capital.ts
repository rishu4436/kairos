import { parseDecimal, type Scaled } from "@/domain/money";
import type { OperatorConfig, ImplementedStrategyId } from "@/operator/config";

export type CapitalSizeOk = { ok: true; notional: Scaled; binding: string };
export type CapitalSizeBlocked = { ok: false; reason: string };

/** Deterministic cap. Strategies do not choose the final notional. */
export function capTradeNotional(input: {
  proposed: Scaled;
  config: OperatorConfig;
  strategyId: string;
  remainingDeployable: Scaled;
  remainingPosition: Scaled;
  remainingAllocation: Scaled;
  availableBalance: Scaled;
}): CapitalSizeOk | CapitalSizeBlocked {
  const maxPerTrade = parseDecimal(input.config.capital.maxPerTradeNotional);
  const strategyCapRaw = strategyCap(input.config, input.strategyId);
  const parts: { name: string; value: Scaled }[] = [
    { name: "proposed", value: input.proposed },
    { name: "max_per_trade", value: maxPerTrade },
    { name: "remaining_deployable", value: input.remainingDeployable },
    { name: "remaining_position", value: input.remainingPosition },
    { name: "remaining_allocation", value: input.remainingAllocation },
    { name: "available_balance", value: input.availableBalance },
  ];
  if (strategyCapRaw !== null) {
    parts.push({ name: "strategy_cap", value: strategyCapRaw });
  }
  let winner = parts[0]!;
  for (const part of parts) {
    if (part.value < winner.value) {
      winner = part;
    }
  }
  if (winner.value <= 0n) {
    return { ok: false, reason: "BELOW_MINIMUM" };
  }
  return { ok: true, notional: winner.value, binding: winner.name };
}

function strategyCap(config: OperatorConfig, strategyId: string): Scaled | null {
  const fromMap = config.capital.strategyMaxTradeNotional[strategyId as ImplementedStrategyId];
  if (fromMap && fromMap.trim() !== "") {
    return parseDecimal(fromMap);
  }
  if (strategyId === "momentum" && config.strategies.momentum.maxTradeNotional.trim() !== "") {
    return parseDecimal(config.strategies.momentum.maxTradeNotional);
  }
  if (strategyId === "mean-reversion" && config.strategies["mean-reversion"].maxTradeNotional.trim() !== "") {
    return parseDecimal(config.strategies["mean-reversion"].maxTradeNotional);
  }
  if (strategyId === "dca" && config.strategies.dca.maxTradeNotional.trim() !== "") {
    return parseDecimal(config.strategies.dca.maxTradeNotional);
  }
  if (strategyId === "dca") {
    return parseDecimal(config.strategies.dca.baseOrderNotional);
  }
  return null;
}
