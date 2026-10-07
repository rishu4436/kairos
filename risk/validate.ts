import { validateIntentShape } from "@/domain/intent";
import type { PaperAccountState, RiskPolicy, TradeIntent } from "@/domain/models";
import { mul } from "@/domain/money";
import { realizedLossToday, summarizePortfolio } from "@/domain/portfolio";

export type RiskViolationCode =
  | "invalid_intent"
  | "invalid_policy"
  | "user_mismatch"
  | "agent_mismatch"
  | "account_mismatch"
  | "live_trading_disabled"
  | "paper_trading_disabled"
  | "asset_not_allowed"
  | "position_limit"
  | "allocation_limit"
  | "slippage_limit"
  | "daily_loss_limit"
  | "exposure_increase";

export interface RiskViolation {
  code: RiskViolationCode;
  message: string;
}

export type RiskDecision = { ok: true } | { ok: false; violations: RiskViolation[] };

/**
 * INCREASE_RISK applies position, allocation, and daily-loss checks.
 * REDUCE_RISK and CLOSE_RISK do not. A reduction must not be rejected by an entry cap.
 * A buy labeled REDUCE_RISK or CLOSE_RISK is rejected.
 * Omitted means buy increases risk and sell reduces it.
 */
export type RiskEffect = "INCREASE_RISK" | "REDUCE_RISK" | "CLOSE_RISK";

/**
 * Deterministic user-limit check. Callers, including a future model proposer,
 * cannot bypass this function. Confidence is ignored on purpose.
 */
export function validateRiskPolicy(
  intent: TradeIntent,
  policy: RiskPolicy,
  state: PaperAccountState,
  effect?: RiskEffect,
): RiskDecision {
  const shape = validateIntentShape(intent);
  if (!shape.ok) {
    return {
      ok: false,
      violations: shape.errors.map((message) => ({ code: "invalid_intent", message })),
    };
  }

  const violations: RiskViolation[] = [];
  violations.push(...policyShapeViolations(policy));

  if (intent.userId !== policy.userId || intent.userId !== state.userId) {
    violations.push({
      code: "user_mismatch",
      message: "Intent, policy, and account must belong to the same user.",
    });
  }
  if (intent.agentId !== policy.agentId || intent.agentId !== state.agentId) {
    violations.push({
      code: "agent_mismatch",
      message: "Intent, policy, and account must belong to the same agent.",
    });
  }
  if (intent.accountId !== state.accountId) {
    violations.push({
      code: "account_mismatch",
      message: "Intent account does not match the portfolio account.",
    });
  }
  if (intent.venue === "live" && !policy.liveTradingEnabled) {
    violations.push({
      code: "live_trading_disabled",
      message: "Live trading is disabled by the user risk policy.",
    });
  }
  if (intent.venue === "paper" && !policy.paperTradingEnabled) {
    violations.push({
      code: "paper_trading_disabled",
      message: "Paper trading is disabled by the user risk policy.",
    });
  }
  if (!policy.allowedAssets.includes(intent.assetSymbol)) {
    violations.push({
      code: "asset_not_allowed",
      message: `${intent.assetSymbol} is not in the user allowlist.`,
    });
  }
  if (intent.slippageBps > policy.maxSlippageBps) {
    violations.push({
      code: "slippage_limit",
      message: "Intent slippage exceeds the user maximum.",
    });
  }

  const reducing = effect === "REDUCE_RISK" || effect === "CLOSE_RISK";
  if (reducing && intent.side === "buy") {
    violations.push({
      code: "exposure_increase",
      message: "A risk-reducing intent cannot buy.",
    });
  }
  const increases = effect ? effect === "INCREASE_RISK" : intent.side === "buy";
  if (increases) {
    violations.push(...buyLimitViolations(intent, policy, state));
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function policyShapeViolations(policy: RiskPolicy): RiskViolation[] {
  const violations: RiskViolation[] = [];
  if (
    !Number.isInteger(policy.maxAllocationBps) ||
    policy.maxAllocationBps < 0 ||
    policy.maxAllocationBps > 10_000
  ) {
    violations.push({
      code: "invalid_policy",
      message: "Allocation limit is not a valid basis-point value.",
    });
  }
  if (
    !Number.isInteger(policy.maxSlippageBps) ||
    policy.maxSlippageBps < 0 ||
    policy.maxSlippageBps > 10_000
  ) {
    violations.push({
      code: "invalid_policy",
      message: "Slippage limit is not a valid basis-point value.",
    });
  }
  if (policy.maxPositionNotional < 0n || policy.maxDailyLoss < 0n) {
    violations.push({
      code: "invalid_policy",
      message: "Loss and position limits cannot be negative.",
    });
  }
  return violations;
}

function buyLimitViolations(
  intent: TradeIntent,
  policy: RiskPolicy,
  state: PaperAccountState,
): RiskViolation[] {
  const violations: RiskViolation[] = [];
  const notional = mul(intent.limitPrice, intent.quantity);
  const summary = summarizePortfolio(state);
  const existing = state.positions.find((position) => position.assetSymbol === intent.assetSymbol);
  const existingNotional = existing ? mul(existing.currentPrice, existing.quantity) : 0n;

  if (existingNotional + notional > policy.maxPositionNotional) {
    violations.push({
      code: "position_limit",
      message: "Order would exceed the user maximum position.",
    });
  }

  if (summary.equity <= 0n) {
    violations.push({
      code: "allocation_limit",
      message: "Equity is not positive, so a new allocation is blocked.",
    });
  } else if (
    Number.isInteger(policy.maxAllocationBps) &&
    notional * 10_000n + summary.invested * 10_000n > summary.equity * BigInt(policy.maxAllocationBps)
  ) {
    violations.push({
      code: "allocation_limit",
      message: "Order would exceed the user maximum allocation.",
    });
  }

  const lossToday = realizedLossToday(state.trades, intent.asOf.slice(0, 10));
  if (lossToday >= policy.maxDailyLoss) {
    violations.push({
      code: "daily_loss_limit",
      message: "Daily loss limit is already reached. New risk is blocked.",
    });
  }

  return violations;
}
