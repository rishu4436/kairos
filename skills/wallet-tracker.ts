import { getSkill } from "@/skills/registry";
import type { WalletSignal } from "@/skills/types";

export const WALLET_TRACKER_FUTURE_USES = [
  "Smart Money tracking",
  "wallet-level trade events",
  "accumulation and distribution",
  "sector rotation",
  "anomaly activity",
  "first-mover and leader-follower patterns",
] as const;

export interface WalletTrackerDiscovery {
  skillId: "binance-wallet-tracker";
  status: "SKILL_BLOCKED_BY_VERSION";
  requiredCliVersion: string | null;
  installedCliVersion: string;
  enabled: false;
  activeStrategy: false;
  onMainBrain: false;
  futureUses: readonly string[];
  signals: readonly WalletSignal[];
}

/** Discovery only. This does not call baw and does not emit signals. */
export function discoverWalletTracker(): WalletTrackerDiscovery {
  const skill = getSkill("binance-wallet-tracker");
  return {
    skillId: "binance-wallet-tracker",
    status: "SKILL_BLOCKED_BY_VERSION",
    requiredCliVersion: skill?.requiredCliVersion ?? "1.9.1",
    installedCliVersion: skill?.installedCliVersion ?? "1.9.0",
    enabled: false,
    activeStrategy: false,
    onMainBrain: false,
    futureUses: WALLET_TRACKER_FUTURE_USES,
    signals: [],
  };
}
