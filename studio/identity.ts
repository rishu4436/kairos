import type { KairosAgentIdentity } from "@/studio/types";

export interface AgentIdentityProvider {
  readonly source: "LOCAL" | "AGENT_STUDIO";
  readIdentity(): KairosAgentIdentity;
}

/** No ERC-8004 record was read. Studio owns registration. This adapter does not register. */
export function unregisteredIdentity(): KairosAgentIdentity {
  return {
    agentId: null,
    identityStandard: null,
    network: null,
    registrationStatus: "NOT_REGISTERED",
    walletAddress: null,
    runtimeId: null,
    deploymentId: null,
  };
}

export class LocalIdentityProvider implements AgentIdentityProvider {
  readonly source = "LOCAL" as const;

  readIdentity(): KairosAgentIdentity {
    return unregisteredIdentity();
  }
}

/**
 * Reads a normalized record. This adapter does not register an identity
 * and does not implement ERC-8004 itself.
 */
export class AgentStudioIdentityProvider implements AgentIdentityProvider {
  readonly source = "AGENT_STUDIO" as const;

  constructor(private readonly record: KairosAgentIdentity = unregisteredIdentity()) {}

  readIdentity(): KairosAgentIdentity {
    return { ...this.record };
  }
}
