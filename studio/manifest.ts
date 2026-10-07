import { AGENT_CAPABILITIES, type AgentCapabilityManifest } from "@/studio/types";

export function kairosCapabilityManifest(): AgentCapabilityManifest {
  return {
    capabilities: AGENT_CAPABILITIES,
    denied: ["SIGN_ANY_TRANSACTION", "ACCESS_PRIVATE_KEYS", "OVERRIDE_RISK", "CHANGE_WALLET_POLICY"],
    walletSigning: "delegated",
    riskOverride: false,
    privateKeyAccess: false,
  };
}

export function overrideRisk(): { ok: false; reason: "RISK_OVERRIDE_DENIED" } {
  return { ok: false, reason: "RISK_OVERRIDE_DENIED" };
}

export function accessPrivateKey(): { ok: false; reason: "PRIVATE_KEY_ACCESS_DENIED" } {
  return { ok: false, reason: "PRIVATE_KEY_ACCESS_DENIED" };
}
