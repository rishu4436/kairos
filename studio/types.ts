/** Runtime face. This is not the trading lifecycle in agent/states.ts. */
export const STUDIO_RUNTIME_STATES = [
  "LOCAL",
  "DEPLOYMENT_READY",
  "DEPLOYED",
  "RUNNING",
  "PAUSED",
  "ERROR",
  "OFFLINE",
] as const;
export type StudioRuntimeState = (typeof STUDIO_RUNTIME_STATES)[number];

export type IdentityRegistration = "REGISTERED" | "NOT_REGISTERED" | "UNKNOWN";

/**
 * Only fields the current Studio/SDK can expose.
 * Null means the local inspection did not receive that value.
 */
export interface KairosAgentIdentity {
  agentId: string | null;
  identityStandard: "ERC-8004" | null;
  network: string | null;
  registrationStatus: IdentityRegistration;
  walletAddress: string | null;
  runtimeId: string | null;
  deploymentId: string | null;
}

export interface AgentHeartbeat {
  agentId: string | null;
  kairosAgentId: string;
  runtimeId: string | null;
  lastCycleStarted: string | null;
  lastCycleCompleted: string | null;
  lastSuccessfulObservation: string | null;
  lastError: string | null;
  currentState: StudioRuntimeState;
  tradingState: string | null;
  nextCycle: string | null;
  uptimeMs: number | null;
}

export type WalletRole = "OPERATING" | "TRADING";

export interface OperatingWallet {
  role: "OPERATING";
  source: "agent-studio";
  address: string | null;
  configured: boolean;
}

export interface TradingWalletRef {
  role: "TRADING";
  source: "agentic-wallet";
  userId: string;
  address: string | null;
  connectionStatus: "UNCONNECTED" | "CREATING" | "CONNECTED" | "NOT_CONFIGURED";
}

/** Documented x402 assets. The installed CLI buy help names $U. The v4 product page also names USDT, USDC, and USD1. */
export const DOCUMENTED_X402_ASSETS = ["USDT", "USDC", "USD1", "U"] as const;
export type X402Asset = (typeof DOCUMENTED_X402_ASSETS)[number];

export interface AgentOperatingBudget {
  purpose: "OPERATING";
  assets: readonly X402Asset[];
  balance: null;
  autoTopup: false;
}

export interface AgentPaymentCapability {
  rail: "x402";
  enabled: false;
  canSpend: false;
  reason: string;
}

export const AGENT_CAPABILITIES = [
  "MARKET_READ",
  "STRATEGY_EVALUATE",
  "RESEARCH",
  "PAPER_EXECUTION",
  "LIVE_EXECUTION_REQUEST",
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export interface AgentCapabilityManifest {
  capabilities: readonly AgentCapability[];
  denied: readonly ["SIGN_ANY_TRANSACTION", "ACCESS_PRIVATE_KEYS", "OVERRIDE_RISK", "CHANGE_WALLET_POLICY"];
  walletSigning: "delegated";
  riskOverride: false;
  privateKeyAccess: false;
}

export const RUNTIME_EVENT_TYPES = [
  "AGENT_STARTED",
  "AGENT_STOPPED",
  "AGENT_HEARTBEAT",
  "AGENT_CYCLE_STARTED",
  "AGENT_CYCLE_COMPLETED",
  "AGENT_CYCLE_FAILED",
  "AGENT_RUNTIME_DEGRADED",
  "AGENT_RUNTIME_RECOVERED",
] as const;
export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export interface AgentRuntimeEvent {
  eventId: string;
  type: RuntimeEventType;
  agentId: string | null;
  kairosAgentId: string;
  runtimeId: string | null;
  cycleId: string | null;
  timestamp: string;
  state: StudioRuntimeState;
  detail: string | null;
}

export type CycleStepName =
  | "OBSERVE"
  | "ANALYZE"
  | "STRATEGY_EVALUATION"
  | "ARBITRATION"
  | "RESEARCH_CONTEXT"
  | "TRADE_INTENT"
  | "RISK"
  | "EXECUTION";

export type CycleStepStatus = "OK" | "DEGRADED" | "BLOCKED" | "SKIPPED" | "FAILED" | "NOT_RUN";

export interface CycleStep {
  name: CycleStepName;
  status: CycleStepStatus;
  detail: string | null;
}

export interface KairosCycleReport {
  cycleId: string;
  userId: string;
  kairosAgentId: string;
  startedAt: string;
  completedAt: string;
  runtimeState: StudioRuntimeState;
  tradingState: string | null;
  steps: readonly CycleStep[];
  correlationIds: readonly string[];
  createdIntent: boolean;
  signed: false;
  broadcast: false;
  riskOverridden: false;
  error: string | null;
}

export interface RuntimeHealthCheck {
  id: string;
  label: string;
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "BLOCKED";
  detail: string;
}

export interface RuntimeHealthReport {
  overall: "HEALTHY" | "DEGRADED" | "OFFLINE";
  checks: readonly RuntimeHealthCheck[];
}

export interface AgentRuntime {
  readonly kind: "LOCAL" | "AGENT_STUDIO";
  start(nowMs: number): StudioRuntimeState;
  stop(nowMs: number): StudioRuntimeState;
  status(): StudioRuntimeState;
  health(): RuntimeHealthReport;
  runCycle(nowMs: number): Promise<KairosCycleReport>;
  scheduleCycle(intervalMs: number, nowMs: number): void;
  pump(nowMs: number): Promise<KairosCycleReport | null>;
}
