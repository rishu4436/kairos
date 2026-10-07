import { assertPersistable, commitRecord, stateKey, type KairosStateStore } from "@/runtime/store";
import { autonomousStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import type { AutonomousExecutionMode, KairosCycleState } from "@/runtime/types";
import type { TokenScopeAdmission } from "@/wallet/agentic/token-scope";
import type { ObservationBoard } from "@/domain/observation";

export interface RuntimeSnapshot {
  status: "RUNNING" | "OFFLINE" | "DEGRADED" | "PAUSED" | "STOPPED" | "UNAVAILABLE";
  executionMode: AutonomousExecutionMode | null;
  configVersion: number | null;
  lastHeartbeat: string | null;
  lastCompletedCycle: string | null;
  nextScheduledCycle: string | null;
  lastCycleStatus: KairosCycleState | null;
  reason: string | null;
  observedAt: string;
}

export interface WalletSnapshot {
  connectionStatus: "CONNECTED" | "UNCONNECTED" | "UNAVAILABLE";
  address: string | null;
  chainId: string;
  bnb: string | null;
  usdt: string | null;
  tokens: readonly { symbol: string; amount: string }[];
  quotaUsed: string | null;
  quotaRemaining: string | null;
  highRiskHandling: string | null;
  tokenScope: TokenScopeAdmission | "UNAVAILABLE";
  observedAt: string;
  stale: boolean;
}

export interface ObservationSnapshot {
  generatedAt: string;
  ok: boolean;
  rows: readonly {
    ticker: string;
    tokenSymbol: string;
    platform: string;
    chain: string;
    contract: string;
    price: string | null;
    referencePrice: string | null;
    session: string;
    regime: string;
    dataQuality: string | null;
    representationId: string;
    arbitration: string | null;
    selectedStrategy: string | null;
    selectedAction: string | null;
    reasons: string | null;
    signals: readonly {
      strategyId: string;
      strategyName: string;
      action: string;
      confidence: number;
      reason: string;
    }[];
  }[];
  observedAt: string;
}

const STALE_MS = 5 * 60 * 1000;

export function runtimeSnapshotKey(userId = LOCAL_RUNTIME_USER_ID, agentId = DEFAULT_AGENT_ID): string {
  return stateKey(["snapshot", "runtime", userId, agentId]);
}

export function walletSnapshotKey(userId = LOCAL_RUNTIME_USER_ID, agentId = DEFAULT_AGENT_ID): string {
  return stateKey(["snapshot", "wallet", userId, agentId]);
}

export function observationSnapshotKey(userId = LOCAL_RUNTIME_USER_ID, agentId = DEFAULT_AGENT_ID): string {
  return stateKey(["snapshot", "observation", userId, agentId]);
}

export function persistRuntimeSnapshot(snapshot: RuntimeSnapshot, store: KairosStateStore = autonomousStore()): void {
  assertPersistable(snapshot);
  commitRecord(store, runtimeSnapshotKey(), snapshot, snapshot.observedAt);
}

export function persistWalletSnapshot(snapshot: WalletSnapshot, store: KairosStateStore = autonomousStore()): void {
  assertPersistable(snapshot);
  commitRecord(store, walletSnapshotKey(), { ...snapshot, stale: false }, snapshot.observedAt);
}

export function persistObservationSnapshot(board: ObservationBoard, store: KairosStateStore = autonomousStore()): void {
  const snapshot: ObservationSnapshot = {
    generatedAt: board.generatedAt,
    ok: board.ok,
    observedAt: new Date().toISOString(),
    rows: board.rows.map((row) => ({
      ticker: row.ticker,
      tokenSymbol: row.tokenSymbol,
      platform: row.platformLabel,
      chain: row.chainLabel,
      contract: row.contractAddress ?? "—",
      price: row.price,
      referencePrice: row.referencePrice,
      session: row.sessionLabel,
      regime: row.regime,
      dataQuality: row.dataQuality,
      representationId: row.representationId,
      arbitration: row.arbitration?.decision ?? null,
      selectedStrategy: row.arbitration?.selectedStrategyName ?? null,
      selectedAction: row.arbitration?.selectedAction ?? null,
      reasons: row.arbitration?.evidence.summary ?? null,
      signals: row.signals
        .filter((signal) => signal.strategyId === "momentum" || signal.strategyId === "mean-reversion" || signal.strategyId === "weekend" || signal.strategyId === "dca")
        .map((signal) => ({
          strategyId: signal.strategyId,
          strategyName: signal.strategyName,
          action: signal.action,
          confidence: signal.confidence,
          reason: signal.reasons[0] ?? signal.evaluation,
        })),
    })),
  };
  assertPersistable(snapshot);
  commitRecord(store, observationSnapshotKey(), snapshot, snapshot.observedAt);
}

export function readRuntimeSnapshot(store: KairosStateStore = autonomousStore(), nowMs = Date.now()): RuntimeSnapshot {
  const record = store.get<RuntimeSnapshot>(runtimeSnapshotKey());
  if (!record) {
    return {
      status: "UNAVAILABLE",
      executionMode: null,
      configVersion: null,
      lastHeartbeat: null,
      lastCompletedCycle: null,
      nextScheduledCycle: null,
      lastCycleStatus: null,
      reason: "No runtime snapshot is stored.",
      observedAt: new Date(nowMs).toISOString(),
    };
  }
  const age = nowMs - Date.parse(record.value.observedAt);
  if (Number.isFinite(age) && age > STALE_MS) {
    return { ...record.value, status: record.value.status === "RUNNING" ? "OFFLINE" : record.value.status, reason: record.value.reason ?? "Runtime snapshot is stale." };
  }
  return record.value;
}

export function readWalletSnapshot(store: KairosStateStore = autonomousStore(), nowMs = Date.now()): WalletSnapshot {
  const record = store.get<WalletSnapshot>(walletSnapshotKey());
  if (!record) {
    return {
      connectionStatus: "UNAVAILABLE",
      address: null,
      chainId: "56",
      bnb: null,
      usdt: null,
      tokens: [],
      quotaUsed: null,
      quotaRemaining: null,
      highRiskHandling: null,
      tokenScope: "UNAVAILABLE",
      observedAt: new Date(nowMs).toISOString(),
      stale: false,
    };
  }
  const age = nowMs - Date.parse(record.value.observedAt);
  const stale = Number.isFinite(age) && age > STALE_MS;
  return { ...record.value, stale, connectionStatus: stale && record.value.connectionStatus === "CONNECTED" ? "UNAVAILABLE" : record.value.connectionStatus };
}

export function readObservationSnapshot(store: KairosStateStore = autonomousStore()): ObservationSnapshot | null {
  return store.get<ObservationSnapshot>(observationSnapshotKey())?.value ?? null;
}

export function unavailableRuntime(): RuntimeSnapshot {
  return readRuntimeSnapshot(autonomousStore(), Date.now());
}
