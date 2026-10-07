import { DOCUMENTED_X402_ASSETS, type AgentOperatingBudget, type AgentPaymentCapability } from "@/studio/types";

export function emptyOperatingBudget(): AgentOperatingBudget {
  return { purpose: "OPERATING", assets: DOCUMENTED_X402_ASSETS, balance: null, autoTopup: false };
}

export function x402Capability(): AgentPaymentCapability {
  return {
    rail: "x402",
    enabled: false,
    canSpend: false,
    reason: "x402 is a documented operating-wallet rail. This phase does not send a payment.",
  };
}

/** Refuses every payment. No payment command is invoked. */
export function requestX402Payment(): { ok: false; paid: false; reason: "X402_PAYMENT_NOT_AUTHORIZED" } {
  return { ok: false, paid: false, reason: "X402_PAYMENT_NOT_AUTHORIZED" };
}
