import { MEAN_REVERSION_PARAMS, MOMENTUM_PARAMS, WEEKEND_PARAMS } from "@/strategies/parameters";
import type { StrategyLifecycleState, StrategySource, StrategyVersion } from "@/lifecycle/types";

interface Memory {
  versions: StrategyVersion[];
}

const KEY = "__kairosStrategyVersions";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [KEY]?: Memory };
  if (!host[KEY]) {
    host[KEY] = { versions: seed() };
  }
  return host[KEY];
}

function seed(): StrategyVersion[] {
  const at = "2026-10-04T00:00:00.000Z";
  return [
    version("momentum", "1", "BUILT_IN", at, flat(MOMENTUM_PARAMS), "Deterministic momentum rules.", "IMPLEMENTED"),
    version("mean-reversion", "1", "BUILT_IN", at, flat(MEAN_REVERSION_PARAMS), "Deterministic mean-reversion rules.", "IMPLEMENTED"),
    version("weekend", "1", "BUILT_IN", at, flat(WEEKEND_PARAMS), "Deterministic off-hours dislocation rule.", "IMPLEMENTED"),
  ];
}

function flat(parameters: object): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map(String).join(",");
    }
  }
  return out;
}

function version(
  strategyId: string,
  number: string,
  source: StrategySource,
  createdAt: string,
  parameters: Readonly<Record<string, string | number | boolean>>,
  definition: string,
  status: StrategyLifecycleState,
): StrategyVersion {
  return { strategyId, version: number, source, createdAt, parameters: { ...parameters }, definition, status };
}

export function resetStrategyVersions(): void {
  memory().versions = seed();
}

export function listStrategyVersions(strategyId?: string): readonly StrategyVersion[] {
  return memory().versions.filter((item) => strategyId === undefined || item.strategyId === strategyId);
}

export function getStrategyVersion(strategyId: string, versionNumber: string): StrategyVersion | null {
  return memory().versions.find((item) => item.strategyId === strategyId && item.version === versionNumber) ?? null;
}

/** A new modification appends a version. An existing version number is refused. */
export function publishStrategyVersion(input: Omit<StrategyVersion, "version"> & { version?: string }): StrategyVersion {
  const existing = listStrategyVersions(input.strategyId);
  const number = input.version ?? String(existing.length + 1);
  if (existing.some((item) => item.version === number)) {
    throw new Error("STRATEGY_VERSION_EXISTS");
  }
  if (existing.some((item) => item.source !== input.source)) {
    throw new Error("STRATEGY_SOURCE_MISMATCH");
  }
  const created: StrategyVersion = { ...input, version: number, parameters: { ...input.parameters } };
  memory().versions.push(created);
  return created;
}

export function exportStrategyVersions(): StrategyVersion[] {
  return memory().versions.map((item) => ({ ...item, parameters: { ...item.parameters } }));
}

/** Restores published versions. A research version is never restored as LIVE_ACTIVE. */
export function importStrategyVersions(versions: readonly StrategyVersion[]): void {
  for (const version of versions) {
    if (version.source === "RESEARCH_GENERATED" && version.status === "LIVE_ACTIVE") {
      continue;
    }
    const current = getStrategyVersion(version.strategyId, version.version);
    const next = { ...version, parameters: { ...version.parameters } };
    if (!current) {
      memory().versions.push(next);
      continue;
    }
    if (current.source === "BUILT_IN" && version.source !== "BUILT_IN") {
      continue;
    }
    memory().versions = memory().versions.map((item) => (item.strategyId === version.strategyId && item.version === version.version ? next : item));
  }
}

export function setVersionStatus(strategyId: string, versionNumber: string, status: StrategyLifecycleState): StrategyVersion {
  const current = getStrategyVersion(strategyId, versionNumber);
  if (!current) {
    throw new Error("STRATEGY_VERSION_MISSING");
  }
  if (current.source === "RESEARCH_GENERATED" && status === "LIVE_ACTIVE") {
    throw new Error("RESEARCH_CANNOT_BECOME_LIVE");
  }
  const next = { ...current, status };
  memory().versions = memory().versions.map((item) => (item.strategyId === strategyId && item.version === versionNumber ? next : item));
  return next;
}
