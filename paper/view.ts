import type { PaperCycleAsset, PaperCycleStep, PaperCycleView, PaperMissionView, PaperPositionView } from "@/domain/paper-cycle-view";
import type { AgentRuntimeState, PaperAccountState } from "@/domain/models";
import type { Scaled } from "@/domain/money";
import { markPositions, summarizePortfolio } from "@/domain/portfolio";
import { explainExitClass, explainReasons } from "@/position/explain";
import { formatPrice, formatQuantity, formatSignedUsdt, formatStamp, formatUsdt } from "@/lib/format";
import { SIZING_POLICY_VERSION, MAX_ALLOCATION_PERCENT } from "@/paper/sizing";
import { monitorPositions, type PositionMeta } from "@/paper/positions";
import type { ExecutionRecord } from "@/paper/records";

export interface AssetOutcome {
  assetId: string;
  ticker: string;
  headline: string;
  steps: PaperCycleStep[];
}

export function buildPaperCycleView(input: {
  account: PaperAccountState;
  metas: ReadonlyMap<string, PositionMeta>;
  records: readonly ExecutionRecord[];
  outcomes: readonly AssetOutcome[];
  marks: Readonly<Record<string, Scaled>>;
  generatedAt: string;
  policyVersion: string;
  loopState: AgentRuntimeState;
}): PaperCycleView {
  const summary = summarizePortfolio(markPositions(input.account, input.marks));
  const positions = monitorPositions(input.account, input.metas, input.marks).map(toPositionView);
  const history = [...input.records].reverse().map(toMission);
  return {
    mode: "paper",
    executionMode: "PAPER",
    loopState: input.loopState,
    badge: "PAPER MODE",
    funds: "NO REAL FUNDS",
    headline: "PAPER AUTONOMOUS",
    notice: "This is simulated execution and does not broadcast blockchain transactions.",
    broadcast: false,
    policyVersion: input.policyVersion,
    sizingPolicy: `${SIZING_POLICY_VERSION} · ${MAX_ALLOCATION_PERCENT}% of available cash`,
    generatedAt: input.generatedAt,
    cash: formatUsdt(summary.cash),
    equity: formatUsdt(summary.equity),
    invested: formatUsdt(summary.invested),
    realizedPnl: formatSignedUsdt(summary.realizedPnl),
    unrealizedPnl: formatSignedUsdt(summary.unrealizedPnl),
    mission: history[0] ?? null,
    assets: input.outcomes.map(toAsset),
    positions,
    history,
  };
}

function toAsset(outcome: AssetOutcome): PaperCycleAsset {
  return {
    assetId: outcome.assetId,
    ticker: outcome.ticker,
    headline: outcome.headline,
    steps: outcome.steps,
  };
}

function toPositionView(position: ReturnType<typeof monitorPositions>[number]): PaperPositionView {
  return {
    asset: position.ticker,
    assetId: position.assetId,
    tokenizedRepresentationId: position.tokenizedRepresentationId,
    quantity: formatQuantity(position.quantity),
    entry: formatPrice(position.averageEntryPrice),
    current: formatPrice(position.observedMark ?? position.currentPrice),
    unrealizedPnl: formatSignedUsdt(position.unrealizedPnl),
    realizedPnl: formatSignedUsdt(position.realizedPnl),
    strategy: position.originatingStrategyId || position.strategyAttribution || "Unattributed",
    opened: position.openedAt ? formatStamp(position.openedAt) : "—",
    agentStatus: "MONITORING_POSITION",
    originatingStrategyId: position.originatingStrategyId,
    arbitrationDecisionId: position.arbitrationDecisionId,
    intentId: position.intentId,
    executionId: position.executionId,
    correlationId: position.correlationId,
    lifecycle: position.lifecycle,
    strategyVersion: position.strategyVersion ?? "—",
    entryContextId: position.entryContextId ?? "—",
    thesisState: position.thesisState ?? "—",
    lastDecision: position.lastDecision ?? "—",
    addCount: String(position.addCount),
    reduceCount: String(position.reduceCount),
    regime: position.regime ?? "—",
    session: position.session ?? "—",
    exitClass: explainExitClass(position.exitClass) ?? "—",
    why: explainReasons(position.reasonCodes).join(" "),
    side: "LONG",
  };
}

