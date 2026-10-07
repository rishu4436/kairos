/** Canonical KAIROS production trading network. Runtime hosts do not redefine this. */
export const PRODUCTION_CHAIN_ID = "56" as const;
export const PRODUCTION_CHAIN_NAME = "BNB Smart Chain" as const;
export const PRODUCTION_NETWORK_LABEL = "BSC_MAINNET" as const;

export type ProductionChainId = typeof PRODUCTION_CHAIN_ID;

export interface TradingNetwork {
  chainId: ProductionChainId;
  name: typeof PRODUCTION_CHAIN_NAME;
  label: typeof PRODUCTION_NETWORK_LABEL;
}

export const KAIROS_TRADING_NETWORK: TradingNetwork = {
  chainId: PRODUCTION_CHAIN_ID,
  name: PRODUCTION_CHAIN_NAME,
  label: PRODUCTION_NETWORK_LABEL,
};

export type NetworkGateCode = "WRONG_CHAIN" | "CHAIN_REQUIRED";

export function assertProductionChain(chainId: string | null | undefined): NetworkGateCode | null {
  if (chainId === null || chainId === undefined || chainId.trim().length === 0) {
    return "CHAIN_REQUIRED";
  }
  if (chainId.trim() !== PRODUCTION_CHAIN_ID) {
    return "WRONG_CHAIN";
  }
  return null;
}

export function representationIdentity(chainId: string, contractAddress: string): string {
  return `${chainId}:${contractAddress.trim().toLowerCase()}`;
}

export function isEvmAddress(value: string | null | undefined): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
