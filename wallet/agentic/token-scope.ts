import { PRODUCTION_CHAIN_ID, isEvmAddress } from "@/domain/network";

export type TokenScopeAdmission = "OPERATOR_ATTESTED" | "TOKEN_SCOPE_UNVERIFIED" | "TOKEN_NOT_ALLOWED";

export interface OperatorTokenScope {
  chainId: typeof PRODUCTION_CHAIN_ID;
  contracts: readonly string[];
  provenance: "OPERATOR_ATTESTED";
}

const PAIR = /^56:(0x[0-9a-fA-F]{40})$/;

/**
 * Server-only operator-attested allow list.
 * This is not a Binance CLI proof of the wallet allow list.
 */
export function readOperatorTokenScope(
  env: { KAIROS_AGENTIC_ALLOWED_TOKENS?: string } | NodeJS.ProcessEnv = process.env,
): OperatorTokenScope | null {
  const raw = env.KAIROS_AGENTIC_ALLOWED_TOKENS?.trim() ?? "";
  if (raw.length === 0) {
    return null;
  }
  const contracts: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (token.length === 0) {
      continue;
    }
    const match = PAIR.exec(token);
    if (!match) {
      return null;
    }
    const contract = match[1].toLowerCase();
    if (seen.has(contract)) {
      continue;
    }
    seen.add(contract);
    contracts.push(contract);
  }
  if (contracts.length === 0) {
    return null;
  }
  return { chainId: PRODUCTION_CHAIN_ID, contracts, provenance: "OPERATOR_ATTESTED" };
}

export function admitOperatorTokenPair(input: {
  chainId: string;
  tokens: readonly string[];
  scope: OperatorTokenScope | null;
}): TokenScopeAdmission {
  if (input.scope === null || input.scope.contracts.length === 0) {
    return "TOKEN_SCOPE_UNVERIFIED";
  }
  if (input.chainId !== PRODUCTION_CHAIN_ID || input.scope.chainId !== PRODUCTION_CHAIN_ID) {
    return "TOKEN_SCOPE_UNVERIFIED";
  }
  if (input.tokens.length === 0) {
    return "TOKEN_SCOPE_UNVERIFIED";
  }
  for (const token of input.tokens) {
    if (!isEvmAddress(token)) {
      return "TOKEN_SCOPE_UNVERIFIED";
    }
    if (!input.scope.contracts.includes(token.trim().toLowerCase())) {
      return "TOKEN_NOT_ALLOWED";
    }
  }
  return "OPERATOR_ATTESTED";
}
