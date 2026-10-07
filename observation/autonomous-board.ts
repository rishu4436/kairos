import { sessionPaperCapability } from "@/paper/run-cycle";
import { buildPaperObservation, paperObservationBoard } from "@/observation/paper";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import { readinessLabels } from "@/runtime/readiness";
import { autonomousStore } from "@/runtime/store";
import type { ObservationBoard } from "@/domain/observation";
import { DEMO_USER_ID } from "@/domain/watchlist";
import type { AgentCycleResult } from "@/paper/cycle";

/** One manual paper cycle. Pages call this. Tests and builds do not start a background loop. */
export function runManualPaperCycle(now = new Date()): ObservationBoard {
  let captured: ObservationBoard | null = null;
  runKairosAutonomousCycle({
    userId: DEMO_USER_ID,
    agentId: "agent_demo",
    runtimeMode: "LOCAL",
    executionMode: "PAPER",
    cycleTrigger: "MANUAL",
    startedAtMs: now.getTime(),
    ownerId: "local:user_demo:agent_demo",
    marketAvailable: true,
    researchAvailable: false,
    runPaper: () => capturePaper(DEMO_USER_ID, now, (board) => {
      captured = board;
    }),
  });
  return captured ?? buildPaperObservation(DEMO_USER_ID, now).board;
}

export function autonomousSnapshot() {
  const store = autonomousStore();
  return {
    heartbeat: store.readHeartbeat(DEMO_USER_ID, "agent_demo"),
    cycles: store.listCycles(DEMO_USER_ID, "agent_demo").slice(-8).reverse(),
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
