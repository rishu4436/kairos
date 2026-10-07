import type { ExecutionPlan, PaperAccountState, Quote, SimulationResult, TradeIntent } from "@/domain/models";
import { mul } from "@/domain/money";

export type PlanBuildResult = { ok: true; plan: ExecutionPlan } | { ok: false; reason: string };

export function buildExecutionPlan(intent: TradeIntent, quote: Quote): PlanBuildResult {
  if (quote.source !== "mock") {
    return { ok: false, reason: "Only mock quotes exist in this build." };
  }
  if (quote.assetSymbol !== intent.assetSymbol) {
    return { ok: false, reason: "Quote asset does not match the intent." };
  }
  if (quote.side !== intent.side) {
    return { ok: false, reason: "Quote side does not match the intent." };
  }
  return {
    ok: true,
    plan: {
      id: `plan_${intent.id}`,
      intentId: intent.id,
      userId: intent.userId,
      agentId: intent.agentId,
      accountId: intent.accountId,
      assetSymbol: intent.assetSymbol,
      side: intent.side,
      quantity: intent.quantity,
      limitPrice: intent.limitPrice,
      maxSlippageBps: intent.slippageBps,
      venue: intent.venue,
      quote,
    },
  };
}

/**
 * Paper-only sanity check. A live venue is rejected here and is not simulated
 * against a chain. `broadcast` is always false.
 */
export function simulatePlan(plan: ExecutionPlan, state: PaperAccountState): SimulationResult {
  const reasons: string[] = [];
  if (plan.venue === "live") {
    reasons.push(
      "BNB transaction simulation is not connected. Official documentation must be wired before a live plan can be simulated.",
    );
  }
  if (plan.userId !== state.userId || plan.accountId !== state.accountId) {
    reasons.push("Plan does not belong to this paper account.");
  }
  if (plan.quantity <= 0n || plan.limitPrice <= 0n) {
    reasons.push("Plan size is invalid.");
  }
  if (plan.venue === "paper" && plan.side === "sell") {
    const position = state.positions.find((item) => item.assetSymbol === plan.assetSymbol);
    if (!position || position.quantity < plan.quantity) {
      reasons.push("Paper position is smaller than the sell quantity.");
    }
  }
  if (plan.venue === "paper" && plan.side === "buy") {
    const notional = mul(plan.limitPrice, plan.quantity);
    if (notional > state.cash) {
      reasons.push("Paper cash is below the order notional.");
    }
  }

  const accepted = reasons.length === 0;
  return {
    planId: plan.id,
    accepted,
    reasons,
    estimatedAveragePrice: accepted ? plan.quote.price : null,
    estimatedFee: accepted ? 0n : null,
    priceImpactBps: accepted ? 0 : null,
    source: "mock_simulator",
    broadcast: false,
  };
}
