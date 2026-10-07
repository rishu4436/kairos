import type { AgentHeartbeat, AgentRuntimeEvent, KairosCycleReport, StudioRuntimeState } from "@/studio/types";

export interface RuntimeState {
  runtimeKind: "LOCAL" | "AGENT_STUDIO";
  state: StudioRuntimeState;
  startedAtMs: number | null;
  heartbeat: AgentHeartbeat;
  lastCycle: KairosCycleReport | null;
  events: AgentRuntimeEvent[];
  cycles: KairosCycleReport[];
  deployment: { deployed: false; deploymentId: null; runtimeId: null };
}

interface Memory {
  books: Map<string, RuntimeState>;
  sequence: number;
}

const KEY = "__kairosRuntimeStore";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [KEY]?: Memory };
  if (!host[KEY]) {
    host[KEY] = { books: new Map(), sequence: 0 };
  }
  return host[KEY];
}

export function resetRuntimeStore(): void {
  const store = memory();
  store.books.clear();
  store.sequence = 0;
}

export function nextRuntimeSequence(): number {
  const store = memory();
  store.sequence += 1;
  return store.sequence;
}

export function emptyHeartbeat(kairosAgentId: string, state: StudioRuntimeState): AgentHeartbeat {
  return {
    agentId: null,
    kairosAgentId,
    runtimeId: null,
    lastCycleStarted: null,
    lastCycleCompleted: null,
    lastSuccessfulObservation: null,
    lastError: null,
    currentState: state,
    tradingState: null,
    nextCycle: null,
    uptimeMs: null,
  };
}

export class InMemoryRuntimeStateStore {
  constructor(private readonly runtimeKind: "LOCAL" | "AGENT_STUDIO") {}

  read(kairosAgentId: string): RuntimeState {
    const existing = memory().books.get(this.storageKey(kairosAgentId));
    if (existing) {
      return existing;
    }
    const created: RuntimeState = {
      runtimeKind: this.runtimeKind,
      state: "OFFLINE",
      startedAtMs: null,
      heartbeat: emptyHeartbeat(kairosAgentId, "OFFLINE"),
      lastCycle: null,
      events: [],
      cycles: [],
      deployment: { deployed: false, deploymentId: null, runtimeId: null },
    };
    memory().books.set(this.storageKey(kairosAgentId), created);
    return created;
  }

  write(kairosAgentId: string, state: RuntimeState): void {
    memory().books.set(this.storageKey(kairosAgentId), state);
  }

  listCycles(kairosAgentId: string, userId: string): readonly KairosCycleReport[] {
    return this.read(kairosAgentId).cycles.filter((cycle) => cycle.userId === userId);
  }

  private storageKey(kairosAgentId: string): string {
    return `${this.runtimeKind}:${kairosAgentId}`;
  }
}
