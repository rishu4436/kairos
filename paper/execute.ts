import { admitPaperCapability, type ExecutionAuthorityErrorCode, type PaperExecutionCapability } from "@/domain/execution-authority";
import type { Scaled } from "@/domain/money";
import type { AgentTradeIntent } from "@/paper/intent";
import type { PaperExecutionPolicy } from "@/paper/policy";
import type { StructuredRiskDecision } from "@/paper/risk-gate";
import { previewPaperExecution, type PaperMarketSnapshot, type PaperSimulation } from "@/paper/simulate";
import { formatDecimal, parseDecimal } from "@/domain/money";
import { emptyDcaState } from "@/strategies/dca-math";
import { readDcaState, writeDcaState } from "@/strategies/dca-state";

export const PAPER_EXECUTION_STATUSES = ["FILLED", "PARTIALLY_FILLED", "REJECTED", "EXPIRED"] as const;
export type PaperExecutionStatus = (typeof PAPER_EXECUTION_STATUSES)[number];

export interface PaperExecution {
  executionId: string;
  intentId: string;
  assetId: string;
  side: "BUY" | "SELL";
  requestedQuantity: Scaled;
  filledQuantity: Scaled;
  executionPrice: Scaled;
  referencePrice: Scaled | null;
  slippageBps: number;
  fee: Scaled;
  notional: Scaled;
  timestamp: string;
  status: PaperExecutionStatus;
  strategyId: string;
  /** This executor never broadcasts. */
  broadcast: false;
  chainTransactionId: null;
  signature: null;
}

export interface PaperExecutionOutcome {
  execution: PaperExecution;
  simulation: PaperSimulation;
  /** Set only by the disconnected live gateway. */
  disconnected?: boolean;
  authorityCode?: ExecutionAuthorityErrorCode;
}

/**
 * Accepts only a risk-approved intent in READY_FOR_PAPER.
 * Partial fills are part of the status union and are not produced here.
 * This module does not import a wallet, a chain client, or a signer.
 */
export function executePaper(input: {
  intent: AgentTradeIntent;
  risk: StructuredRiskDecision;
  snapshot: PaperMarketSnapshot;
  policy: PaperExecutionPolicy;
  nowMs: number;
  cash: Scaled;
  heldQuantity: Scaled;
  authority: PaperExecutionCapability;
}): PaperExecutionOutcome {
  const simulation = previewPaperExecution(input);
  const timestamp = new Date(input.nowMs).toISOString();
  const reject = (
    status: "REJECTED" | "EXPIRED",
    simulationResult: PaperSimulation,
    authorityCode?: ExecutionAuthorityErrorCode,
  ): PaperExecutionOutcome => ({
    simulation: simulationResult,
    authorityCode,
    execution: {
      executionId: `exec_${input.intent.intentId}`,
      intentId: input.intent.intentId,
      assetId: input.intent.assetId,
      side: input.intent.action,
      requestedQuantity: input.intent.requestedQuantity,
      filledQuantity: 0n,
      executionPrice: input.snapshot.observedPrice > 0n ? input.snapshot.observedPrice : 0n,
      referencePrice: input.intent.referencePrice,
      slippageBps: simulationResult.expectedSlippageBps,
      fee: 0n,
      notional: 0n,
      timestamp,
      status,
      strategyId: input.intent.strategyId,
      broadcast: false,
      chainTransactionId: null,
      signature: null,
    },
  });

  const admitted = admitPaperCapability(input.authority, {
    userId: input.intent.userId,
    agentId: input.intent.agentId,
    nowMs: input.nowMs,
  });
  if (!admitted.ok) {
    return reject("REJECTED", fail(simulation, admitted.code), admitted.code);
  }
  if (input.intent.status !== "READY_FOR_PAPER") {
    return reject("REJECTED", fail(simulation, "Paper execution requires READY_FOR_PAPER."));
  }
  if (!input.risk.allowed || input.risk.intentId !== input.intent.intentId) {
    return reject("REJECTED", fail(simulation, "Paper execution requires a passing risk decision for this intent."));
  }
  if (input.intent.userId !== input.snapshot.userId) {
    return reject("REJECTED", fail(simulation, "The user on the intent does not match the observation."));
  }
  if (input.intent.requestedQuantity <= 0n) {
    return reject("REJECTED", fail(simulation, "Quantity must be positive."));
  }
  if (!input.snapshot.supported) {
    return reject("REJECTED", fail(simulation, "The asset is not supported."));
  }
  if (!Number.isFinite(Date.parse(input.intent.expiresAt)) || input.nowMs >= Date.parse(input.intent.expiresAt)) {
    return reject("EXPIRED", fail(simulation, "The trade intent is expired."));
  }
  if (simulation.status !== "PASS") {
    return reject("REJECTED", simulation);
  }

  if (input.intent.strategyId === "dca" && input.intent.action === "BUY") {
    recordPaperDcaFill(input.intent, simulation.estimatedNotional, input.nowMs);
  }
  return {
    simulation,
    execution: {
      executionId: `exec_${input.intent.intentId}`,
      intentId: input.intent.intentId,
      assetId: input.intent.assetId,
      side: input.intent.action,
      requestedQuantity: input.intent.requestedQuantity,
      filledQuantity: input.intent.requestedQuantity,
      executionPrice: simulation.estimatedPrice,
      referencePrice: input.intent.referencePrice,
      slippageBps: simulation.expectedSlippageBps,
      fee: simulation.estimatedFee,
      notional: simulation.estimatedNotional,
      timestamp,
      status: "FILLED",
      strategyId: input.intent.strategyId,
      broadcast: false,
      chainTransactionId: null,
      signature: null,
    },
  };
}

function recordPaperDcaFill(intent: AgentTradeIntent, notional: Scaled, nowMs: number): void {
  const current = readDcaState(intent.userId, intent.agentId, intent.assetId) ?? emptyDcaState(intent.assetId, intent.ticker, "DIP_BASED", "LAST_DCA_FILL");
  const spent = parseDecimal(current.budgetSpent) + notional;
  writeDcaState(intent.userId, intent.agentId, {
    ...current,
    initialReference: current.initialReference ?? formatDecimal(intent.observedPrice, 6),
    lastFillPrice: formatDecimal(intent.observedPrice, 6),
    lastFillAtMs: nowMs,
    tranchesCompleted: current.tranchesCompleted + 1,
    budgetSpent: formatDecimal(spent, 6),
    status: "ACTIVE",
  });
}

function fail(simulation: PaperSimulation, reason: string): PaperSimulation {
  return {
    ...simulation,
    status: "FAIL",
    reasons: simulation.reasons.includes(reason) ? simulation.reasons : [...simulation.reasons, reason],
  };
}
