import { nextRuntimeSequence } from "@/studio/store";
import type { AgentRuntimeEvent, RuntimeEventType, StudioRuntimeState } from "@/studio/types";

export function runtimeEvent(input: {
  type: RuntimeEventType;
  kairosAgentId: string;
  agentId?: string | null;
  runtimeId?: string | null;
  cycleId?: string | null;
  nowMs: number;
  state: StudioRuntimeState;
  detail?: string | null;
}): AgentRuntimeEvent {
  return {
    eventId: `runtime_evt_${nextRuntimeSequence()}`,
    type: input.type,
    agentId: input.agentId ?? null,
    kairosAgentId: input.kairosAgentId,
    runtimeId: input.runtimeId ?? null,
    cycleId: input.cycleId ?? null,
    timestamp: new Date(input.nowMs).toISOString(),
    state: input.state,
    detail: input.detail ?? null,
  };
}
