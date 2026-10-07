import type { ArbitrationDecision } from "@/domain/arbitration";
import type { AccountId, AgentId, UserId } from "@/domain/ids";
import type { RiskPolicy, TradeIntent, TradeSide } from "@/domain/models";
import { divRound, type Scaled } from "@/domain/money";
import type { SignalAction } from "@/domain/signal";
import type { PositionIntentKind } from "@/position/types";
import type { PaperExecutionPolicy } from "@/paper/policy";

export const INTENT_STATUSES = [
  "PROPOSED",
  "RISK_PENDING",
  "RISK_REJECTED",
  "SIMULATION_PENDING",
  "SIMULATION_REJECTED",
  "READY_FOR_PAPER",
  "PAPER_EXECUTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const EXECUTABLE_ACTIONS = ["BUY", "SELL"] as const;
export type ExecutableAction = (typeof EXECUTABLE_ACTIONS)[number];

const BLOCKED_ACTIONS = ["HOLD", "NO_SIGNAL", "NO_OPPORTUNITY", "CONFLICT"] as const;

/**
 * Lifecycle intent for the paper loop.
 * The risk engine still receives domain `TradeIntent` through `toRiskIntent`.
 * Creating this object does not approve or execute anything.
 */
export interface AgentTradeIntent {
  intentId: string;
  userId: UserId;
  agentId: AgentId;
  accountId: AccountId;
  assetId: string;
  ticker: string;
  strategyId: string;
  action: ExecutableAction;
  requestedQuantity: Scaled;
  requestedNotional: Scaled;
  referencePrice: Scaled | null;
  observedPrice: Scaled;
  priceTimestamp: string;
  createdAt: string;
  expiresAt: string;
  maxSlippageBps: number;
  reason: string;
  arbitrationDecisionId: string;
  correlationId: string;
  status: IntentStatus;
  /** Paper loop intents are paper. Live venue is not representable here. */
  venue: "paper";
  /** Position action carried with the existing paper intent. This is not a second execution engine. */
  position: PositionTradeIntent;
}

export interface PositionTradeIntent {
  kind: PositionIntentKind;
  userId: string;
  agentId: string;
  assetId: string;
  strategyId: string;
  strategyVersion: string;
  positionId: string | null;
  decisionId: string;
  cycleId: string;
  correlationId: string;
}

export type IntentFactoryResult =
  | { ok: true; intent: AgentTradeIntent }
  | {
      ok: false;
      reason:
        | "ACTION_NOT_EXECUTABLE"
        | "INVALID_QUANTITY"
        | "USER_MISMATCH"
        | "AGENT_MISMATCH"
        | "ASSET_MISMATCH"
        | "INVALID_PRICE";
    };

export function isExecutableAction(action: SignalAction | string | null | undefined): action is ExecutableAction {
  return action === "BUY" || action === "SELL";
}

export function createTradeIntent(input: {
  userId: UserId;
  agentId: AgentId;
  accountId: AccountId;
  decision: ArbitrationDecision;
  observation: {
    assetId: string;
    ticker: string;
    userId: string;
    observedPrice: Scaled;
    referencePrice: Scaled | null;
    priceTimestamp: string;
  };
  riskPolicy: RiskPolicy;
  quantity: Scaled;
  notional: Scaled;
  paperPolicy: PaperExecutionPolicy;
  nowMs: number;
  correlationId: string;
  cycleId?: string;
  strategyVersion?: string;
  positionId?: string | null;
}): IntentFactoryResult {
  const action = input.decision.selectedAction;
  if (
    !isExecutableAction(action) ||
    (BLOCKED_ACTIONS as readonly string[]).includes(action) ||
    (input.decision.decision !== "SELECT_STRATEGY" && input.decision.decision !== "MULTI_STRATEGY_CONFIRMATION")
  ) {
    return { ok: false, reason: "ACTION_NOT_EXECUTABLE" };
  }
  if (input.userId !== input.riskPolicy.userId || input.userId !== input.observation.userId || input.decision.asset.userId !== input.userId) {
    return { ok: false, reason: "USER_MISMATCH" };
  }
  if (input.agentId !== input.riskPolicy.agentId) {
    return { ok: false, reason: "AGENT_MISMATCH" };
  }
  if (input.decision.asset.id !== input.observation.assetId || input.decision.asset.ticker !== input.observation.ticker) {
    return { ok: false, reason: "ASSET_MISMATCH" };
  }
  if (input.observation.observedPrice <= 0n) {
    return { ok: false, reason: "INVALID_PRICE" };
  }
  if (input.quantity <= 0n || input.notional <= 0n) {
    return { ok: false, reason: "INVALID_QUANTITY" };
  }
  if (!input.decision.selectedStrategy) {
    return { ok: false, reason: "ACTION_NOT_EXECUTABLE" };
  }

  const createdAt = new Date(input.nowMs).toISOString();
  const intent: AgentTradeIntent = {
    intentId: `intent_${input.userId}_${input.observation.assetId}_${input.decision.selectedStrategy}_${action}_${createdAt}`,
    userId: input.userId,
    agentId: input.agentId,
    accountId: input.accountId,
    assetId: input.observation.assetId,
    ticker: input.observation.ticker,
    strategyId: input.decision.selectedStrategy,
    action,
    requestedQuantity: input.quantity,
    requestedNotional: input.notional,
    referencePrice: input.observation.referencePrice,
    observedPrice: input.observation.observedPrice,
    priceTimestamp: input.observation.priceTimestamp,
    createdAt,
    expiresAt: new Date(input.nowMs + input.paperPolicy.intentTtlMs).toISOString(),
    maxSlippageBps: input.riskPolicy.maxSlippageBps,
    reason: input.decision.evidence.summary,
    arbitrationDecisionId: `${input.decision.asset.id}:${input.decision.timestamp}:${input.decision.decision}`,
    correlationId: input.correlationId,
    status: "RISK_PENDING",
    venue: "paper",
    position: {
      kind: action === "BUY" ? "OPEN" : "EXIT",
      userId: input.userId,
      agentId: input.agentId,
      assetId: input.observation.assetId,
      strategyId: input.decision.selectedStrategy,
      strategyVersion: input.strategyVersion ?? "1",
      positionId: input.positionId ?? null,
      decisionId: `${input.decision.asset.id}:${input.decision.timestamp}:${input.decision.decision}`,
      cycleId: input.cycleId ?? input.decision.timestamp,
      correlationId: input.correlationId,
    },
  };
  return { ok: true, intent };
}

/**
 * Paper intent for a position decision.
 * The decision stays non-executable. This object is created only by the paper cycle.
 * It does not require a fresh BUY or SELL arbitration.
 */
export function createManagementIntent(input: {
  userId: UserId;
  agentId: AgentId;
  accountId: AccountId;
  action: ExecutableAction;
  strategyId: string;
  assetId: string;
  ticker: string;
  observedPrice: Scaled;
  referencePrice: Scaled | null;
  priceTimestamp: string;
  riskPolicy: RiskPolicy;
  quantity: Scaled;
  notional: Scaled;
  paperPolicy: PaperExecutionPolicy;
  nowMs: number;
  correlationId: string;
  decisionId: string;
  reason: string;
  kind: Exclude<PositionIntentKind, "OPEN">;
  strategyVersion: string;
  positionId: string | null;
  cycleId: string;
}): IntentFactoryResult {
  if (input.userId !== input.riskPolicy.userId) {
    return { ok: false, reason: "USER_MISMATCH" };
  }
  if (input.agentId !== input.riskPolicy.agentId) {
    return { ok: false, reason: "AGENT_MISMATCH" };
  }
  if (input.observedPrice <= 0n) {
    return { ok: false, reason: "INVALID_PRICE" };
  }
  if (input.quantity <= 0n || input.notional <= 0n || input.strategyId.trim().length === 0) {
    return { ok: false, reason: "INVALID_QUANTITY" };
  }
  const createdAt = new Date(input.nowMs).toISOString();
  const intent: AgentTradeIntent = {
    intentId: `intent_${input.userId}_${input.assetId}_pos_${input.action}_${createdAt}`,
    userId: input.userId,
    agentId: input.agentId,
    accountId: input.accountId,
    assetId: input.assetId,
    ticker: input.ticker,
    strategyId: input.strategyId,
    action: input.action,
    requestedQuantity: input.quantity,
    requestedNotional: input.notional,
    referencePrice: input.referencePrice,
    observedPrice: input.observedPrice,
    priceTimestamp: input.priceTimestamp,
    createdAt,
    expiresAt: new Date(input.nowMs + input.paperPolicy.intentTtlMs).toISOString(),
    maxSlippageBps: input.riskPolicy.maxSlippageBps,
    reason: input.reason,
    arbitrationDecisionId: input.decisionId,
    correlationId: input.correlationId,
    status: "RISK_PENDING",
    venue: "paper",
    position: {
      kind: input.kind,
      userId: input.userId,
      agentId: input.agentId,
      assetId: input.assetId,
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      positionId: input.positionId,
      decisionId: input.decisionId,
      cycleId: input.cycleId,
      correlationId: input.correlationId,
    },
  };
  return { ok: true, intent };
}

/** Map a lifecycle intent into the existing risk-engine intent. Limit price is the worst acceptable price. */
export function toRiskIntent(intent: AgentTradeIntent): TradeIntent {
  const side: TradeSide = intent.action === "BUY" ? "buy" : "sell";
  return {
    id: intent.intentId,
    userId: intent.userId,
    agentId: intent.agentId,
    accountId: intent.accountId,
    assetSymbol: intent.ticker,
    side,
    quantity: intent.requestedQuantity,
    limitPrice: worstPrice(intent),
    slippageBps: intent.maxSlippageBps,
    strategyId: intent.strategyId,
    venue: "paper",
    confidence: 0,
    asOf: intent.createdAt,
  };
}

function worstPrice(intent: AgentTradeIntent): Scaled {
  const bps = BigInt(Math.max(0, Math.trunc(intent.maxSlippageBps)));
  if (intent.action === "BUY") {
    return divRound(intent.observedPrice * (10_000n + bps), 10_000n);
  }
  const next = divRound(intent.observedPrice * (10_000n - bps), 10_000n);
  return next > 0n ? next : intent.observedPrice;
}
