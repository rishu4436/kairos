declare const userIdBrand: unique symbol;
declare const agentIdBrand: unique symbol;
declare const accountIdBrand: unique symbol;
declare const policyIdBrand: unique symbol;
declare const assetIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: true };
export type AgentId = string & { readonly [agentIdBrand]: true };
export type AccountId = string & { readonly [accountIdBrand]: true };
export type PolicyId = string & { readonly [policyIdBrand]: true };
export type AssetId = string & { readonly [assetIdBrand]: true };

function required(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

export function asUserId(value: string): UserId {
  return required(value, "User id") as UserId;
}

export function asAgentId(value: string): AgentId {
  return required(value, "Agent id") as AgentId;
}

export function asAccountId(value: string): AccountId {
  return required(value, "Account id") as AccountId;
}

export function asPolicyId(value: string): PolicyId {
  return required(value, "Policy id") as PolicyId;
}

export function asAssetId(value: string): AssetId {
  return required(value, "Asset id") as AssetId;
}
