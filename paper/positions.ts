import type { EntryContextSnapshot, PositionCycleSnapshot, PositionState } from "@/context/types";
import type { ExitClass, PositionAction, PositionThesisState } from "@/position/types";
import type { AgentId, UserId } from "@/domain/ids";
import type { PaperAccountState, Position } from "@/domain/models";
import type { Scaled } from "@/domain/money";
import { applyPaperFill, markPositions, summarizePortfolio, valuePosition, type PaperFill } from "@/domain/portfolio";
import type { PaperExecution } from "@/paper/execute";
import type { AgentTradeIntent } from "@/paper/intent";

/** Identity of the decision that opened the position. Monitoring does not replace it. */
export interface PositionOrigin {
  strategyId: string;
  arbitrationDecisionId: string;
  intentId: string;
  executionId: string;
  correlationId: string;
}

export interface PositionMeta extends PositionOrigin {
  assetId: string;
  tokenizedRepresentationId: string;
  openedAt: string;
  updatedAt: string;
  strategyVersion: string | null;
  /** Explicit lifecycle. Quantity still comes from the ledger. */
  lifecycle: PositionState;
  addCount: number;
  lastAddAt: string | null;
  reduceCount: number;
  lastReduceAt: string | null;
  lastDecision: PositionAction | null;
  lastDecisionAt: string | null;
  thesisState: PositionThesisState | null;
  entryContextId: string | null;
  highestMark: string | null;
  previousSnapshot: PositionCycleSnapshot | null;
  alternateStrategyId: string | null;
  exitClass: ExitClass | null;
  lastReasonCodes: readonly string[];
  appliedReductions: readonly string[];
  entry: EntryContextSnapshot | null;
}

/** User-scoped position read model. Quantity and prices stay on the ledger position. */
export interface MonitoredPosition {
  userId: UserId;
  agentId: AgentId;
  assetId: string;
  tokenizedRepresentationId: string;
  ticker: string;
  quantity: Scaled;
  averageEntryPrice: Scaled;
  /** Ledger mark. Monitoring does not write this. */
  currentPrice: Scaled;
  /** Read-only observation mark used for display. Null when no fresh observation was supplied. */
  observedMark: Scaled | null;
  unrealizedPnl: Scaled;
  realizedPnl: Scaled;
  openedAt: string;
  updatedAt: string;
  strategyAttribution: string | null;
  originatingStrategyId: string;
  arbitrationDecisionId: string;
  intentId: string;
  executionId: string;
  correlationId: string;
  /** Present only while the position is open. Monitoring does not change quantity. */
  agentStatus: "MONITORING_POSITION";
  lifecycle: PositionState | "OPEN";
  strategyVersion: string | null;
  entryContextId: string | null;
  thesisState: string | null;
  lastDecision: string | null;
  addCount: number;
  reduceCount: number;
  regime: string | null;
  session: string | null;
  exitClass: ExitClass | null;
  reasonCodes: readonly string[];
}

export function executionToFill(execution: PaperExecution, intent: AgentTradeIntent): PaperFill | null {
  if (execution.status !== "FILLED" || execution.broadcast !== false || execution.chainTransactionId !== null) {
    return null;
  }
  return {
    id: execution.executionId,
    userId: intent.userId,
    agentId: intent.agentId,
    assetSymbol: intent.ticker,
    side: execution.side === "BUY" ? "buy" : "sell",
    quantity: execution.filledQuantity,
    price: execution.executionPrice,
    fee: execution.fee,
    strategyId: execution.strategyId,
    at: execution.timestamp,
  };
}

export function commitPaperExecution(
  state: PaperAccountState,
  execution: PaperExecution,
  intent: AgentTradeIntent,
): { ok: true; state: PaperAccountState } | { ok: false; reason: string } {
  const fill = executionToFill(execution, intent);
  if (!fill) {
    return { ok: false, reason: "Only a paper fill can update the ledger." };
  }
  return applyPaperFill(state, fill);
}

/**
 * Read-only mark. Returns views and does not write the account.
 * Unrealized PnL uses the observed mark when one is supplied, otherwise the ledger price.
 */
export function monitorPositions(
  state: PaperAccountState,
  metas: ReadonlyMap<string, PositionMeta>,
  marks: Readonly<Record<string, Scaled>> = {},
): MonitoredPosition[] {
  const marked = markPositions(state, marks);
  return marked.positions.map((position) => toMonitored(state, position, metas.get(position.assetSymbol), marks[position.assetSymbol] ?? null));
}

function toMonitored(
  state: PaperAccountState,
  position: Position,
  meta: PositionMeta | undefined,
  observedMark: Scaled | null,
): MonitoredPosition {
  const valued = valuePosition(position);
  const realizedPnl = state.trades
    .filter((trade) => trade.assetSymbol === position.assetSymbol)
    .reduce((sum, trade) => sum + trade.realizedPnl, 0n);
  return {
    userId: position.userId,
    agentId: state.agentId,
    assetId: meta?.assetId ?? position.assetSymbol,
    tokenizedRepresentationId: meta?.tokenizedRepresentationId ?? position.assetSymbol,
    ticker: position.assetSymbol,
    quantity: position.quantity,
    averageEntryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    observedMark,
    unrealizedPnl: valued.unrealizedPnl,
    realizedPnl,
    openedAt: meta?.openedAt ?? state.trades.find((trade) => trade.assetSymbol === position.assetSymbol)?.at ?? "",
    updatedAt: meta?.updatedAt ?? "",
    strategyAttribution: position.strategyId,
    originatingStrategyId: meta?.strategyId ?? position.strategyId ?? "",
    arbitrationDecisionId: meta?.arbitrationDecisionId ?? "",
    intentId: meta?.intentId ?? "",
    executionId: meta?.executionId ?? "",
    correlationId: meta?.correlationId ?? "",
    agentStatus: "MONITORING_POSITION",
    lifecycle: meta?.lifecycle ?? "OPEN",
    strategyVersion: meta?.strategyVersion ?? null,
    entryContextId: meta?.entryContextId ?? meta?.entry?.entryContextId ?? null,
    thesisState: meta?.thesisState ?? null,
    lastDecision: meta?.lastDecision ?? null,
    addCount: meta?.addCount ?? 0,
    reduceCount: meta?.reduceCount ?? 0,
    regime: meta?.previousSnapshot?.regime ?? meta?.entry?.entryRegime ?? null,
    session: meta?.previousSnapshot?.session ?? meta?.entry?.entrySession ?? null,
    exitClass: meta?.exitClass ?? null,
    reasonCodes: meta?.lastReasonCodes ?? [],
  };
}

export function portfolioEquity(state: PaperAccountState): Scaled {
  return summarizePortfolio(state).equity;
}
