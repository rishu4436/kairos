import { BSC_CHAIN_ID } from "@/domain/execution-prep";
import { DEMO_USER_ID } from "@/domain/watchlist";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface ScopedWallet {
  userId: string;
  chainId: typeof BSC_CHAIN_ID;
  address: string;
}

export type WalletScopeCode = "USER_WALLET_MISMATCH" | "WALLET_UNAVAILABLE" | "INVALID_REQUEST";

/** The configured address belongs only to the demo user. Another user never receives it. */
export function resolveScopedWallet(
  userId: string,
  env: { KAIROS_WALLET_ADDRESS?: string } | NodeJS.ProcessEnv = process.env,
): { ok: true; wallet: ScopedWallet } | { ok: false; code: WalletScopeCode } {
  if (userId !== DEMO_USER_ID) {
    return { ok: false, code: "USER_WALLET_MISMATCH" };
  }
  const address = env.KAIROS_WALLET_ADDRESS?.trim() ?? "";
  if (!EVM_ADDRESS.test(address)) {
    return { ok: false, code: "WALLET_UNAVAILABLE" };
  }
  return { ok: true, wallet: { userId, chainId: BSC_CHAIN_ID, address } };
}

export function assertWalletUse(input: {
  userId: string;
  accountUserId: string;
  address: string | null;
  chainId: string;
}): WalletScopeCode | null {
  if (input.accountUserId !== input.userId) {
    return "USER_WALLET_MISMATCH";
  }
  if (input.chainId !== BSC_CHAIN_ID) {
    return "INVALID_REQUEST";
  }
  if (input.address === null || !EVM_ADDRESS.test(input.address)) {
    return "WALLET_UNAVAILABLE";
  }
  return null;
}
