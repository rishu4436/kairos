import { autonomousStore, type KairosStateStore } from "@/runtime/store";
import { applyOperatorPatch, type OperatorConfig } from "@/operator/config";
import { readOperatorConfig, writeOperatorConfig } from "@/operator/store";
import { readOperatorCommand, writeControl, writeOperatorCommand } from "@/operator/commands";
import { runKairosAutonomousCycle, type AutonomousCycleOutcome } from "@/runtime/cycle";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";
import { observeLiveMarket } from "@/observation/live";
import { readDataMode } from "@/lib/mode";
import type { RiskPosture } from "@/operator/posture";
import { applyAutoProfile } from "@/operator/store";
import { operatorExecutionMode } from "@/operator/runtime-mode";
import { beginOperatorCycle, endOperatorCycle } from "@/operator/cycle-lock";

export type OperatorAction =
  | "RUN"
  | "PAUSE"
  | "STOP"
  | "ONE_CYCLE"
  | "EXECUTION_DISABLE"
  | "CONFIG_PATCH"
  | "POSTURE"
  | "SET_MANDATE";

export function operatorAuditType(action: OperatorAction): string {
  if (action === "RUN") return "AGENT_STARTED";
  if (action === "PAUSE") return "AGENT_PAUSED";
  if (action === "STOP") return "AGENT_STOPPED";
  if (action === "ONE_CYCLE") return "ONE_CYCLE_REQUESTED";
  if (action === "EXECUTION_DISABLE") return "EXECUTION_DISABLED";
  return "OPERATOR_CONFIG_UPDATED";
}

export function applyRuntimeAction(
  action: Exclude<OperatorAction, "CONFIG_PATCH" | "ONE_CYCLE">,
  store: KairosStateStore = autonomousStore(),
  nowIso = new Date().toISOString(),
): { ok: true } | { ok: false; reason: string } {
  if (action === "RUN") {
    if (!writeControl("RUNNING", store, nowIso)) {
      return { ok: false, reason: "CONTROL_CONFLICT" };
    }
    writeOperatorCommand({ kind: "IDLE", requestedAt: nowIso }, store);
  } else if (action === "PAUSE") {
    writeControl("PAUSED", store, nowIso);
  } else if (action === "STOP") {
    writeControl("STOPPED", store, nowIso);
  } else {
    const current = readOperatorConfig(store);
    const next = applyOperatorPatch(current, { executionAdmissionDisabled: true }, nowIso);
    if (!next.ok) {
      return { ok: false, reason: next.reason };
    }
    const wrote = writeOperatorConfig(next.config, store);
    if (!wrote.ok) {
      return { ok: false, reason: wrote.reason };
    }
  }
  store.appendAudit({
    id: `${action}:${nowIso}`,
    at: nowIso,
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    cycleId: null,
    type: operatorAuditType(action),
    message: action,
  });
  return { ok: true };
}

export function patchOperatorConfig(
  patch: Partial<OperatorConfig> & Record<string, unknown>,
  store: KairosStateStore = autonomousStore(),
  nowIso = new Date().toISOString(),
): { ok: true; config: OperatorConfig } | { ok: false; reason: string } {
  const current = readOperatorConfig(store);
  const normalized = normalizePatch(patch);
  if (normalized.runtime?.executionMode === "LIVE" && patch.confirmLive !== true && patch.confirmLive !== "LIVE") {
    return { ok: false, reason: "LIVE_CONFIRMATION_REQUIRED" };
  }
  const next = applyOperatorPatch(current, normalized, nowIso);
  if (!next.ok) {
    store.appendAudit({
      id: `CONFIG_REJECTED:${nowIso}`,
      at: nowIso,
      userId: LOCAL_RUNTIME_USER_ID,
      agentId: DEFAULT_AGENT_ID,
      cycleId: null,
      type: "OPERATOR_CONFIG_REJECTED",
      message: next.reason,
    });
    return next;
  }
  const wrote = writeOperatorConfig(next.config, store);
  if (!wrote.ok) {
    return { ok: false, reason: wrote.reason };
  }
  store.appendAudit({
    id: `CONFIG:${next.config.version}`,
    at: nowIso,
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    cycleId: null,
    type: "OPERATOR_CONFIG_UPDATED",
    message: `config v${next.config.version}`,
  });
  return { ok: true, config: next.config };
}

