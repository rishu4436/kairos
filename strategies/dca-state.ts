import { commitRecord, stateKey, type KairosStateStore } from "@/runtime/store";
import { autonomousStore } from "@/runtime/store";
import { type DcaAssetState } from "@/strategies/dca-math";

export type { DcaAssetState } from "@/strategies/dca-math";
export { budgetRemaining, dcaEligibleKey, dipTriggered, emptyDcaState } from "@/strategies/dca-math";

export function dcaKey(userId: string, agentId: string, assetId: string): string {
  return stateKey(["dca", userId, agentId, assetId]);
}

export function readDcaState(userId: string, agentId: string, assetId: string, store: KairosStateStore = autonomousStore()): DcaAssetState | null {
  return store.get<DcaAssetState>(dcaKey(userId, agentId, assetId))?.value ?? null;
}

export function writeDcaState(userId: string, agentId: string, state: DcaAssetState, store: KairosStateStore = autonomousStore(), nowIso = new Date().toISOString()): void {
  commitRecord(store, dcaKey(userId, agentId, state.assetId), state, nowIso);
}
