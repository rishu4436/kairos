import { commitRecord, stateKey, type KairosStateStore } from "@/runtime/store";
import { autonomousStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { defaultOperatorConfig, validateOperatorConfig, type OperatorConfig } from "@/operator/config";
import { AUTO_PROFILES, PROFILE_VERSION } from "@/operator/mandate";

export function operatorConfigKey(userId = LOCAL_RUNTIME_USER_ID, agentId = DEFAULT_AGENT_ID): string {
  return stateKey(["operator", "config", userId, agentId]);
}

export function readOperatorConfig(store: KairosStateStore = autonomousStore()): OperatorConfig {
  const record = store.get<OperatorConfig>(operatorConfigKey());
  if (!record) {
    return alignOperatingMode(defaultOperatorConfig());
  }
  const valid = validateOperatorConfig(migrateOperatorConfig(record.value));
  return valid.ok ? valid.config : migrateOperatorConfig(defaultOperatorConfig());
}

/** Old PAPER operator state becomes preview and stays unable to trade live. */
export function migrateOperatorConfig(config: OperatorConfig): OperatorConfig {
  const base = defaultOperatorConfig(config.createdAt);
  const paper = config.runtime?.executionMode === "PAPER";
  return {
    ...base,
    ...config,
    schemaVersion: 2,
    runtime: {
      ...base.runtime,
      ...config.runtime,
      executionMode: paper || config.runtime?.executionMode !== "LIVE" ? "LIVE_PREVIEW" : "LIVE",
    },
    risk: {
      ...base.risk,
      ...config.risk,
      liveTradingEnabled: paper ? false : config.risk?.liveTradingEnabled === true,
      paperTradingEnabled: false,
    },
    capital: { ...base.capital, ...config.capital },
    mandate: config.mandate ?? {
      operatorMode: "UNCONFIGURED",
      autoProfile: null,
      autoProfileVersion: null,
      selectedManualStrategies: [],
      selectedManualAssets: [],
    },
    watchlist: config.watchlist ?? { version: 1, entries: [] },
  };
}

export function alignOperatingMode(config: OperatorConfig): OperatorConfig {
  return migrateOperatorConfig(config);
}

export function applyAutoProfile(config: OperatorConfig, profile: "LOW" | "MEDIUM" | "HIGH", nowIso: string): OperatorConfig {
  const preset = AUTO_PROFILES[profile];
  return migrateOperatorConfig({
    ...config,
    updatedAt: nowIso,
    runtime: { ...config.runtime, executionMode: "LIVE_PREVIEW" },
    capital: {
      ...config.capital,
      deployableCapitalBps: preset.deployableCapitalBps,
      perTradeBpsOfDeployable: preset.perTradeBpsOfDeployable,
      strategyBudgetBpsOfDeployable: preset.strategyBudgetBpsOfDeployable,
      maxPositionBpsOfDeployable: preset.maxPositionBpsOfDeployable,
      dcaOrderBpsOfDeployable: preset.dcaOrderBpsOfDeployable,
      dcaMaxBudgetBpsOfDeployable: preset.dcaMaxBudgetBpsOfDeployable,
      dailyLossBpsOfDeployable: preset.dailyLossBpsOfDeployable,
    },
    strategies: {
      ...config.strategies,
      momentum: { ...config.strategies.momentum, enabled: true, minReturnBps: preset.momentumMinReturnBps },
      "mean-reversion": { ...config.strategies["mean-reversion"], enabled: true, entryBps: preset.meanEntryBps },
      dca: { ...config.strategies.dca, enabled: preset.dcaEnabled, dipThresholdBps: preset.dcaDipBps },
    },
    mandate: {
      operatorMode: "AUTO",
      autoProfile: profile,
      autoProfileVersion: PROFILE_VERSION,
      selectedManualStrategies: [],
      selectedManualAssets: [],
    },
    risk: { ...config.risk, liveTradingEnabled: false, paperTradingEnabled: false },
  });
}

export function writeOperatorConfig(
  config: OperatorConfig,
  store: KairosStateStore = autonomousStore(),
  expectedRevision?: number,
): { ok: true; revision: number } | { ok: false; reason: string } {
  const valid = validateOperatorConfig(config);
  if (!valid.ok) {
    return { ok: false, reason: valid.reason };
  }
  const key = operatorConfigKey();
  const revision = expectedRevision ?? store.get(key)?.revision ?? 0;
  const wrote = store.compareAndSet(key, revision, valid.config, config.updatedAt);
  if (!wrote.ok) {
    return { ok: false, reason: wrote.reason };
  }
  return { ok: true, revision: wrote.record.revision };
}

export function ensureOperatorConfig(store: KairosStateStore = autonomousStore(), nowIso = new Date().toISOString()): OperatorConfig {
  const existing = store.get<OperatorConfig>(operatorConfigKey());
  if (existing) {
    const valid = validateOperatorConfig(existing.value);
    if (valid.ok) {
      return valid.config;
    }
  }
  const fresh = defaultOperatorConfig(nowIso);
  commitRecord(store, operatorConfigKey(), fresh, nowIso);
  return fresh;
}
