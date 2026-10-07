import type { ExternalSignalFreshness } from "@/domain/arbitration";

export const SKILL_STATUSES = ["AVAILABLE", "BLOCKED", "DISABLED", "ERROR"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const CAPABILITY_CATEGORIES = [
  "MARKET_INTELLIGENCE",
  "TRADING_SIGNAL",
  "TOKEN_SECURITY",
  "TOKENIZED_SECURITY_INFO",
  "WALLET_INTELLIGENCE",
  "EXECUTION",
] as const;
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

/** Declared reads. Installation does not add to this list. */
export const READ_CAPABILITIES = [
  "READ_SIGNAL",
  "READ_SIGNAL_HISTORY",
  "READ_BACKTEST_RESULT",
  "READ_TOKEN_SECURITY",
  "READ_TOKENIZED_SECURITY",
  "READ_WALLET_INTELLIGENCE",
] as const;
export type ReadCapability = (typeof READ_CAPABILITIES)[number];

/** Intelligence skills cannot hold these. The execution boundary is separate. */
export const FORBIDDEN_CAPABILITIES = ["CREATE_TRADE_INTENT", "EXECUTE_TRADE", "SIGN", "BROADCAST"] as const;
export type ForbiddenCapability = (typeof FORBIDDEN_CAPABILITIES)[number];

export type SkillCapability = ReadCapability;

export type ExecutionAccess = "NONE" | "ISOLATED";
export type DataAccess = "NONE" | "READ";

export type TransportClass = "DIRECT_API" | "SKILL" | "PLUGIN" | "CLI" | "LOCAL_CLI" | "MOCK" | "UNAVAILABLE";

export interface BinanceSkill {
  id: string;
  name: string;
  version: string;
  status: SkillStatus;
  capabilities: readonly SkillCapability[];
  categories: readonly CapabilityCategory[];
  requiredCliVersion: string | null;
  installedCliVersion: string;
  compatibility: "COMPATIBLE" | "SKILL_BLOCKED_BY_VERSION";
  executionAccess: ExecutionAccess;
  dataAccess: DataAccess;
  enabled: boolean;
  installed: boolean;
  transport: TransportClass;
  limitation: string | null;
  blockReason: "SKILL_BLOCKED_BY_VERSION" | "NOT_INSTALLED" | null;
}

export interface ExternalSignal {
  signalId: string | null;
  source: "SMART_MONEY" | "USER_STRATEGY" | "MEME_OFFICIAL" | null;
  provider: string;
  chainId: string | null;
  ticker: string | null;
  contractAddress: string | null;
  direction: "BUY" | "SELL" | null;
  triggerPrice: string | null;
  currentPrice: string | null;
  triggerTime: string | null;
  maxGain: string | null;
  exitRate: number | null;
  /** Null unless the provider payload actually contains confidence. */
  confidence: number | null;
  /** Null unless the provider payload actually contains strength. A wallet count is not strength. */
  strength: number | null;
  /** Provider status. Null stays null. */
  status: string | null;
  freshness: ExternalSignalFreshness;
  rawSourceReference: string;
  observedAt: string;
  /** Documented Smart Money count. Null when the payload omits it. */
  smartMoneyCount: number | null;
  /** Documented tokenTag object, preserved. Null when omitted. */
  tokenTag: unknown | null;
}

export interface TokenSecurityAssessment {
  assetId: string | null;
  chainId: string | null;
  contractAddress: string | null;
  available: boolean;
  supported: boolean;
  riskLevel: number | null;
  riskLevelEnum: string | null;
  riskItems: readonly TokenRiskItem[] | null;
  taxInfo: TokenTaxInfo | null;
  checkedAt: string | null;
  source: string;
}

export interface TokenRiskItem {
  id: string | null;
  name: string | null;
  title: string | null;
  description: string | null;
  isHit: boolean | null;
  riskType: string | null;
}

export interface TokenTaxInfo {
  buyTax: string | null;
  sellTax: string | null;
  isVerified: boolean | null;
}

export interface SecurityEvent {
  eventType: string | null;
  status: string | null;
  effectiveTime: string | null;
  source: string;
  assetId: string | null;
}

export interface WalletSignal {
  chainId: string | null;
  contractAddress: string | null;
  direction: "BUY" | "SELL" | null;
  observedAt: string | null;
  pattern: string | null;
}

export const SKILL_EVENT_TYPES = [
  "SIGNAL_RECEIVED",
  "SIGNAL_UPDATED",
  "SIGNAL_EXPIRED",
  "SECURITY_AUDIT_RECEIVED",
  "SECURITY_AUDIT_UNAVAILABLE",
  "TOKEN_STATUS_RECEIVED",
  "SKILL_ERROR",
  "SKILL_DISABLED",
] as const;
export type SkillEventType = (typeof SKILL_EVENT_TYPES)[number];

export interface SkillEvent {
  eventId: string;
  skillId: string;
  type: SkillEventType;
  timestamp: string;
  userId: string;
  agentId: string | null;
  assetId: string | null;
  payload: Readonly<Record<string, string | number | boolean | null>>;
  freshness: ExternalSignalFreshness | "NONE";
  source: string;
}

export interface SkillHealth {
  skillId: string;
  status: SkillStatus;
  lastSuccess: string | null;
  lastFailure: string | null;
  lastLatencyMs: number | null;
  errorCount: number;
  available: boolean;
  version: string;
  label: string;
}

export type AssetMapResult =
  | { status: "MAPPED"; assetId: string }
  | { status: "SIGNAL_UNRELATED"; reason: string };

export interface CanonicalAssetRef {
  assetId: string;
  ticker: string;
  chainId: string;
  contractAddress: string;
}

export type ConfirmationOutcome = "CONFIRMING_EVIDENCE" | "CONFLICTING_EVIDENCE" | "NO_SIGNAL";

export type SignalRead =
  | { kind: "NO_SIGNAL"; signals: readonly ExternalSignal[] }
  | { kind: "PRESENT"; signals: readonly ExternalSignal[] }
  | { kind: "SKILL_ERROR"; signals: readonly ExternalSignal[]; message: string };
