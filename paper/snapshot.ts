import type { AgentId, UserId } from "@/domain/ids";
import type { PaperAccountState, PaperTrade, Position } from "@/domain/models";
import type { PositionMeta } from "@/paper/positions";
import { completedPaperFills, restorePaperFills } from "@/paper/idempotency";
import { readPaperBook, replacePaperBook } from "@/paper/store";

export const PAPER_SNAPSHOT_VERSION = 1;

export interface PaperBookSnapshot {
  schemaVersion: typeof PAPER_SNAPSHOT_VERSION;
  userId: string;
  agentId: string;
  account: {
    accountId: string;
    cash: string;
    realizedPnl: string;
    sessionStartEquity: string;
    positions: readonly {
      id: string;
      accountId: string;
      userId: string;
      assetSymbol: string;
      quantity: string;
      entryPrice: string;
      currentPrice: string;
      strategyId: string | null;
    }[];
    trades: readonly {
      id: string;
      accountId: string;
      userId: string;
      agentId: string;
      assetSymbol: string;
      side: PaperTrade["side"];
      quantity: string;
      price: string;
      fee: string;
      realizedPnl: string;
      strategyId: string | null;
      at: string;
    }[];
  };
  metas: readonly { ticker: string; meta: PositionMeta }[];
  intentStamps: readonly { key: string; atMs: number }[];
  completedIntents: readonly { intentId: string; executionId: string }[];
  loopState: string;
}

export function exportPaperBook(userId: UserId, agentId: AgentId): PaperBookSnapshot | null {
  const book = readPaperBook(userId, agentId);
  if (!book) {
    return null;
  }
  return {
    schemaVersion: PAPER_SNAPSHOT_VERSION,
    userId,
    agentId,
    account: {
      accountId: book.account.accountId,
      cash: book.account.cash.toString(),
      realizedPnl: book.account.realizedPnl.toString(),
      sessionStartEquity: book.account.sessionStartEquity.toString(),
      positions: book.account.positions.map(positionToJson),
      trades: book.account.trades.map((trade) => ({
        id: trade.id,
        accountId: trade.accountId,
        userId: trade.userId,
        agentId: trade.agentId,
        assetSymbol: trade.assetSymbol,
        side: trade.side,
        quantity: trade.quantity.toString(),
        price: trade.price.toString(),
        fee: trade.fee.toString(),
        realizedPnl: trade.realizedPnl.toString(),
        strategyId: trade.strategyId,
        at: trade.at,
      })),
    },
    metas: [...book.metas.entries()].map(([ticker, meta]) => ({ ticker, meta })),
    intentStamps: [...book.lastIntentAt.entries()].map(([key, atMs]) => ({ key, atMs })),
    completedIntents: completedPaperFills(),
    loopState: book.loopState,
  };
}

export function importPaperBook(snapshot: PaperBookSnapshot): void {
  if (snapshot.schemaVersion !== PAPER_SNAPSHOT_VERSION) {
    throw new Error("STATE_INVALID");
  }
  if (snapshot.userId.length === 0 || snapshot.agentId.length === 0) {
    throw new Error("STATE_INVALID");
  }
  const account: PaperAccountState = {
    accountId: snapshot.account.accountId as PaperAccountState["accountId"],
    userId: snapshot.userId as UserId,
    agentId: snapshot.agentId as AgentId,
    cash: BigInt(snapshot.account.cash),
    realizedPnl: BigInt(snapshot.account.realizedPnl),
    sessionStartEquity: BigInt(snapshot.account.sessionStartEquity),
    positions: snapshot.account.positions.map(positionFromJson),
    trades: snapshot.account.trades.map((trade) => ({
      ...trade,
      accountId: trade.accountId as PaperTrade["accountId"],
      userId: trade.userId as UserId,
      agentId: trade.agentId as AgentId,
      quantity: BigInt(trade.quantity),
      price: BigInt(trade.price),
      fee: BigInt(trade.fee),
      realizedPnl: BigInt(trade.realizedPnl),
      status: "paper_filled" as const,
      venue: "paper" as const,
      fidelity: "paper" as const,
    })),
  };
  const metas = new Map<string, PositionMeta>();
  for (const row of snapshot.metas) {
    if (row.ticker.length === 0 || row.meta.assetId.length === 0) {
      throw new Error("STATE_INVALID");
    }
    metas.set(row.ticker, row.meta);
  }
  replacePaperBook(snapshot.userId as UserId, snapshot.agentId as AgentId, {
    account,
    metas,
    records: [],
    events: [],
    lastIntentAt: new Map(snapshot.intentStamps.map((stamp) => [stamp.key, stamp.atMs])),
    loopState: snapshot.loopState as "WAITING_FOR_RISK",
  });
  restorePaperFills(snapshot.completedIntents);
}

function positionToJson(position: Position): PaperBookSnapshot["account"]["positions"][number] {
  return {
    id: position.id,
    accountId: position.accountId,
    userId: position.userId,
    assetSymbol: position.assetSymbol,
    quantity: position.quantity.toString(),
    entryPrice: position.entryPrice.toString(),
    currentPrice: position.currentPrice.toString(),
    strategyId: position.strategyId,
  };
}

function positionFromJson(position: PaperBookSnapshot["account"]["positions"][number]): Position {
  return {
    id: position.id,
    accountId: position.accountId as Position["accountId"],
    userId: position.userId as UserId,
    assetSymbol: position.assetSymbol,
    quantity: BigInt(position.quantity),
    entryPrice: BigInt(position.entryPrice),
    currentPrice: BigInt(position.currentPrice),
    strategyId: position.strategyId,
  };
}
