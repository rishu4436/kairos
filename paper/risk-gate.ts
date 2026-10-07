import type { PaperAccountState, RiskPolicy } from "@/domain/models";
import { validateRiskPolicy, type RiskEffect, type RiskViolation, type RiskViolationCode } from "@/risk/validate";
import type { AgentTradeIntent } from "@/paper/intent";
import { toRiskIntent } from "@/paper/intent";

/** Mapping version. The inequalities remain in `validateRiskPolicy`. */
export const RISK_GATE_VERSION = "1.0";

export const PAPER_RISK_REASON_CODES = [
  "ASSET_NOT_ALLOWED",
  "POSITION_TOO_LARGE",
  "ALLOCATION_EXCEEDED",
  "SLIPPAGE_TOO_HIGH",
  "EXPOSURE_LIMIT",
  "TRADING_DISABLED",
  "EXPIRED_INTENT",
  "USER_MISMATCH",
  "AGENT_MISMATCH",
  "INVALID_QUANTITY",
  "ACCOUNT_MISMATCH",
  "INVALID_INTENT",
  "INVALID_POLICY",
  "EXPOSURE_INCREASE",
] as const;

export type PaperRiskReasonCode = (typeof PAPER_RISK_REASON_CODES)[number];

export interface StructuredRiskViolation {
  code: PaperRiskReasonCode;
  message: string;
}

export interface StructuredRiskDecision {
  allowed: boolean;
  reasonCodes: PaperRiskReasonCode[];
  violations: StructuredRiskViolation[];
  checkedAt: string;
  policyVersion: typeof RISK_GATE_VERSION;
  policyId: string;
  intentId: string;
}

const CODE_MAP: Record<RiskViolationCode, PaperRiskReasonCode> = {
  invalid_intent: "INVALID_INTENT",
  invalid_policy: "INVALID_POLICY",
  user_mismatch: "USER_MISMATCH",
  agent_mismatch: "AGENT_MISMATCH",
  account_mismatch: "ACCOUNT_MISMATCH",
  live_trading_disabled: "TRADING_DISABLED",
  paper_trading_disabled: "TRADING_DISABLED",
  asset_not_allowed: "ASSET_NOT_ALLOWED",
  position_limit: "POSITION_TOO_LARGE",
  allocation_limit: "ALLOCATION_EXCEEDED",
  slippage_limit: "SLIPPAGE_TOO_HIGH",
  daily_loss_limit: "EXPOSURE_LIMIT",
  exposure_increase: "EXPOSURE_INCREASE",
};

/**
 * Calls the existing risk engine, then adds expiry.
 * This function does not execute and does not rewrite the limit math.
 */
export function assessTradeIntent(
  intent: AgentTradeIntent,
  policy: RiskPolicy,
  state: PaperAccountState,
  nowMs: number,
  riskEffect?: RiskEffect,
): StructuredRiskDecision {
  const checkedAt = new Date(nowMs).toISOString();
  const engine = validateRiskPolicy(toRiskIntent(intent), policy, state, riskEffect);
  const violations: StructuredRiskViolation[] = engine.ok ? [] : engine.violations.map(mapViolation);
  if (!Number.isFinite(Date.parse(intent.expiresAt)) || nowMs >= Date.parse(intent.expiresAt)) {
    violations.push({
      code: "EXPIRED_INTENT",
      message: "The trade intent is expired.",
    });
  }
  if (intent.requestedQuantity <= 0n && !violations.some((item) => item.code === "INVALID_QUANTITY")) {
    violations.push({ code: "INVALID_QUANTITY", message: "Quantity must be positive." });
  }
  const reasonCodes = [...new Set(violations.map((item) => item.code))];
  return {
    allowed: reasonCodes.length === 0,
    reasonCodes,
    violations,
    checkedAt,
    policyVersion: RISK_GATE_VERSION,
    policyId: policy.id,
    intentId: intent.intentId,
  };
}

function mapViolation(violation: RiskViolation): StructuredRiskViolation {
  if (violation.code === "invalid_intent" && /quantity/i.test(violation.message)) {
    return { code: "INVALID_QUANTITY", message: violation.message };
  }
  if (violation.code === "invalid_intent" && /slippage/i.test(violation.message)) {
    return { code: "SLIPPAGE_TOO_HIGH", message: violation.message };
  }
  return { code: CODE_MAP[violation.code], message: violation.message };
}
