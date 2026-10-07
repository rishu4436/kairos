import type { BinanceSkill, ForbiddenCapability, SkillCapability } from "@/skills/types";
import { FORBIDDEN_CAPABILITIES } from "@/skills/types";

/** Observed on this machine on 2026-10-04. `baw --version` printed 1.9.0. Node was v24.18.0. */
export const OBSERVED_BAW_VERSION = "1.9.0";
export const OBSERVED_NODE_VERSION = "v24.18.0";

export const PRE_TRADE_CONTRACT = [
  "STRATEGY",
  "ARBITRATION",
  "KAIROS_RISK",
  "TOKEN_SECURITY",
  "QUOTE",
  "SIMULATION",
  "WALLET",
] as const;

export function compareCliVersion(installed: string, required: string | null): "COMPATIBLE" | "SKILL_BLOCKED_BY_VERSION" {
  if (required === null || required.trim().length === 0) {
    return "COMPATIBLE";
  }
  const left = installed.split(".").map((part) => Number.parseInt(part, 10));
  const right = required.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const have = left[index] ?? 0;
    const need = right[index] ?? 0;
    if (!Number.isFinite(have) || !Number.isFinite(need)) {
      return "SKILL_BLOCKED_BY_VERSION";
    }
    if (have > need) {
      return "COMPATIBLE";
    }
    if (have < need) {
      return "SKILL_BLOCKED_BY_VERSION";
    }
  }
  return "COMPATIBLE";
}

export function assertIntelligenceCapabilities(capabilities: readonly string[]): void {
  for (const capability of capabilities) {
    if ((FORBIDDEN_CAPABILITIES as readonly string[]).includes(capability)) {
      throw new Error(`An intelligence skill cannot hold ${capability}.`);
    }
  }
}

function skill(input: Omit<BinanceSkill, "compatibility" | "installedCliVersion"> & { requiredCliVersion: string | null }): BinanceSkill {
  assertIntelligenceCapabilities(input.capabilities);
  const compatibility = compareCliVersion(OBSERVED_BAW_VERSION, input.requiredCliVersion);
  return {
    ...input,
    installedCliVersion: OBSERVED_BAW_VERSION,
    compatibility,
    status: compatibility === "SKILL_BLOCKED_BY_VERSION" ? "BLOCKED" : input.status,
    enabled: compatibility === "SKILL_BLOCKED_BY_VERSION" ? false : input.enabled,
    blockReason: compatibility === "SKILL_BLOCKED_BY_VERSION" ? "SKILL_BLOCKED_BY_VERSION" : input.blockReason,
  };
}

/**
 * Versions are the SKILL.md files inspected on 2026-10-04.
 * Only binance-agentic-wallet is installed locally, at 1.11.0.
 * The other four were read from the Binance Skills Hub and were not installed.
 */
export const BINANCE_SKILLS: readonly BinanceSkill[] = [
  skill({
    id: "binance-agentic-wallet",
    name: "Binance Agentic Wallet",
    version: "1.11.0",
    status: "AVAILABLE",
    capabilities: [],
    categories: ["EXECUTION"],
    requiredCliVersion: "1.9.0",
    executionAccess: "ISOLATED",
    dataAccess: "NONE",
    enabled: true,
    installed: true,
    transport: "LOCAL_CLI",
    limitation: "Execution stays in the wallet boundary. This registry grants no sign or broadcast capability.",
    blockReason: null,
  }),
  skill({
    id: "binance-trading-signal",
    name: "Binance Trading Signal",
    version: "3.5",
    status: "AVAILABLE",
    capabilities: ["READ_SIGNAL", "READ_SIGNAL_HISTORY", "READ_BACKTEST_RESULT"],
    categories: ["TRADING_SIGNAL", "MARKET_INTELLIGENCE"],
    requiredCliVersion: "1.9.1",
    executionAccess: "NONE",
    dataAccess: "READ",
    enabled: false,
    installed: false,
    transport: "SKILL",
    limitation: "baw signal commands need CLI 1.9.1. Smart Money is documented as a skill script, which is not installed. No public URL was published in references/cli.md.",
    blockReason: null,
  }),
  skill({
    id: "query-token-audit",
    name: "Query Token Audit",
    version: "1.4",
    status: "AVAILABLE",
    capabilities: ["READ_TOKEN_SECURITY"],
    categories: ["TOKEN_SECURITY"],
    requiredCliVersion: null,
    executionAccess: "NONE",
    dataAccess: "READ",
    enabled: true,
    installed: false,
    transport: "DIRECT_API",
    limitation: "Authoritative only when hasResult and isSupported are both true. No live audit was run in this phase.",
    blockReason: "NOT_INSTALLED",
  }),
  skill({
    id: "binance-tokenized-securities-info",
    name: "Binance Tokenized Securities Info",
    version: "1.1",
    status: "AVAILABLE",
    capabilities: ["READ_TOKENIZED_SECURITY"],
    categories: ["TOKENIZED_SECURITY_INFO", "MARKET_INTELLIGENCE"],
    requiredCliVersion: null,
    executionAccess: "NONE",
    dataAccess: "READ",
    enabled: true,
    installed: false,
    transport: "DIRECT_API",
    limitation: "CAPABILITY_LIMITATION: ONDO_ONLY",
    blockReason: "NOT_INSTALLED",
  }),
  skill({
    id: "binance-wallet-tracker",
    name: "Binance Wallet Tracker",
    version: "1.3",
    status: "AVAILABLE",
    capabilities: ["READ_WALLET_INTELLIGENCE"],
    categories: ["WALLET_INTELLIGENCE"],
    requiredCliVersion: "1.9.1",
    executionAccess: "NONE",
    dataAccess: "NONE",
    enabled: false,
    installed: false,
    transport: "LOCAL_CLI",
    limitation: "Interface only. The skill is not on the main brain and is not an active strategy.",
    blockReason: null,
  }),
];

export function getSkill(id: string): BinanceSkill | null {
  return BINANCE_SKILLS.find((item) => item.id === id) ?? null;
}

export function declaredCapabilities(id: string): readonly SkillCapability[] {
  return getSkill(id)?.capabilities ?? [];
}

export function can(id: string, capability: SkillCapability | ForbiddenCapability): boolean {
  if ((FORBIDDEN_CAPABILITIES as readonly string[]).includes(capability)) {
    return false;
  }
  return declaredCapabilities(id).includes(capability as SkillCapability);
}

/** A blocked or disabled skill cannot be invoked, even if a read is declared. */
export function canInvoke(id: string): boolean {
  const found = getSkill(id);
  if (!found || !found.enabled || found.status !== "AVAILABLE") {
    return false;
  }
  return found.executionAccess !== "ISOLATED";
}

export function tokenSecurityFollowsRisk(): boolean {
  return PRE_TRADE_CONTRACT.indexOf("TOKEN_SECURITY") > PRE_TRADE_CONTRACT.indexOf("KAIROS_RISK");
}
