import type { ExecutionPlan, RiskPolicy, WalletAccount, WalletAuthorization } from "@/domain/models";

/**
 * Authorizes a paper ledger entry only. Never signs, and never approves an
 * external agentic wallet. A grant is not a chain signature.
 */
export function authorizePlan(
  account: WalletAccount,
  plan: ExecutionPlan,
  policy: RiskPolicy,
): WalletAuthorization {
  const reasons: string[] = [];
  if (account.userId !== plan.userId || account.userId !== policy.userId) {
    reasons.push("Account, plan, and policy are not the same user.");
  }
  if (account.agentId !== plan.agentId || account.agentId !== policy.agentId) {
    reasons.push("Account, plan, and policy are not the same agent.");
  }
  if (account.id !== plan.accountId) {
    reasons.push("Plan account does not match the wallet account.");
  }
  if (plan.venue === "live" || account.kind === "external_agentic_wallet") {
    reasons.push("Agentic wallet signing is not connected. No signature was produced.");
  }
  if (plan.venue === "paper" && account.kind !== "paper") {
    reasons.push("Paper plans require a paper account.");
  }
  if (!policy.paperTradingEnabled && plan.venue === "paper") {
    reasons.push("User policy has paper trading disabled.");
  }
  if (!policy.liveTradingEnabled && plan.venue === "live") {
    reasons.push("User policy has live trading disabled.");
  }

  return {
    accountId: account.id,
    planId: plan.id,
    granted: reasons.length === 0,
    reasons,
    signature: null,
  };
}
