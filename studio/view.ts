import { kairosCapabilityManifest } from "@/studio/manifest";
import { AGENT_STUDIO_OBSERVATION } from "@/studio/observed";
import { emptyOperatingBudget, x402Capability } from "@/studio/payments";
import { buildAgentStudioPrecheck, type AgentStudioProbe } from "@/studio/precheck";
import { emptyOperatingWallet, tradingWallet } from "@/studio/wallets";
import { unregisteredIdentity } from "@/studio/identity";
import { buildRuntimeHealth } from "@/studio/health";
import type { KairosCycleReport } from "@/studio/types";

export interface RuntimeDashboard {
  runtimeLabel: string;
  runtimeState: string;
  identity: string;
  runtimeMode: string;
  heartbeat: string;
  nextCycle: string;
  operatingWallet: string;
  operatingBalance: string;
  tradingWallet: string;
  overall: string;
  checks: readonly { label: string; detail: string; mark: string }[];
  steps: readonly { label: string; mark: string }[];
  capabilities: readonly string[];
  denied: readonly string[];
  precheck: string;
}

export function inspectedProbe(): AgentStudioProbe {
  return {
    cliInstalled: true,
    cliVersion: AGENT_STUDIO_OBSERVATION.cliVersion,
    cliPackageVersion: AGENT_STUDIO_OBSERVATION.cliPackageVersion,
    nodeVersion: AGENT_STUDIO_OBSERVATION.nodeVersion,
    pythonVersion: AGENT_STUDIO_OBSERVATION.pythonVersion,
    pythonSdkVersion: AGENT_STUDIO_OBSERVATION.pythonSdkVersion,
    typeScriptSdkInstalled: AGENT_STUDIO_OBSERVATION.typeScriptSdkInstalled,
    studioProjectPresent: AGENT_STUDIO_OBSERVATION.studioProjectPresent,
    configurationValid: false,
    identityRegistered: AGENT_STUDIO_OBSERVATION.identityRegistered,
    operatingWalletCreated: AGENT_STUDIO_OBSERVATION.operatingWalletCreated,
    deployed: AGENT_STUDIO_OBSERVATION.deployed,
    doctorMessage: AGENT_STUDIO_OBSERVATION.doctorMessage,
  };
}

export function buildRuntimeDashboard(input: {
  tradingConnected: boolean;
  market: "PAPER_SAMPLE" | "LIVE_OK" | "UNAVAILABLE";
  researchLabel: string;
  lastCycle?: KairosCycleReport | null;
}): RuntimeDashboard {
  const identity = unregisteredIdentity();
  const operating = emptyOperatingWallet();
  const trading = tradingWallet({
    userId: "user_demo",
    address: null,
    connectionStatus: input.tradingConnected ? "CONNECTED" : "NOT_CONFIGURED",
  });
  const health = buildRuntimeHealth({
    processUp: true,
    studioProjectPresent: false,
    market: input.market,
    researchLabel: input.researchLabel,
    strategiesReady: true,
    executionPrepared: true,
    tradingWalletConnected: input.tradingConnected,
  });
  const manifest = kairosCapabilityManifest();
  const budget = emptyOperatingBudget();
  const cycle = input.lastCycle ?? null;
  return {
    runtimeLabel: "LOCAL",
    runtimeState: "OFFLINE",
    identity: identity.registrationStatus === "REGISTERED" ? `ERC-8004 ${identity.agentId ?? ""}` : "ERC-8004: NOT REGISTERED",
    runtimeMode: "Local. Agent Studio project is not configured.",
    heartbeat: "NOT AVAILABLE",
    nextCycle: "NOT SCHEDULED",
    operatingWallet: operating.configured && operating.address ? operating.address : "NOT CONFIGURED",
    operatingBalance: budget.balance ?? "NOT AVAILABLE",
    tradingWallet: trading.connectionStatus === "CONNECTED" ? "CONNECTED" : "NOT CONFIGURED",
    overall: health.overall,
    checks: health.checks.map((check) => ({
      label: check.label,
      detail: check.id === "research" && input.researchLabel === "CONNECTED" ? input.researchLabel : check.detail,
      mark: check.status === "HEALTHY" ? "●" : "○",
    })),
    steps: (cycle?.steps ?? defaultSteps()).map((step) => ({
      label: step.name.replaceAll("_", " "),
      mark: step.status,
    })),
    capabilities: manifest.capabilities,
    denied: manifest.denied,
    precheck: buildAgentStudioPrecheck(inspectedProbe()).lines.map((line) => `${line.label}: ${line.value}`).join("\n"),
  };
}

function defaultSteps(): { name: string; status: string }[] {
  return ["OBSERVE", "ANALYZE", "STRATEGY EVALUATION", "ARBITRATION", "RESEARCH CONTEXT", "TRADE INTENT", "RISK", "EXECUTION"].map((name) => ({
    name,
    status: "NOT RUN",
  }));
}

export function paymentBoundaryLabel(): string {
  const payment = x402Capability();
  return payment.canSpend ? "PAYMENTS ENABLED" : "X402 NOT USED";
}
