import { sessionPaperCapability } from "@/paper/run-cycle";
import { buildPaperObservation, paperObservationBoard } from "@/observation/paper";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import { readinessLabels } from "@/runtime/readiness";
import { autonomousStore } from "@/runtime/store";
import type { ObservationBoard } from "@/domain/observation";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import type { AgentCycleResult } from "@/paper/cycle";

/** One manual paper cycle. Pages call this. Tests and builds do not start a background loop. */
export async function runManualPaperCycle(now = new Date()): Promise<ObservationBoard> {
  let captured: ObservationBoard | null = null;
  await runKairosAutonomousCycle({
    userId: LOCAL_RUNTIME_USER_ID,
    agentId: DEFAULT_AGENT_ID,
    runtimeMode: "LOCAL",
    executionMode: "PAPER",
    cycleTrigger: "MANUAL",
    startedAtMs: now.getTime(),
    ownerId: `local:${LOCAL_RUNTIME_USER_ID}:${DEFAULT_AGENT_ID}`,
    marketAvailable: true,
    researchAvailable: false,
    runPaper: () => capturePaper(LOCAL_RUNTIME_USER_ID, now, (board) => {
      captured = board;
    }),
  });
  return captured ?? buildPaperObservation(LOCAL_RUNTIME_USER_ID, now).board;
}

export function autonomousSnapshot() {
  const store = autonomousStore();
  return {
    heartbeat: store.readHeartbeat(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID),
    cycles: store.listCycles(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID).slice(-8).reverse(),
    backend: store.backend,
    durable: store.durable,
    labels: readinessLabels(),
  };
}

function capturePaper(userId: string, now: Date, keep: (board: ObservationBoard) => void): AgentCycleResult {
  const authority = sessionPaperCapability(now.getTime());
  const board = authority ? paperObservationBoard(userId, { authority, now }) : buildPaperObservation(userId, now).board;
  keep(board);
  return {
    ran: Boolean(board.paperCycle),
    reason: board.paperCycle ? "Paper cycle." : "No paper cycle.",
    events: board.events,
    view: board.paperCycle ?? null,
    createdIntentIds: [],
    executionMode: board.paperCycle ? "PAPER" : null,
    authorityCode: null,
    executionContextId: null,
    loopState: board.paperCycle?.loopState ?? null,
    transitions: [],
  };
}
