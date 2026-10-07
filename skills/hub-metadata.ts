/**
 * Versions read from github.com/binance/binance-skills-hub main on 2026-10-07.
 * The in-process adapter registry is a separate, older snapshot.
 */
export interface HubSkillMetadata {
  id: string;
  version: string;
  requiredBaw: string | null;
  publicRead: boolean;
  phase17: "PHASE_17_UPDATE_REQUIRED" | null;
}

export const HUB_SKILLS: readonly HubSkillMetadata[] = [
  { id: "binance-agentic-wallet", version: "1.12.0", requiredBaw: "1.10.0", publicRead: false, phase17: "PHASE_17_UPDATE_REQUIRED" },
  { id: "binance-trading-signal", version: "3.5", requiredBaw: "1.9.1", publicRead: false, phase17: null },
  { id: "query-token-audit", version: "1.4", requiredBaw: null, publicRead: true, phase17: null },
  { id: "binance-tokenized-securities-info", version: "1.1", requiredBaw: null, publicRead: true, phase17: null },
  { id: "binance-wallet-tracker", version: "1.3", requiredBaw: "1.9.1", publicRead: false, phase17: null },
];

export const OBSERVED_BAW_VERSION_PHASE16 = "1.9.0";

export function hubSkill(id: string): HubSkillMetadata | null {
  return HUB_SKILLS.find((item) => item.id === id) ?? null;
}
