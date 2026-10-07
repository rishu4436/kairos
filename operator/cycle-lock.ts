import { stateKey, type KairosStateStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";

function key(): string {
  return stateKey(["operator", "cycle", LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID]);
}

export function cycleInFlight(store: KairosStateStore): boolean {
  return store.get<"ACTIVE" | "IDLE">(key())?.value === "ACTIVE";
}

export function beginOperatorCycle(store: KairosStateStore, ownerId: string): boolean {
  const current = store.get(key());
  if (current?.value === "ACTIVE") {
    return false;
  }
  const wrote = store.compareAndSet(key(), current?.revision ?? 0, "ACTIVE", new Date().toISOString());
  return wrote.ok && ownerId.length > 0;
}

export function endOperatorCycle(store: KairosStateStore): void {
  const current = store.get(key());
  store.compareAndSet(key(), current?.revision ?? 0, "IDLE", new Date().toISOString());
}
