import type {
  PaperAccountState,
  PaperTrade,
  Portfolio,
  Position,
  TradeSide,
  ValuedPosition,
} from "@/domain/models";
import type { AgentId, UserId } from "@/domain/ids";
import { add, divRound, mul, SCALE, sub, type Scaled } from "@/domain/money";

export interface PaperFill {
  id: string;
  userId: UserId;
  agentId: AgentId;
  assetSymbol: string;
  side: TradeSide;
  quantity: Scaled;
  price: Scaled;
  fee: Scaled;
  strategyId: string | null;
  at: string;
}

export type PaperFillResult =
  | { ok: true; state: PaperAccountState }
  | { ok: false; reason: string };

export function valuePosition(position: Position): ValuedPosition {
  const marketValue = mul(position.currentPrice, position.quantity);
  const cost = mul(position.entryPrice, position.quantity);
  return {
    ...position,
    marketValue,
    unrealizedPnl: sub(marketValue, cost),
  };
}

export function summarizePortfolio(state: PaperAccountState): Portfolio {
  const positions = state.positions.map(valuePosition);
  const invested = positions.reduce((sum, position) => add(sum, position.marketValue), 0n);
  const unrealizedPnl = positions.reduce((sum, position) => add(sum, position.unrealizedPnl), 0n);
  const equity = add(state.cash, invested);
  return {
    accountId: state.accountId,
    userId: state.userId,
    agentId: state.agentId,
    cash: state.cash,
    invested,
    equity,
    unrealizedPnl,
    realizedPnl: state.realizedPnl,
    totalPnl: add(state.realizedPnl, unrealizedPnl),
    todayPnl: sub(equity, state.sessionStartEquity),
    positions,
  };
}

export function sumRealized(trades: readonly PaperTrade[]): Scaled {
  return trades.reduce((sum, trade) => add(sum, trade.realizedPnl), 0n);
}

/** Absolute value of negative realized results whose timestamp falls on `day` (YYYY-MM-DD). */
export function realizedLossToday(trades: readonly PaperTrade[], day: string): Scaled {
  return trades.reduce((sum, trade) => {
    if (!trade.at.startsWith(day) || trade.realizedPnl >= 0n) {
      return sum;
    }
    return add(sum, -trade.realizedPnl);
  }, 0n);
}

export function realizedByStrategy(
  trades: readonly PaperTrade[],
): { strategyId: string; realizedPnl: Scaled }[] {
  const totals = new Map<string, Scaled>();
  for (const trade of trades) {
    const key = trade.strategyId ?? "unattributed";
    totals.set(key, add(totals.get(key) ?? 0n, trade.realizedPnl));
  }
  return [...totals.entries()].map(([strategyId, realizedPnl]) => ({ strategyId, realizedPnl }));
}

export function markPositions(
  state: PaperAccountState,
  prices: Readonly<Record<string, Scaled>>,
): PaperAccountState {
  return {
    ...state,
    positions: state.positions.map((position) => {
      const next = prices[position.assetSymbol];
      return next === undefined ? position : { ...position, currentPrice: next };
    }),
  };
}

function costOf(price: Scaled, quantity: Scaled, fee: Scaled): Scaled {
  return add(mul(price, quantity), fee);
}

function entryFromCost(cost: Scaled, quantity: Scaled): Scaled {
  return divRound(cost * SCALE, quantity);
}

export function applyPaperFill(state: PaperAccountState, fill: PaperFill): PaperFillResult {
  if (fill.userId !== state.userId || fill.agentId !== state.agentId) {
    return { ok: false, reason: "Fill does not belong to this account's user and agent." };
  }
  if (fill.assetSymbol.trim().length === 0) {
    return { ok: false, reason: "Asset is required." };
  }
  if (fill.quantity <= 0n) {
    return { ok: false, reason: "Quantity must be positive." };
  }
  if (fill.price <= 0n) {
    return { ok: false, reason: "Price must be positive." };
  }
  if (fill.fee < 0n) {
    return { ok: false, reason: "Fee cannot be negative." };
  }

  const gross = mul(fill.price, fill.quantity);
  const existing = state.positions.find((position) => position.assetSymbol === fill.assetSymbol);

  if (fill.side === "buy") {
    const debit = add(gross, fill.fee);
    if (debit > state.cash) {
      return { ok: false, reason: "Insufficient paper cash." };
    }
    const addedCost = costOf(fill.price, fill.quantity, fill.fee);
    const positions = existing
      ? state.positions.map((position) => {
          if (position.assetSymbol !== fill.assetSymbol) {
            return position;
          }
          const newQuantity = add(position.quantity, fill.quantity);
          const newCost = add(mul(position.entryPrice, position.quantity), addedCost);
          return {
            ...position,
            quantity: newQuantity,
            entryPrice: entryFromCost(newCost, newQuantity),
            currentPrice: fill.price,
            strategyId: fill.strategyId ?? position.strategyId,
          };
        })
      : [
          ...state.positions,
          {
            id: `pos_${fill.id}`,
            accountId: state.accountId,
            userId: state.userId,
            assetSymbol: fill.assetSymbol,
            quantity: fill.quantity,
            entryPrice: entryFromCost(addedCost, fill.quantity),
            currentPrice: fill.price,
            strategyId: fill.strategyId,
          },
        ];
    return {
      ok: true,
      state: appendTrade(state, fill, 0n, sub(state.cash, debit), positions, state.realizedPnl),
    };
  }

  if (!existing || existing.quantity < fill.quantity) {
    return { ok: false, reason: "Paper position is smaller than the sell quantity." };
  }
  const credit = sub(gross, fill.fee);
  if (credit < 0n) {
    return { ok: false, reason: "Fee exceeds paper sale proceeds." };
  }
  const realized = sub(sub(gross, mul(existing.entryPrice, fill.quantity)), fill.fee);
  const remaining = sub(existing.quantity, fill.quantity);
  const positions =
    remaining === 0n
      ? state.positions.filter((position) => position.assetSymbol !== fill.assetSymbol)
      : state.positions.map((position) =>
          position.assetSymbol === fill.assetSymbol
            ? { ...position, quantity: remaining, currentPrice: fill.price }
            : position,
        );
  return {
    ok: true,
    state: appendTrade(
      state,
      fill,
      realized,
      add(state.cash, credit),
      positions,
      add(state.realizedPnl, realized),
    ),
  };
}

function appendTrade(
  state: PaperAccountState,
  fill: PaperFill,
  realizedPnl: Scaled,
  cash: Scaled,
  positions: Position[],
  accountRealized: Scaled,
): PaperAccountState {
  const trade: PaperTrade = {
    id: fill.id,
    accountId: state.accountId,
    userId: state.userId,
    agentId: state.agentId,
    assetSymbol: fill.assetSymbol,
    side: fill.side,
    quantity: fill.quantity,
    price: fill.price,
    fee: fill.fee,
    realizedPnl,
    strategyId: fill.strategyId,
    at: fill.at,
    status: "paper_filled",
    venue: "paper",
    fidelity: "paper",
  };
  return {
    ...state,
    cash,
    positions,
    realizedPnl: accountRealized,
    trades: [...state.trades, trade],
  };
}
