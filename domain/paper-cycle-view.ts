import type { AgentRuntimeState } from "@/domain/models";

/** Serializable read model for the paper cycle. No scaled integers cross into the client. */

export interface PaperCycleStage {
  id: string;
  title: string;
  body: string;
}

export interface PaperCycleStep {
  label: string;
  state: "done" | "failed" | "skipped";
  detail: string;
}

export interface PaperCycleAsset {
  assetId: string;
  ticker: string;
  headline: string;
  steps: PaperCycleStep[];
}

export interface PaperMissionView {
  correlationId: string;
  executionContextId: string;
  time: string;
  stamp: string;
  asset: string;
  strategy: string;
  action: "BUY" | "SELL";
  target: string;
  risk: "PASS" | "FAIL";
  simulation: "PASS" | "FAIL" | "NOT_RUN";
  fill: "FILLED" | "REJECTED" | "EXPIRED" | "NONE";
  pnl: string;
  status: string;
  expectedPrice: string;
  slippage: string;
  fee: string;
  totalCost: string;
  stages: PaperCycleStage[];
}

export interface PaperPositionView {
  asset: string;
  assetId: string;
  tokenizedRepresentationId: string;
  quantity: string;
  entry: string;
  current: string;
  unrealizedPnl: string;
  realizedPnl: string;
  strategy: string;
  opened: string;
  agentStatus: "MONITORING_POSITION";
  originatingStrategyId: string;
  arbitrationDecisionId: string;
  intentId: string;
  executionId: string;
  correlationId: string;
  lifecycle: string;
  strategyVersion: string;
  entryContextId: string;
  thesisState: string;
  lastDecision: string;
  addCount: string;
  reduceCount: string;
  regime: string;
  session: string;
  exitClass: string;
  why: string;
  side: "LONG";
}

export interface PaperCycleView {
  mode: "paper";
  /** Explicit execution context for this book. Live cycles do not produce this view. */
  executionMode: "PAPER";
  /** Agent loop after this paper pass. Chain EXECUTING is not a paper result. */
  loopState: AgentRuntimeState;
  badge: "PAPER MODE";
  funds: "NO REAL FUNDS";
  headline: "PAPER AUTONOMOUS";
  notice: "This is simulated execution and does not broadcast blockchain transactions.";
  broadcast: false;
  policyVersion: string;
  sizingPolicy: string;
  generatedAt: string;
  cash: string;
  equity: string;
  invested: string;
  realizedPnl: string;
  unrealizedPnl: string;
  mission: PaperMissionView | null;
  assets: PaperCycleAsset[];
  positions: PaperPositionView[];
  history: PaperMissionView[];
}
