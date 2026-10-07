import { admitPaperCapability, type PaperExecutionCapability } from "@/domain/execution-authority";
import { divRound, mul, type Scaled } from "@/domain/money";
import type { AgentTradeIntent } from "@/paper/intent";
import type { PaperExecutionPolicy } from "@/paper/policy";

/**
 * Deterministic execution cost. Same inputs always produce the same preview.
 *
 * liquidityPenaltyBps comes from the paper policy. The default is 0 because
 * candle volume is not a verified USD liquidity score.
 * volatilityPenaltyBps = min(cap, floor(realizedVolBps * cap / reference))
 * impactBps = min(maxImpactBps, baseImpactBps + volatilityPenaltyBps + liquidityPenaltyBps)
 * BUY executionPrice = round(observedPrice * (10000 + impactBps) / 10000)
 * SELL executionPrice = round(observedPrice * (10000 - impactBps) / 10000)
 * fee = round(executionNotional * baseFeeBps / 10000)
 *
 * The impact makes the fill worse than the observation. It is not alpha.
 */
export const EXECUTION_IMPACT_FORMULA =
  "impactBps = min(maxImpactBps, baseImpactBps + volatilityPenaltyBps + liquidityPenaltyBps); BUY price = observed * (10000 + impactBps) / 10000; SELL price = observed * (10000 - impactBps) / 10000; fee = notional * baseFeeBps / 10000";

export interface PaperMarketSnapshot {
  assetId: string;
  ticker: string;
  userId: string;
  observedPrice: Scaled;
  referencePrice: Scaled | null;
  priceTimestamp: string;
  /** Realized volatility in basis points. Null when the candle sample cannot support it. */
  volatilityBps: number | null;
  supported: boolean;
}

export interface PaperSimulation {
  intentId: string;
  status: "PASS" | "FAIL";
  requestedQuantity: Scaled;
  estimatedPrice: Scaled;
  estimatedNotional: Scaled;
  expectedSlippageBps: number;
  estimatedFee: Scaled;
  /** Buy: notional plus fee. Sell: proceeds after fee. */
  estimatedTotalCost: Scaled;
  impactBps: number;
  reasons: string[];
  formula: string;
}

export function previewPaperExecution(input: {
  intent: AgentTradeIntent;
  snapshot: PaperMarketSnapshot;
  policy: PaperExecutionPolicy;
  nowMs: number;
  cash: Scaled;
  heldQuantity: Scaled;
  authority: PaperExecutionCapability;
}): PaperSimulation {
  const admitted = admitPaperCapability(input.authority, {
    userId: input.intent.userId,
    agentId: input.intent.agentId,
    nowMs: input.nowMs,
  });
  if (!admitted.ok) {
    return {
      intentId: input.intent.intentId,
      status: "FAIL",
      requestedQuantity: input.intent.requestedQuantity,
      estimatedPrice: input.snapshot.observedPrice,
      estimatedNotional: 0n,
      expectedSlippageBps: 0,
      estimatedFee: 0n,
      estimatedTotalCost: 0n,
      impactBps: 0,
      reasons: [admitted.code],
      formula: EXECUTION_IMPACT_FORMULA,
    };
  }
  const impactBps = executionImpactBps(input.snapshot.volatilityBps, input.policy);
  const estimatedPrice = executionPrice(input.snapshot.observedPrice, impactBps, input.intent.action);
  const estimatedNotional = estimatedPrice > 0n ? mul(estimatedPrice, input.intent.requestedQuantity) : 0n;
  const estimatedFee = feeOn(estimatedNotional, input.policy.baseFeeBps);
  const buyCost = estimatedNotional + estimatedFee;
  const sellProceeds = estimatedNotional - estimatedFee;
  const estimatedTotalCost = input.intent.action === "BUY" ? buyCost : sellProceeds;
  const reasons: string[] = [];

  if (input.intent.action !== "BUY" && input.intent.action !== "SELL") {
    reasons.push("Only BUY and SELL can be simulated.");
  }
  if (input.intent.userId !== input.snapshot.userId) {
    reasons.push("The observation belongs to a different user.");
  }
  if (input.intent.assetId !== input.snapshot.assetId || input.intent.ticker !== input.snapshot.ticker) {
    reasons.push("The observation does not match the intent asset.");
  }
  if (!input.snapshot.supported) {
    reasons.push("The asset is not supported for this paper simulation.");
  }
  if (input.intent.requestedQuantity <= 0n) {
    reasons.push("Quantity must be positive.");
  }
  if (input.snapshot.observedPrice <= 0n || estimatedPrice <= 0n) {
    reasons.push("Execution price must be positive.");
  }
  if (!Number.isFinite(Date.parse(input.intent.expiresAt)) || input.nowMs >= Date.parse(input.intent.expiresAt)) {
    reasons.push("The trade intent is expired.");
  }
  if (impactBps > input.intent.maxSlippageBps) {
    reasons.push("Simulated slippage exceeds the intent maximum.");
  }
  if (input.intent.action === "BUY" && buyCost > input.cash) {
    reasons.push("Estimated cost exceeds paper cash.");
  }
  if (input.intent.action === "SELL" && input.intent.requestedQuantity > input.heldQuantity) {
    reasons.push("Sell quantity exceeds the open paper position.");
  }
  if (input.intent.action === "SELL" && sellProceeds < 0n) {
    reasons.push("Fee exceeds paper sale proceeds.");
  }
  if (estimatedNotional < input.policy.minimumTradeNotional && input.intent.action === "BUY") {
    reasons.push("Estimated notional is below the paper minimum.");
  }

  return {
    intentId: input.intent.intentId,
    status: reasons.length === 0 ? "PASS" : "FAIL",
    requestedQuantity: input.intent.requestedQuantity,
    estimatedPrice,
    estimatedNotional,
    expectedSlippageBps: impactBps,
    estimatedFee,
    estimatedTotalCost,
    impactBps,
    reasons,
    formula: EXECUTION_IMPACT_FORMULA,
  };
}

export function executionImpactBps(volatilityBps: number | null, policy: PaperExecutionPolicy): number {
  const model = policy.impactModel;
  const vol = volatilityBps !== null && Number.isFinite(volatilityBps) && volatilityBps > 0 ? Math.floor(volatilityBps) : 0;
  const reference = model.volatilityReferenceBps > 0 ? model.volatilityReferenceBps : 1;
  const volatilityPenalty = Math.min(model.volatilityPenaltyCapBps, Math.floor((vol * model.volatilityPenaltyCapBps) / reference));
  const liquidityPenalty = model.liquidityPenaltyBps > 0 ? model.liquidityPenaltyBps : 0;
  const raw = model.baseImpactBps + volatilityPenalty + liquidityPenalty;
  return Math.min(model.maxImpactBps, Math.max(0, raw));
}

export function executionPrice(observed: Scaled, impactBps: number, action: "BUY" | "SELL"): Scaled {
  const points = BigInt(Math.max(0, Math.trunc(impactBps)));
  if (action === "BUY") {
    return divRound(observed * (10_000n + points), 10_000n);
  }
  return divRound(observed * (10_000n - points), 10_000n);
}

export function feeOn(notional: Scaled, feeBps: number): Scaled {
  if (feeBps <= 0 || notional <= 0n) {
    return 0n;
  }
  return divRound(notional * BigInt(Math.trunc(feeBps)), 10_000n);
}
