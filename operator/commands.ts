import { commitRecord, stateKey, type KairosStateStore } from "@/runtime/store";
import { autonomousStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import type { AgentControlState } from "@/runtime/types";

export type OperatorCommandKind = "IDLE" | "ONE_SHOT";

export interface OperatorCommand {
  kind: OperatorCommandKind;
  requestedAt: string;
}

export function commandKey(userId = LOCAL_RUNTIME_USER_ID, agentId = DEFAULT_AGENT_ID): string {
  return stateKey(["operator", "command", userId, agentId]);
}

export function readOperatorCommand(store: KairosStateStore = autonomousStore()): OperatorCommand {
  return store.get<OperatorCommand>(commandKey())?.value ?? { kind: "IDLE", requestedAt: new Date(0).toISOString() };
}

export function writeOperatorCommand(command: OperatorCommand, store: KairosStateStore = autonomousStore()): void {
  commitRecord(store, commandKey(), command, command.requestedAt);
}

export function writeControl(state: AgentControlState, store: KairosStateStore = autonomousStore(), nowIso = new Date().toISOString()): boolean {
  const key = stateKey(["control", LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID]);
  const revision = store.get(key)?.revision ?? 0;
  return store.writeControl(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID, state, revision, nowIso).ok;
}
