import type { AgenticWalletSecurityPolicy, WalletConnectionStatus } from "@/domain/agentic-wallet";

export interface ToolingMetadata {
  nodeVersion: string;
  cliVersion: string;
  requiredCliVersion: string;
  installedSkillVersion: string;
  latestSkillVersion: string | null;
  cliCompatible: boolean;
}

export interface PreflightInput {
  userId: string;
  expectedUserId: string;
  agentId: string;
  expectedAgentId: string;
  connectionStatus: WalletConnectionStatus;
  bscSupported: boolean;
  walletAddress: string | null;
  policy: AgenticWalletSecurityPolicy | null;
  tokenAllowed: boolean;
  tokenTradable: boolean | null;
  tooling: ToolingMetadata;
}

export interface PreflightResult {
  result: "PASS" | "BLOCKED";
  reasons: string[];
  tooling: ToolingMetadata;
}

export function runAgenticWalletPreflight(input: PreflightInput): PreflightResult {
  const reasons: string[] = [];
  if (!input.tooling.cliCompatible) {
    reasons.push("TOOLING_INCOMPATIBLE");
  }
  if (input.userId !== input.expectedUserId) {
    reasons.push("USER_MISMATCH");
  }
  if (input.agentId !== input.expectedAgentId) {
    reasons.push("AGENT_MISMATCH");
  }
  if (input.connectionStatus !== "CONNECTED") {
    reasons.push("WALLET_UNAVAILABLE");
  }
  if (!input.bscSupported) {
    reasons.push("BSC_UNSUPPORTED");
  }
  if (input.walletAddress === null) {
    reasons.push("WALLET_ADDRESS_UNAVAILABLE");
  }
  if (input.policy === null || input.policy.quotaLeft === null) {
    reasons.push("WALLET_POLICY_UNAVAILABLE");
  }
  if (!input.tokenAllowed) {
    reasons.push("TOKEN_NOT_ALLOWED");
  }
  if (input.tokenTradable === null) {
    reasons.push("TOKEN_TRADABILITY_UNKNOWN");
  } else if (!input.tokenTradable) {
    reasons.push("TOKEN_NOT_TRADABLE");
  }
  return { result: reasons.length === 0 ? "PASS" : "BLOCKED", reasons, tooling: input.tooling };
}
