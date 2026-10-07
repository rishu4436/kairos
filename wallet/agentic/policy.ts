import type { AgenticWalletSecurityPolicy, WalletPolicyDecision } from "@/domain/agentic-wallet";
import { admitOperatorTokenPair, readOperatorTokenScope, type OperatorTokenScope } from "@/wallet/agentic/token-scope";

/**
 * KAIROS risk is the first gate. This is the second gate, read from the wallet plus operator-attested scope.
 * This is not a Binance CLI proof of the wallet allow list.
 */
export function assessWalletPolicy(input: {
  notionalUsd: number;
  policy: AgenticWalletSecurityPolicy | null;
  chainId: string;
  tokens: readonly string[];
  operatorScope?: OperatorTokenScope | null;
}): WalletPolicyDecision {
  if (input.policy === null || input.policy.quotaLeft === null || input.policy.dailyLimit === null) {
    return { allowed: false, reason: "WALLET_UNAVAILABLE", remainingUsd: input.policy?.quotaLeft ?? null };
  }
  if (input.notionalUsd > input.policy.quotaLeft) {
    return { allowed: false, reason: "BLOCKED BY WALLET LIMIT", remainingUsd: input.policy.quotaLeft };
  }
  if (input.policy.tradeAllTokens !== false) {
    return { allowed: false, reason: "TOKEN_SCOPE_UNVERIFIED", remainingUsd: input.policy.quotaLeft };
  }
  const scope = input.operatorScope === undefined ? readOperatorTokenScope() : input.operatorScope;
  const admission = admitOperatorTokenPair({ chainId: input.chainId, tokens: input.tokens, scope });
  if (admission === "TOKEN_SCOPE_UNVERIFIED") {
    return { allowed: false, reason: "TOKEN_SCOPE_UNVERIFIED", remainingUsd: input.policy.quotaLeft };
  }
  if (admission === "TOKEN_NOT_ALLOWED") {
    return { allowed: false, reason: "TOKEN_NOT_ALLOWED", remainingUsd: input.policy.quotaLeft };
  }
  if (input.policy.highRiskHandling === "NeedConfirmation") {
    return { allowed: true, reason: "REQUIRES APP CONFIRMATION", remainingUsd: input.policy.quotaLeft };
  }
  return { allowed: true, reason: "PASS", remainingUsd: input.policy.quotaLeft };
}
