import type { RiskPolicy } from "@/domain/models";
import { divRound, mul, SCALE, type Scaled } from "@/domain/money";
import type { PaperExecutionPolicy } from "@/paper/policy";

/**
 * Sizing policy 1.0.
 *
 * A buy deploys at most MAX_ALLOCATION_PERCENT of available paper cash.
 * The budget is then the tighter of that amount, remaining user allocation,
 * remaining user position room, the paper max position, and cash.
 * Quantity is floored so the worst acceptable price plus the paper fee
 * still fits in the budget. A buy cannot consume the whole book.
 *
 * A sell with no reduce size closes the open quantity and never sells more than is held.
 * A reduce size between 1 and 9999 basis points sells that share and cannot close the position.
 * Strategies do not choose the notional.
 */
export const SIZING_POLICY_VERSION = "1.0";
export const MAX_ALLOCATION_PERCENT = 10;

export type SizeResult =
  | { ok: true; quantity: Scaled; notional: Scaled; binding: string }
  | { ok: false; reason: "NO_POSITION" | "ALLOCATION_EXCEEDED" | "BELOW_MINIMUM" | "INVALID_PRICE" | "INVALID_QUANTITY" };

export function sizePaperOrder(input: {
  action: "BUY" | "SELL";
  observedPrice: Scaled;
  cash: Scaled;
  equity: Scaled;
  invested: Scaled;
  heldQuantity: Scaled;
  existingMarketValue: Scaled;
  riskPolicy: RiskPolicy;
  paperPolicy: PaperExecutionPolicy;
  /** Partial sell. Omitted or 10000 closes the open quantity. */
  reduceBps?: number | null;
  /** Extra cap on one buy. The allocation rules still apply. */
  maxIncrementalNotional?: Scaled | null;
}): SizeResult {
  if (input.observedPrice <= 0n) {
    return { ok: false, reason: "INVALID_PRICE" };
  }
  if (input.action === "SELL") {
    if (input.heldQuantity <= 0n) {
      return { ok: false, reason: "NO_POSITION" };
    }
    const reduceBps = input.reduceBps;
    if (reduceBps == null || reduceBps <= 0 || reduceBps >= 10_000) {
      return {
        ok: true,
        quantity: input.heldQuantity,
        notional: mul(input.observedPrice, input.heldQuantity),
        binding: "open_quantity",
      };
    }
    const quantity = (input.heldQuantity * BigInt(Math.trunc(reduceBps))) / 10_000n;
    if (quantity <= 0n || quantity >= input.heldQuantity) {
      return { ok: false, reason: "INVALID_QUANTITY" };
    }
    const notional = mul(input.observedPrice, quantity);
    if (notional < input.paperPolicy.minimumTradeNotional) {
      return { ok: false, reason: "BELOW_MINIMUM" };
    }
    return { ok: true, quantity, notional, binding: "reduce_policy" };
  }

  const percentBudget = (input.cash * BigInt(MAX_ALLOCATION_PERCENT)) / 100n;
  const allocationRoom = allocationRemaining(input.equity, input.invested, input.riskPolicy.maxAllocationBps);
  const positionRoom = input.riskPolicy.maxPositionNotional - input.existingMarketValue;
  const incremental = input.maxIncrementalNotional != null && input.maxIncrementalNotional > 0n ? input.maxIncrementalNotional : null;
  const budget = minPositive(
    percentBudget,
    allocationRoom,
    positionRoom,
    input.paperPolicy.maxPaperPosition,
    input.cash,
    ...(incremental === null ? [] : [incremental]),
  );
  if (budget < input.paperPolicy.minimumTradeNotional) {
    return { ok: false, reason: budget <= 0n ? "ALLOCATION_EXCEEDED" : "BELOW_MINIMUM" };
  }

  const worst = worsen(input.observedPrice, input.riskPolicy.maxSlippageBps, "BUY");
  const allIn = worsen(worst, input.paperPolicy.baseFeeBps, "BUY");
  let quantity = (budget * SCALE) / allIn;
  quantity = fitQuantity(worst, budget, quantity);
  if (quantity <= 0n) {
    return { ok: false, reason: "INVALID_QUANTITY" };
  }
  const notional = mul(input.observedPrice, quantity);
  if (notional < input.paperPolicy.minimumTradeNotional) {
    return { ok: false, reason: "BELOW_MINIMUM" };
  }
  const binding = percentBudget <= budget ? "max_allocation_percent" : "tighter_limit";
  return { ok: true, quantity, notional, binding };
}

function allocationRemaining(equity: Scaled, invested: Scaled, maxAllocationBps: number): Scaled {
  if (!Number.isInteger(maxAllocationBps) || maxAllocationBps <= 0 || equity <= 0n) {
    return 0n;
  }
  const cap = (equity * BigInt(maxAllocationBps)) / 10_000n;
  return cap > invested ? cap - invested : 0n;
}

function worsen(price: Scaled, bps: number, side: "BUY" | "SELL"): Scaled {
  const points = BigInt(Math.max(0, bps));
  if (side === "BUY") {
    return divRound(price * (10_000n + points), 10_000n);
  }
  return divRound(price * (10_000n - points), 10_000n);
}

function fitQuantity(worst: Scaled, budget: Scaled, quantity: Scaled): Scaled {
  let next = quantity;
  while (next > 0n && mul(worst, next) > budget) {
    const over = mul(worst, next) - budget;
    const step = (over * SCALE) / worst;
    next -= step > 0n ? step : 1n;
  }
  return next > 0n ? next : 0n;
}

function minPositive(...values: Scaled[]): Scaled {
  let best = values[0] ?? 0n;
  for (const value of values) {
    if (value < best) {
      best = value;
    }
  }
  return best > 0n ? best : 0n;
}
