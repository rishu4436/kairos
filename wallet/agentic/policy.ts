import type { AgenticWalletSecurityPolicy, WalletPolicyDecision } from "@/domain/agentic-wallet";

/**
 * KAIROS risk is the first gate. This is the second gate, read from the wallet.
 * KAIROS does not write these settings.
 */
export function assessWalletPolicy(input: {
  notionalUsd: number;
  policy: AgenticWalletSecurityPolicy | null;
}): WalletPolicyDecision {
  if (input.policy === null || input.policy.quotaLeft === null || input.policy.dailyLimit === null) {
    return { allowed: false, reason: "WALLET_UNAVAILABLE", remainingUsd: input.policy?.quotaLeft ?? null };
  }
  if (input.notionalUsd > input.policy.quotaLeft) {
    return { allowed: false, reason: "BLOCKED BY WALLET LIMIT", remainingUsd: input.policy.quotaLeft };
  }
  if (input.policy.tradeAllTokens !== true) {
    return { allowed: false, reason: "TOKEN_SCOPE_UNVERIFIED", remainingUsd: input.policy.quotaLeft };
  }
  if (input.policy.highRiskHandling === "NeedConfirmation") {
    return { allowed: true, reason: "REQUIRES APP CONFIRMATION", remainingUsd: input.policy.quotaLeft };
  }
  return { allowed: true, reason: "PASS", remainingUsd: input.policy.quotaLeft };
}
