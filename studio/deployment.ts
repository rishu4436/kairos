import type { AutonomousExecutionMode } from "@/runtime/types";

/** Installed `bag --version` on 2026-10-07. The npm latest package is a different binary. */
export const INSTALLED_BAG_VERSION = "0.0.5";
export const PUBLISHED_STUDIO_CLI_VERSION = "0.0.14";
export const STUDIO_COMPATIBILITY = "UPDATE_REQUIRED" as const;
export const STUDIO_INSTALL_COMMAND = "npm install --global @bnbagent/studio-cli";

export type DeploymentStatus = "DEPLOYMENT_BLOCKED" | "NOT_DEPLOYED" | "DEPLOYED";

export function deploymentStatus(input: { cliCompatible: boolean; configValid: boolean; deployed: boolean }): DeploymentStatus {
  if (!input.cliCompatible || !input.configValid) {
    return "DEPLOYMENT_BLOCKED";
  }
  return input.deployed ? "DEPLOYED" : "NOT_DEPLOYED";
}

export function clampStudioExecutionMode(mode: AutonomousExecutionMode): "PAPER" | "LIVE_PREVIEW" {
  return mode === "PAPER" ? "PAPER" : "LIVE_PREVIEW";
}

export interface NormalizedAgentIdentity {
  registrationStatus: "REGISTERED" | "NOT_REGISTERED";
  agentId: string | null;
  network: string | null;
  walletAddress: string | null;
  registrationReference: string | null;
  tradingAuthorized: false;
}

/** Registration is real only when a deployment returned an agent id. It never grants trading. */
export function normalizeIdentity(input: {
  agentId?: string | null;
  network?: string | null;
  registrationStatus?: string | null;
  walletAddress?: string | null;
  registrationReference?: string | null;
} | null): NormalizedAgentIdentity {
  if (input?.registrationStatus === "REGISTERED" && input.agentId && input.agentId.trim().length > 0) {
    return {
      registrationStatus: "REGISTERED",
      agentId: input.agentId,
      network: input.network ?? null,
      walletAddress: input.walletAddress ?? null,
      registrationReference: input.registrationReference ?? null,
      tradingAuthorized: false,
    };
  }
  return {
    registrationStatus: "NOT_REGISTERED",
    agentId: null,
    network: null,
    walletAddress: null,
    registrationReference: null,
    tradingAuthorized: false,
  };
}

export function currentDeployment(): DeploymentStatus {
  return deploymentStatus({ cliCompatible: false, configValid: false, deployed: false });
}