export function saveMandate(
  input: { mode: "AUTO" | "MANUAL"; profile: "LOW" | "MEDIUM" | "HIGH" },
  store: KairosStateStore = autonomousStore(),
  nowIso = new Date().toISOString(),
): { ok: true; config: OperatorConfig } | { ok: false; reason: string } {
  const current = readOperatorConfig(store);
  const next = input.mode === "AUTO"
    ? applyAutoProfile(current, input.profile, nowIso)
    : {
        ...current,
        updatedAt: nowIso,
        version: current.version + 1,
        previousVersion: current.version,
        mandate: {
          operatorMode: "MANUAL" as const,
          autoProfile: null,
          autoProfileVersion: null,
          selectedManualStrategies: ["momentum", "mean-reversion", "weekend", "dca"],
          selectedManualAssets: current.watchlist.entries.map((entry) => entry.ticker),
        },
        runtime: { ...current.runtime, executionMode: "LIVE_PREVIEW" as const },
        risk: { ...current.risk, liveTradingEnabled: false, paperTradingEnabled: false },
      };
  const wrote = writeOperatorConfig(next, store);
  if (!wrote.ok) {
    return wrote;
  }
  store.appendAudit({
    id: `MANDATE:${input.mode}:${next.version}`,
    at: nowIso,
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    cycleId: null,
    type: input.mode === "AUTO" ? "AUTO_PROFILE_SELECTED" : "MANUAL_MANDATE_UPDATED",
    message: input.mode === "AUTO" ? `AUTO ${input.profile}` : "MANUAL",
  });
  return { ok: true, config: next };
}

export function applyRiskPosture(
  posture: RiskPosture,
  store: KairosStateStore = autonomousStore(),
  nowIso = new Date().toISOString(),
): { ok: true; config: OperatorConfig } | { ok: false; reason: string } {
  const current = readOperatorConfig(store);
  const profile = posture === "CONSERVATIVE" ? "LOW" : posture === "HIGH" ? "HIGH" : "MEDIUM";
  const next = applyAutoProfile(current, profile, nowIso);
  next.version = current.version + 1;
  next.previousVersion = current.version;
  next.updatedAt = nowIso;
  const wrote = writeOperatorConfig(next, store);
  if (!wrote.ok) {
    return { ok: false, reason: wrote.reason };
  }
  store.appendAudit({
    id: `POSTURE:${posture}:${next.version}`,
    at: nowIso,
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    cycleId: null,
    type: "STRATEGY_CONFIG_UPDATED",
    message: `Auto posture ${posture}`,
  });
  return { ok: true, config: next };
}

export async function requestOneCycle(
  store: KairosStateStore = autonomousStore(),
  nowMs = Date.now(),
): Promise<AutonomousCycleOutcome> {
  const nowIso = new Date(nowMs).toISOString();
  if (!beginOperatorCycle(store, `operator-one:${nowMs}`)) {
    throw new Error("CYCLE_IN_FLIGHT");
  }
  writeOperatorCommand({ kind: "ONE_SHOT", requestedAt: nowIso }, store);
  store.appendAudit({
    id: `ONE_CYCLE:${nowIso}`,
    at: nowIso,
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    cycleId: null,
    type: "ONE_CYCLE_REQUESTED",
    message: "ONE_CYCLE",
  });
  const live = readDataMode() === "live";
  let outcome: AutonomousCycleOutcome;
  try {
    outcome = await runKairosAutonomousCycle({
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    runtimeMode: "LOCAL",
    executionMode: operatorExecutionMode(readOperatorConfig(store)),
    cycleTrigger: "MANUAL",
    startedAtMs: nowMs,
    ownerId: `operator-one:${nowMs}`,
    marketAvailable: true,
    researchAvailable: false,
    observeMarket: live ? observeLiveMarket : undefined,
    store,
    control: "RUNNING",
    });
  } finally {
    endOperatorCycle(store);
  }
  writeControl("STOPPED", store, new Date().toISOString());
  writeOperatorCommand({ kind: "IDLE", requestedAt: new Date().toISOString() }, store);
  return outcome;
}

export function commandState(store: KairosStateStore = autonomousStore()) {
  return { control: store.readControl(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID), command: readOperatorCommand(store) };
}

function normalizePatch(patch: Partial<OperatorConfig> & Record<string, unknown>): Partial<OperatorConfig> & Record<string, unknown> {
  const risk = patch.risk as { allowedAssets?: unknown } | undefined;
  if (risk && typeof risk.allowedAssets === "string") {
    return {
      ...patch,
      risk: {
        ...risk,
        allowedAssets: risk.allowedAssets.split(",").map((item) => item.trim()).filter(Boolean),
      } as unknown as OperatorConfig["risk"],
    };
  }
  return patch;
}
