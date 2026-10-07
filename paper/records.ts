import type { ArbitrationDecision } from "@/domain/arbitration";
import type { Scaled } from "@/domain/money";
import type { PaperExecution } from "@/paper/execute";
import type { AgentTradeIntent } from "@/paper/intent";
import type { MonitoredPosition } from "@/paper/positions";
import type { StructuredRiskDecision } from "@/paper/risk-gate";
import type { PaperSimulation } from "@/paper/simulate";

/** One audited paper decision. The portfolio mutation is not the only record. */
export interface ExecutionRecord {
  correlationId: string;
  /** Audit id of the trusted context. This is not a credential. */
  executionContextId: string;
  userId: string;
  agentId: string;
  assetId: string;
  ticker: string;
  strategyId: string;
  strategyName: string;
  arbitration: ArbitrationDecision;
  intent: AgentTradeIntent;
  risk: StructuredRiskDecision;
  simulation: PaperSimulation | null;
  execution: PaperExecution | null;
  position: MonitoredPosition | null;
  /** Unrealized mark for an open result, or realized PnL when the fill closes quantity. */
  bookedPnl: Scaled | null;
  createdAt: string;
}
