import { describe, expect, it } from "vitest";
import { createDemoSession } from "@/test/fixtures/sample-session";
import { asUserId } from "@/domain/ids";
import { parseDecimal } from "@/domain/money";
import {
  applyPaperFill,
  markPositions,
  realizedByStrategy,
  summarizePortfolio,
  sumRealized,
} from "@/domain/portfolio";
import { accountState, ids } from "@/test/fixtures";

describe("paper portfolio", () => {
  it("values the sample ledger from cash, marks, and session start", () => {
    const session = createDemoSession();
    const summary = summarizePortfolio(session.portfolio);

    expect(summary.cash).toBe(parseDecimal("42350"));
    expect(summary.invested).toBe(parseDecimal("4867.90"));
    expect(summary.equity).toBe(parseDecimal("47217.90"));
    expect(summary.unrealizedPnl).toBe(parseDecimal("16.30"));
    expect(summary.realizedPnl).toBe(parseDecimal("84.20"));
    expect(summary.totalPnl).toBe(parseDecimal("100.50"));
    expect(summary.todayPnl).toBe(parseDecimal("127.40"));
    expect(sumRealized(session.portfolio.trades)).toBe(session.portfolio.realizedPnl);
  });

  it("attributes realized results to strategies", () => {
    const session = createDemoSession();
    const rows = realizedByStrategy(session.portfolio.trades);
    const momentum = rows.find((row) => row.strategyId === "momentum");
    expect(momentum?.realizedPnl).toBe(parseDecimal("84.20"));
  });

  it("buys, averages entry, and realizes a sale without mutating the prior state", () => {
    const original = accountState({ cash: parseDecimal("1000") });
    const first = applyPaperFill(original, {
      id: "buy_1",
      userId: ids.userId,
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "buy",
      quantity: parseDecimal("1"),
      price: parseDecimal("100"),
      fee: 0n,
      strategyId: "momentum",
      at: "2026-10-02T15:00:00.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(original.cash).toBe(parseDecimal("1000"));
    expect(original.positions).toHaveLength(0);

    const second = applyPaperFill(first.state, {
      id: "buy_2",
      userId: ids.userId,
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "buy",
      quantity: parseDecimal("1"),
      price: parseDecimal("200"),
      fee: 0n,
      strategyId: "momentum",
      at: "2026-10-02T15:01:00.000Z",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.state.positions[0]?.entryPrice).toBe(parseDecimal("150"));
    expect(second.state.cash).toBe(parseDecimal("700"));

    const sold = applyPaperFill(second.state, {
      id: "sell_1",
      userId: ids.userId,
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "sell",
      quantity: parseDecimal("1"),
      price: parseDecimal("110"),
      fee: 0n,
      strategyId: "momentum",
      at: "2026-10-02T15:02:00.000Z",
    });
    expect(sold.ok).toBe(true);
    if (!sold.ok) {
      return;
    }
    expect(sold.state.realizedPnl).toBe(parseDecimal("-40"));
    expect(sold.state.cash).toBe(parseDecimal("810"));
    expect(sold.state.positions[0]?.quantity).toBe(parseDecimal("1"));
    expect(realizedByStrategy(sold.state.trades)[0]?.strategyId).toBe("momentum");
  });

  it("rejects cash shortfalls, oversized sells, and cross-user fills", () => {
    const state = accountState({ cash: parseDecimal("1000") });
    const poor = applyPaperFill(state, {
      id: "too_big",
      userId: ids.userId,
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "buy",
      quantity: parseDecimal("100"),
      price: parseDecimal("100"),
      fee: 0n,
      strategyId: null,
      at: "2026-10-02T15:00:00.000Z",
    });
    expect(poor.ok).toBe(false);

    const opened = applyPaperFill(state, {
      id: "open",
      userId: ids.userId,
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "buy",
      quantity: parseDecimal("1"),
      price: parseDecimal("100"),
      fee: 0n,
      strategyId: null,
      at: "2026-10-02T15:00:00.000Z",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const oversized = applyPaperFill(opened.state, {
      id: "oversell",
      userId: ids.userId,
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "sell",
      quantity: parseDecimal("2"),
      price: parseDecimal("100"),
      fee: 0n,
      strategyId: null,
      at: "2026-10-02T15:05:00.000Z",
    });
    expect(oversized.ok).toBe(false);

    const foreign = applyPaperFill(opened.state, {
      id: "foreign",
      userId: asUserId("user_b"),
      agentId: ids.agentId,
      assetSymbol: "NVDA",
      side: "sell",
      quantity: parseDecimal("1"),
      price: parseDecimal("100"),
      fee: 0n,
      strategyId: null,
      at: "2026-10-02T15:05:00.000Z",
    });
    expect(foreign.ok).toBe(false);
  });

  it("marks prices on a copy", () => {
    const session = createDemoSession();
    const marked = markPositions(session.portfolio, { NVDA: parseDecimal("190") });
    expect(marked.positions.find((position) => position.assetSymbol === "NVDA")?.currentPrice).toBe(
      parseDecimal("190"),
    );
    expect(session.portfolio.positions.find((position) => position.assetSymbol === "NVDA")?.currentPrice).toBe(
      parseDecimal("184.55"),
    );
  });
});
