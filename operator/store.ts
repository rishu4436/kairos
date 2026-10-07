import { commitRecord, stateKey, type KairosStateStore } from "@/runtime/store";
import { autonomousStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { defaultOperatorConfig, validateOperatorConfig, type OperatorConfig } from "@/operator/config";
import { readDataMode } from "@/lib/mode";

export function operatorConfigKey(userId = LOCAL_RUNTIME_USER_ID, agentId = DEFAULT_AGENT_ID): string {
  return stateKey(["operator", "config", userId, agentId]);
}

export function readOperatorConfig(store: KairosStateStore = autonomousStore()): OperatorConfig {
  const record = store.get<OperatorConfig>(operatorConfigKey());
  if (!record) {
    return alignOperatingMode(defaultOperatorConfig());
  }
  const valid = validateOperatorConfig(record.value);
  return alignOperatingMode(valid.ok ? valid.config : defaultOperatorConfig());
}

/** Paper execution is the thesis lab. Live market data never operates as paper. */
export function alignOperatingMode(config: OperatorConfig): OperatorConfig {
  if (readDataMode() !== "live" || config.runtime.executionMode !== "PAPER") {
    return config;
  }
  return { ...config, runtime: { ...config.runtime, executionMode: "LIVE_PREVIEW" } };
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
