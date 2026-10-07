import type { TradeIntent } from "@/domain/models";

export interface IntentShapeResult {
  ok: boolean;
  errors: string[];
}

export function validateIntentShape(intent: TradeIntent): IntentShapeResult {
  const errors: string[] = [];
  if (intent.assetSymbol.trim().length === 0) {
    errors.push("Asset is required.");
  }
  if (intent.quantity <= 0n) {
    errors.push("Quantity must be positive.");
  }
  if (intent.limitPrice <= 0n) {
    errors.push("Limit price must be positive.");
  }
  if (!Number.isInteger(intent.slippageBps) || intent.slippageBps < 0 || intent.slippageBps > 10_000) {
    errors.push("Slippage must be a whole number of basis points from 0 to 10,000.");
  }
  if (!Number.isFinite(intent.confidence) || intent.confidence < 0 || intent.confidence > 1) {
    errors.push("Confidence must be between 0 and 1.");
  }
  if (intent.venue !== "paper" && intent.venue !== "live") {
    errors.push("Venue must be paper or live.");
  }
  if (intent.side !== "buy" && intent.side !== "sell") {
    errors.push("Side must be buy or sell.");
  }
  if (Number.isNaN(Date.parse(intent.asOf))) {
    errors.push("Intent time is not a valid timestamp.");
  }
  return { ok: errors.length === 0, errors };
}
