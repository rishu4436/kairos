import { BINANCE_SKILLS } from "@/skills/registry";
import type { SkillHealth } from "@/skills/types";

export function skillHealthLabel(skillId: string, walletConnected: boolean): string {
  if (skillId === "binance-wallet-tracker") {
    return "NOT ENABLED";
  }
  if (skillId === "binance-agentic-wallet") {
    return walletConnected ? "CONNECTED" : "NOT CONFIGURED";
  }
  if (skillId === "binance-trading-signal") {
    return "NOT AVAILABLE";
  }
  if (skillId === "binance-tokenized-securities-info") {
    return "LIMITED";
  }
  if (skillId === "query-token-audit") {
    return "NOT VERIFIED";
  }
  return "NOT AVAILABLE";
}

/**
 * READY is not used. No skill call in this phase recorded a successful live read.
 * Wallet CONNECTED is shown only when the already-fetched wallet status says so.
 */
export function buildSkillHealth(walletConnected: boolean): SkillHealth[] {
  return BINANCE_SKILLS.map((skill) => ({
    skillId: skill.id,
    status: skill.status,
    lastSuccess: null,
    lastFailure: null,
    lastLatencyMs: null,
    errorCount: 0,
    available: skill.status === "AVAILABLE" && skill.compatibility === "COMPATIBLE",
    version: skill.version,
    label: skillHealthLabel(skill.id, walletConnected),
  }));
}
