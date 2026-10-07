import type { AgentId, UserId } from "@/domain/ids";
import type { ArbitrationDecision } from "@/domain/arbitration";
import type { PaperExecution } from "@/paper/execute";
import type { AgentTradeIntent } from "@/paper/intent";
import type { MonitoredPosition } from "@/paper/positions";
import type { ExecutionRecord } from "@/paper/records";
import type { StructuredRiskDecision } from "@/paper/risk-gate";
import type { PaperSimulation } from "@/paper/simulate";
import { readPaperBook } from "@/paper/store";

export const LIFECYCLE_STAGES = [
  "ARBITRATION",
  "INTENT",
  "RISK",
  "SIMULATION",
  "EXECUTION_CONTEXT",
  "PAPER_EXECUTION",
  "POSITION",
] as const;

export type LifecycleStageName = (typeof LIFECYCLE_STAGES)[number];

export interface LifecycleStage {
  stage: LifecycleStageName;
  present: boolean;
}

/** One correlated paper decision, rebuilt from the stored execution record. */
export interface TradeLifecycle {
  correlationId: string;
  intentId: string;
  userId: string;
  agentId: string;
  executionMode: "PAPER";
  executionContextId: string;
  arbitration: ArbitrationDecision;
  intent: AgentTradeIntent;
  risk: StructuredRiskDecision;
  simulation: PaperSimulation | null;
  execution: PaperExecution | null;
  position: MonitoredPosition | null;
  stages: readonly LifecycleStage[];
}

export function readTradeLifecycle(
  userId: UserId,
  agentId: AgentId,
  key: { correlationId: string } | { intentId: string },
): TradeLifecycle | null {
  const book = readPaperBook(userId, agentId);
  if (!book || book.account.userId !== userId || book.account.agentId !== agentId) {
    return null;
  }
  const record = book.records.find((item) => {
    if (item.userId !== userId || item.agentId !== agentId) {
      return false;
    }
    if ("correlationId" in key) {
      return item.correlationId === key.correlationId;
    }
    return item.intent.intentId === key.intentId;
  });
  if (!record) {
    return null;
  }
  return toLifecycle(record);
}

function toLifecycle(record: ExecutionRecord): TradeLifecycle {
  return {
    correlationId: record.correlationId,
    intentId: record.intent.intentId,
    userId: record.userId,
    agentId: record.agentId,
    executionMode: "PAPER",
    executionContextId: record.executionContextId,
    arbitration: record.arbitration,
    intent: record.intent,
    risk: record.risk,
    simulation: record.simulation,
    execution: record.execution,
    position: record.position,
    stages: [
      { stage: "ARBITRATION", present: true },
      { stage: "INTENT", present: true },
      { stage: "RISK", present: true },
      { stage: "SIMULATION", present: record.simulation !== null },
      { stage: "EXECUTION_CONTEXT", present: record.executionContextId.length > 0 },
      { stage: "PAPER_EXECUTION", present: record.execution !== null },
      { stage: "POSITION", present: record.position !== null },
    ],
  };
}