function toMission(record: ExecutionRecord): PaperMissionView {
  const simulation = record.simulation;
  const execution = record.execution;
  const risk = record.risk.allowed ? "PASS" : "FAIL";
  const simulationLabel = simulation === null ? "NOT_RUN" : simulation.status === "PASS" ? "PASS" : "FAIL";
  const fill = execution === null ? "NONE" : execution.status === "FILLED" ? "FILLED" : execution.status === "EXPIRED" ? "EXPIRED" : "REJECTED";
  return {
    correlationId: record.correlationId,
    executionContextId: record.executionContextId,
    time: record.createdAt,
    stamp: formatStamp(record.createdAt),
    asset: record.ticker,
    strategy: record.strategyName,
    action: record.intent.action,
    target: formatUsdt(record.intent.requestedNotional),
    risk,
    simulation: simulationLabel,
    fill,
    pnl: record.bookedPnl === null ? "—" : formatSignedUsdt(record.bookedPnl),
    status: missionStatus(record),
    expectedPrice: simulation ? formatPrice(simulation.estimatedPrice) : "—",
    slippage: simulation ? `${(simulation.expectedSlippageBps / 100).toFixed(2)}%` : "—",
    fee: simulation ? formatUsdt(simulation.estimatedFee) : "—",
    totalCost: simulation ? formatUsdt(simulation.estimatedTotalCost) : "—",
    stages: stages(record),
  };
}

function missionStatus(record: ExecutionRecord): string {
  if (record.intent.status === "PAPER_EXECUTED" && record.execution?.status === "FILLED") {
    return "PAPER FILLED";
  }
  if (record.intent.status === "RISK_REJECTED") {
    return "RISK REJECTED";
  }
  if (record.intent.status === "SIMULATION_REJECTED") {
    return "SIMULATION FAILED";
  }
  if (record.intent.status === "EXPIRED" || record.execution?.status === "EXPIRED") {
    return "EXPIRED";
  }
  if (record.intent.status === "CANCELLED") {
    return "CANCELLED";
  }
  return record.intent.status;
}

function stages(record: ExecutionRecord): PaperMissionView["stages"] {
  const simulation = record.simulation;
  const simulationBody = simulation
    ? [
        simulation.status === "PASS" ? "PASSED" : "FAILED",
        `Estimated price ${formatPrice(simulation.estimatedPrice)}`,
        `Estimated notional ${formatUsdt(simulation.estimatedNotional)}`,
        `Expected slippage ${(simulation.expectedSlippageBps / 100).toFixed(2)}%`,
        `Estimated fee ${formatUsdt(simulation.estimatedFee)}`,
        `Estimated total ${formatUsdt(simulation.estimatedTotalCost)}`,
        ...simulation.reasons,
      ].join("\n")
    : "NOT RUN";
  const filled = record.execution?.status === "FILLED";
  return [
    { id: "market", title: "Market", body: record.arbitration.marketRegime },
    { id: "strategy", title: "Strategy", body: record.strategyName },
    { id: "signal", title: "Signal", body: record.intent.action },
    { id: "arbitration", title: "Arbitration", body: `${record.arbitration.decision}\n${record.arbitration.evidence.summary}` },
    {
      id: "risk",
      title: "Risk",
      body: record.risk.allowed ? "PASSED" : `FAILED\n${record.risk.reasonCodes.join(", ")}\n${record.risk.violations.map((item) => item.message).join("\n")}`,
    },
    { id: "simulation", title: "Simulation", body: simulationBody },
    {
      id: "execution",
      title: "Execution",
      body: filled ? "Paper fill\nNo blockchain transaction was broadcast." : "Not filled\nNo blockchain transaction was broadcast.",
    },
  ];
}
