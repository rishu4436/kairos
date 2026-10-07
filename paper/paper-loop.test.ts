import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { formatSignedUsdt, formatUsdt } from "@/lib/format";
import { getCommandCenterModel } from "@/services/command-center";
import { NEUTRAL_EXTERNAL_POLICY, type ArbitrationDecision } from "@/domain/arbitration";
import type { KAIROSContext } from "@/context/types";
import type { ObservationBoard, ObservationRow } from "@/domain/observation";
import { asAgentId, asUserId } from "@/domain/ids";
import { parseDecimal } from "@/domain/money";
import { markPositions, summarizePortfolio } from "@/domain/portfolio";
import { resetMarketStores } from "@/observation/stores";
import { paperObservationBoard } from "@/observation/paper";
import { runPreparedAgentCycle } from "@/paper/cycle";
import { executePaper } from "@/paper/execute";
import { issueLiveExecutionContext, issuePaperExecutionContext, type PaperExecutionCapability } from "@/domain/execution-authority";
import { openLiveGateway, openPaperGateway } from "@/paper/gateway";
import { createTradeIntent } from "@/paper/intent";
import { DEFAULT_PAPER_POLICY, type PaperExecutionPolicy } from "@/paper/policy";
import { monitorPositions } from "@/paper/positions";
import { assessTradeIntent } from "@/paper/risk-gate";
import { runAgentCycle, readStoredRiskPolicy } from "@/paper/run-cycle";
import { previewPaperExecution, type PaperMarketSnapshot } from "@/paper/simulate";
import { MAX_ALLOCATION_PERCENT, sizePaperOrder } from "@/paper/sizing";
import { readTradeLifecycle } from "@/paper/lifecycle";
import { readPaperBook } from "@/paper/store";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { accountState, ids, policy } from "@/test/fixtures";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");

describe("paper autonomous loop", () => {
  beforeEach(() => {
    resetMarketStores();
  });

  it("creates a RISK_PENDING intent and refuses actions that cannot trade", () => {
    const frozen = Object.freeze(policy());
    const before = frozen.maxPositionNotional;
    const created = createTradeIntent(factoryInput(frozen, "BUY"));
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.intent.status).toBe("RISK_PENDING");
    expect(created.intent.venue).toBe("paper");
    expect(created.intent.action).toBe("BUY");
    expect(frozen.maxPositionNotional).toBe(before);
    expect(createTradeIntent(factoryInput(frozen, "HOLD")).ok).toBe(false);
    expect(createTradeIntent(factoryInput(frozen, "BUY", "NO_OPPORTUNITY")).ok).toBe(false);
    expect(createTradeIntent(factoryInput(frozen, "BUY", "CONFLICT")).ok).toBe(false);
    expect(createTradeIntent(factoryInput(frozen, "NO_SIGNAL")).ok).toBe(false);
  });

  it("sizes a buy to 10 percent of cash and never the whole book", () => {
    const cash = parseDecimal("10000");
    const sized = sizePaperOrder({
      action: "BUY",
      observedPrice: parseDecimal("100"),
      cash,
      equity: cash,
      invested: 0n,
      heldQuantity: 0n,
      existingMarketValue: 0n,
      riskPolicy: policy(),
      paperPolicy: DEFAULT_PAPER_POLICY,
    });
    expect(sized.ok).toBe(true);
    if (!sized.ok) {
      return;
    }
    const cap = (cash * BigInt(MAX_ALLOCATION_PERCENT)) / 100n;
    expect(sized.notional <= cap).toBe(true);
    expect(sized.notional < cash).toBe(true);
    expect(sized.notional >= DEFAULT_PAPER_POLICY.minimumTradeNotional).toBe(true);
    const partial = sizePaperOrder({
      action: "SELL",
      observedPrice: parseDecimal("100"),
      cash,
      equity: cash,
      invested: 0n,
      heldQuantity: parseDecimal("10"),
      existingMarketValue: parseDecimal("1000"),
      riskPolicy: policy(),
      paperPolicy: DEFAULT_PAPER_POLICY,
      reduceBps: 2500,
    });
    expect(partial).toMatchObject({ ok: true, quantity: parseDecimal("2.5"), binding: "reduce_policy" });
    const full = sizePaperOrder({
      action: "SELL",
      observedPrice: parseDecimal("100"),
      cash,
      equity: cash,
      invested: 0n,
      heldQuantity: parseDecimal("10"),
      existingMarketValue: parseDecimal("1000"),
      riskPolicy: policy(),
      paperPolicy: DEFAULT_PAPER_POLICY,
    });
    expect(full).toMatchObject({ ok: true, quantity: parseDecimal("10"), binding: "open_quantity" });
    const capped = sizePaperOrder({
      action: "BUY",
      observedPrice: parseDecimal("100"),
      cash,
      equity: cash,
      invested: 0n,
      heldQuantity: 0n,
      existingMarketValue: 0n,
      riskPolicy: policy(),
      paperPolicy: DEFAULT_PAPER_POLICY,
      maxIncrementalNotional: parseDecimal("500"),
    });
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.notional <= parseDecimal("500")).toBe(true);
    }
    expect(sizePaperOrder({
      action: "BUY",
      observedPrice: parseDecimal("100"),
      cash,
      equity: cash,
      invested: cash,
      heldQuantity: 0n,
      existingMarketValue: 0n,
      riskPolicy: policy({ maxAllocationBps: 0 }),
      paperPolicy: DEFAULT_PAPER_POLICY,
    })).toEqual({ ok: false, reason: "ALLOCATION_EXCEEDED" });
  });

  it("passes risk, fills a buy, and rejects an oversized intent with a precise code", () => {
    const result = run(select("BUY"));
    expect(result.createdIntentIds).toHaveLength(1);
    const book = readPaperBook(ids.userId, ids.agentId);
    const record = book?.records[0];
    expect(record?.risk.allowed).toBe(true);
    expect(record?.risk.policyVersion).toBe("1.0");
    expect(record?.execution?.status).toBe("FILLED");
    expect(record?.intent.status).toBe("PAPER_EXECUTED");
    expect(book?.account.positions).toHaveLength(1);
    const start = DEFAULT_PAPER_POLICY.paperStartingCash;
    const execution = record?.execution;
    if (!book || !execution) {
      throw new Error("missing fill");
    }
    const debit = execution.notional + execution.fee;
    expect(book.account.cash).toBe(start - debit);
    expect(book.account.realizedPnl).toBe(0n);
    const summary = summarizePortfolio(book.account);
    expect(summary.equity).toBe(summary.cash + summary.invested);
    expect(summary.equity < start).toBe(true);

    const huge = assessTradeIntent(
      { ...record.intent, requestedQuantity: parseDecimal("1000000"), status: "RISK_PENDING" },
      policy(),
      accountState(),
      NOW,
    );
    expect(huge.allowed).toBe(false);
    expect(huge.reasonCodes).toContain("POSITION_TOO_LARGE");
  });

  it("rejects risk, an empty sell, allocation, duplicates, and expired intents before a fill", () => {
    const blocked = run(select("BUY"), { risk: policy({ allowedAssets: ["AAPL"] }) });
    expect(blocked.view?.history[0]?.status).toBe("RISK REJECTED");
    expect(blocked.view?.history[0]?.risk).toBe("FAIL");
    expect(readPaperBook(ids.userId, ids.agentId)?.account.cash).toBe(DEFAULT_PAPER_POLICY.paperStartingCash);
    expect(blocked.events.map((event) => event.type)).toEqual([
      "TRADE_INTENT_CREATED",
      "RISK_CHECK_STARTED",
      "RISK_REJECTED",
    ]);

    resetMarketStores();
    const sell = run(select("SELL"));
    expect(sell.createdIntentIds).toHaveLength(0);
    expect(sell.view?.assets[0]?.headline).toMatch(/no position/i);

    resetMarketStores();
    const allocation = run(select("BUY"), { risk: policy({ maxAllocationBps: 0 }) });
    expect(allocation.createdIntentIds).toHaveLength(0);
    expect(allocation.view?.assets[0]?.headline).toMatch(/ALLOCATION_EXCEEDED/);

    resetMarketStores();
    const first = run(select("BUY"));
    const second = run(select("BUY"), { nowMs: NOW + 15_000 });
    expect(first.createdIntentIds).toHaveLength(1);
    expect(second.createdIntentIds).toHaveLength(0);
    expect(readPaperBook(ids.userId, ids.agentId)?.records).toHaveLength(1);

    resetMarketStores();
    const expired = run(select("BUY"), { paper: { ...DEFAULT_PAPER_POLICY, intentTtlMs: 0 } });
    expect(expired.view?.history[0]?.status).toBe("EXPIRED");
    expect(expired.events.map((event) => event.type)).toEqual([
      "TRADE_INTENT_CREATED",
      "RISK_CHECK_STARTED",
      "TRADE_INTENT_EXPIRED",
    ]);
    expect(expired.events.some((event) => event.type === "RISK_REJECTED")).toBe(false);
    expect(expired.events.find((event) => event.type === "TRADE_INTENT_EXPIRED")?.metadata?.cause).toBe("expiration");
    expect(blocked.events.find((event) => event.type === "RISK_REJECTED")?.metadata?.cause).toBe("risk_rejection");
    expect(expired.loopState).toBe("WAITING_FOR_RISK");
    expect(expired.events.some((event) => event.type === "PAPER_EXECUTED")).toBe(false);
    expect(readPaperBook(ids.userId, ids.agentId)?.account.positions).toHaveLength(0);
  });

  it("blocks a second buy while the position is open and sells only the open quantity", () => {
    run(select("BUY"), { paper: { ...DEFAULT_PAPER_POLICY, minimumActionIntervalMs: 0 } });
    const again = run(select("BUY"), {
      nowMs: NOW + 60_000,
      paper: { ...DEFAULT_PAPER_POLICY, minimumActionIntervalMs: 0 },
    });
    expect(again.createdIntentIds).toHaveLength(0);
    expect(JSON.stringify(again.view?.assets[0])).toMatch(/position already open|Re-entry is blocked/i);
    const afterBuy = readPaperBook(ids.userId, ids.agentId);
    const bought = afterBuy?.account.positions[0]?.quantity;
    const cashAfterBuy = afterBuy?.account.cash;
    const sold = run(select("SELL"), { nowMs: NOW + 120_000 });
    const afterSell = readPaperBook(ids.userId, ids.agentId);
    expect(sold.createdIntentIds).toHaveLength(1);
    expect(afterSell?.account.positions).toHaveLength(0);
    expect(afterSell && cashAfterBuy !== undefined && afterSell.account.cash > cashAfterBuy).toBe(true);
    expect(afterSell && afterSell.account.realizedPnl !== 0n).toBe(true);
    const sellRecord = afterSell?.records.at(-1);
    expect(sellRecord?.execution?.filledQuantity).toBe(bought);
    expect(afterSell && afterSell.account.cash < DEFAULT_PAPER_POLICY.paperStartingCash).toBe(true);
  });

  it("exits a reversed thesis through paper risk without applying entry caps", () => {
    const opened = run(select("BUY"));
    expect(opened.createdIntentIds).toHaveLength(1);
    const bought = readPaperBook(ids.userId, ids.agentId)?.account.positions[0]?.quantity;
    const closed = run(selectFor(ids.userId, "NVDA", "BUY", "NO_OPPORTUNITY"), {
      nowMs: NOW + 60_000,
      risk: policy({
        maxPositionNotional: parseDecimal("1"),
        maxAllocationBps: 1,
        maxDailyLoss: 0n,
      }),
      kairos: reversalContext(),
    });
    const book = readPaperBook(ids.userId, ids.agentId);
    expect(closed.createdIntentIds).toHaveLength(1);
    expect(book?.account.positions).toHaveLength(0);
    expect(book?.records.at(-1)?.intent.action).toBe("SELL");
    expect(book?.records.at(-1)?.intent.intentId).toContain("_pos_");
    expect(book?.records.at(-1)?.intent.position.kind).toBe("EXIT");
    expect(book?.records.at(-1)?.execution?.filledQuantity).toBe(bought);
    expect(book?.records.at(-1)?.risk.allowed).toBe(true);
    expect(closed.loopState).toBe("OBSERVING");
    expect(JSON.stringify(closed.view?.assets)).toMatch(/EXIT/);
  });

  it("holds without a trade intent and adds or reduces through the same paper pipeline", () => {
    run(select("BUY"));
    const bought = readPaperBook(ids.userId, ids.agentId)?.account.positions[0]?.quantity;
    const filled = () => readPaperBook(ids.userId, ids.agentId)?.records.filter((record) => record.execution?.status === "FILLED").length ?? 0;
    expect(filled()).toBe(1);
    const held = run(selectFor(ids.userId, "NVDA", "BUY", "NO_OPPORTUNITY"), {
      nowMs: NOW + 15 * 60 * 1000,
      kairos: manageContext({ confidence: 0.7, timestamp: "2026-10-04T15:15:00.000Z" }),
    });
    expect(held.createdIntentIds).toHaveLength(0);
    expect(held.events.some((event) => event.type === "TRADE_INTENT_CREATED")).toBe(false);
    expect(held.events.some((event) => event.type === "POSITION_DECISION_HOLD")).toBe(true);
    expect(held.events.some((event) => event.type === "POSITION_DECISION_RECORDED")).toBe(true);
    expect(filled()).toBe(1);
    expect(readPaperBook(ids.userId, ids.agentId)?.account.positions).toHaveLength(1);
    expect(readPaperBook(ids.userId, ids.agentId)?.metas.get("NVDA")?.lastDecision).toBe("HOLD");
    expect(readPaperBook(ids.userId, ids.agentId)?.metas.get("NVDA")?.strategyId).toBe("momentum");

    const hijack = { ...selectFor(ids.userId, "NVDA", "BUY"), selectedStrategy: "mean-reversion", selectedStrategyName: "Mean Reversion" };
    const added = run(hijack, {
      nowMs: NOW + 2 * 60 * 60 * 1000,
      kairos: manageContext({ confidence: 0.8, timestamp: "2026-10-04T17:00:00.000Z", signalTimestamp: "2026-10-04T16:30:00.000Z", mark: "101.00" }),
    });
    const book = readPaperBook(ids.userId, ids.agentId);
    const addedQty = book?.account.positions[0]?.quantity ?? 0n;
    expect(added.createdIntentIds).toHaveLength(1);
    expect(book?.records.at(-1)?.intent.position.kind).toBe("ADD");
    expect(book?.records.at(-1)?.intent.strategyId).toBe("momentum");
    expect(book?.metas.get("NVDA")?.strategyId).toBe("momentum");
    expect(addedQty).toBeGreaterThan(bought ?? 0n);
    expect(filled()).toBe(2);

    const reduced = run(selectFor(ids.userId, "NVDA", "BUY", "NO_OPPORTUNITY"), {
      nowMs: NOW + 3 * 60 * 60 * 1000,
      kairos: manageContext({ confidence: 0.5, timestamp: "2026-10-04T18:00:00.000Z", mark: "100.00" }),
    });
    const after = readPaperBook(ids.userId, ids.agentId);
    expect(reduced.createdIntentIds).toHaveLength(1);
    expect(after?.records.at(-1)?.intent.position.kind).toBe("REDUCE");
    expect(after?.records.at(-1)?.intent.action).toBe("SELL");
    expect(after?.account.positions[0]?.quantity ?? 0n).toBeLessThan(addedQty);
    expect(filled()).toBe(3);
    expect(after?.account.positions).toHaveLength(1);
    expect(after?.metas.get("NVDA")?.reduceCount).toBe(1);
    expect(after?.metas.get("NVDA")?.strategyId).toBe("momentum");
  });

  it("keeps unrealized PnL mark-to-market and does not let monitoring write the book", () => {
    run(select("BUY"));
    const book = readPaperBook(ids.userId, ids.agentId);
    if (!book) {
      throw new Error("missing book");
    }
    const before = book.account.positions[0]?.currentPrice;
    const realized = book.account.realizedPnl;
    const higher = markPositions(book.account, { NVDA: parseDecimal("150") });
    const lower = markPositions(book.account, { NVDA: parseDecimal("50") });
    expect(summarizePortfolio(higher).unrealizedPnl > summarizePortfolio(lower).unrealizedPnl).toBe(true);
    expect(summarizePortfolio(higher).realizedPnl).toBe(realized);
    monitorPositions(book.account, book.metas, { NVDA: parseDecimal("150") });
    expect(book.account.positions[0]?.currentPrice).toBe(before);
    expect(book.account.realizedPnl).toBe(realized);
  });

  it("uses one correlation id and records the lifecycle in order", () => {
    const result = run(select("BUY"));
    const id = result.events[0]?.correlationId;
    expect(id).toBeTruthy();
    expect(result.events.every((event) => event.correlationId === id && event.userId === ids.userId)).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "TRADE_INTENT_CREATED",
      "RISK_CHECK_STARTED",
      "RISK_APPROVED",
      "PAPER_SIMULATION_STARTED",
      "PAPER_SIMULATION_PASSED",
      "PAPER_EXECUTED",
      "POSITION_UPDATED",
    ]);
    const record = readPaperBook(ids.userId, ids.agentId)?.records[0];
    expect(record?.correlationId).toBe(id);
    expect(record?.executionContextId.startsWith("ctx_PAPER_")).toBe(true);
    expect(record?.arbitration.decision).toBe("SELECT_STRATEGY");
    expect(record?.position?.userId).toBe(ids.userId);
    expect(record?.position?.agentStatus).toBe("MONITORING_POSITION");
    expect(record?.position?.originatingStrategyId).toBe("momentum");
    expect(record?.position?.arbitrationDecisionId).toBe(record?.intent.arbitrationDecisionId);
    expect(record?.position?.intentId).toBe(record?.intent.intentId);
    expect(record?.position?.executionId).toBe(record?.execution?.executionId);
    expect(record?.position?.correlationId).toBe(id);
    expect(result.loopState).toBe("MONITORING_POSITION");
    expect(result.view?.loopState).toBe("MONITORING_POSITION");
    expect(result.executionMode).toBe("PAPER");
    expect(result.transitions).toEqual([
      { from: "WAITING_FOR_RISK", to: "SIMULATING" },
      { from: "SIMULATING", to: "PAPER_EXECUTING" },
      { from: "PAPER_EXECUTING", to: "MONITORING_POSITION" },
    ]);
    expect(result.transitions.some((step) => step.to === "EXECUTING")).toBe(false);
    const lifecycle = readTradeLifecycle(ids.userId, ids.agentId, { correlationId: id! });
    expect(lifecycle?.executionContextId).toBe(record?.executionContextId);
    expect(lifecycle?.stages.map((stage) => stage.stage)).toEqual([
      "ARBITRATION",
      "INTENT",
      "RISK",
      "SIMULATION",
      "EXECUTION_CONTEXT",
      "PAPER_EXECUTION",
      "POSITION",
    ]);
    expect(lifecycle?.stages.every((stage) => stage.present)).toBe(true);
    expect(lifecycle?.executionMode).toBe("PAPER");
    expect(readTradeLifecycle(ids.userId, ids.agentId, { intentId: lifecycle!.intentId })?.correlationId).toBe(id);
    expect(readTradeLifecycle(asUserId("user_b"), asAgentId("agent_b"), { correlationId: id! })).toBeNull();
  });

  it("simulates a worse fill deterministically and stops when simulation fails", () => {
    const intent = mustIntent();
    const snapshot = snapshotFor(intent.userId);
    const first = previewPaperExecution({
      intent,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    });
    const second = previewPaperExecution({
      intent,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    });
    expect(second).toEqual(first);
    expect(first.status).toBe("PASS");
    expect(first.estimatedPrice > snapshot.observedPrice).toBe(true);
    const sell = previewPaperExecution({
      intent: { ...intent, action: "SELL" },
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: intent.requestedQuantity,
    });
    expect(sell.estimatedPrice < snapshot.observedPrice).toBe(true);

    const failed = run(select("BUY"), { risk: policy({ maxSlippageBps: 1 }) });
    expect(failed.events.map((event) => event.type)).toContain("PAPER_SIMULATION_FAILED");
    expect(failed.events.map((event) => event.type)).not.toContain("PAPER_EXECUTED");
    expect(readPaperBook(ids.userId, ids.agentId)?.account.positions).toHaveLength(0);
  });

  it("refuses unsafe paper execution and leaves the real gateway disconnected", () => {
    const intent = mustIntent();
    const snapshot = snapshotFor(intent.userId);
    const risk = assessTradeIntent(intent, policy(), accountState({ cash: parseDecimal("10000") }), NOW);
    const ready = { ...intent, status: "READY_FOR_PAPER" as const };
    const filled = executePaper({
      intent: ready,
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    });
    const again = executePaper({
      intent: ready,
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    });
    expect(again).toEqual(filled);
    expect(filled.execution.status).toBe("FILLED");
    expect(filled.execution.broadcast).toBe(false);
    expect(filled.execution.chainTransactionId).toBeNull();
    expect(filled.execution.signature).toBeNull();
    expect(filled.execution.status).not.toBe("PARTIALLY_FILLED");

    expect(executePaper({
      intent: { ...ready, status: "RISK_PENDING" },
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    }).execution.status).toBe("REJECTED");
    expect(executePaper({
      intent: ready,
      risk: { ...risk, allowed: false },
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    }).execution.status).toBe("REJECTED");
    expect(executePaper({
      intent: { ...ready, userId: asUserId("user_b") },
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    }).execution.status).toBe("REJECTED");
    expect(executePaper({
      intent: { ...ready, requestedQuantity: 0n },
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    }).execution.status).toBe("REJECTED");
    expect(executePaper({
      intent: ready,
      risk,
      snapshot: { ...snapshot, supported: false },
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    }).execution.status).toBe("REJECTED");
    expect(executePaper({
      intent: { ...ready, expiresAt: "2026-10-04T14:00:00.000Z" },
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      authority: paperAuthority(),
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    }).execution.status).toBe("EXPIRED");

    expect(readPaperBook(ids.userId, ids.agentId)).toBeNull();
    const paperRequest = {
      intent: ready,
      risk,
      snapshot,
      policy: DEFAULT_PAPER_POLICY,
      nowMs: NOW,
      cash: parseDecimal("10000"),
      heldQuantity: 0n,
    };
    const liveCapability = issueLiveForTest();
    const refused = openPaperGateway(liveCapability as unknown as PaperExecutionCapability, NOW);
    expect(refused.ok).toBe(false);
    const liveDirect = executePaper({ ...paperRequest, authority: liveCapability as unknown as PaperExecutionCapability });
    expect(liveDirect.execution.status).toBe("REJECTED");
    expect(liveDirect.execution.filledQuantity).toBe(0n);
    expect(liveDirect.authorityCode).toBe("EXECUTION_CAPABILITY_MISMATCH");
    const liveGate = openLiveGateway(liveCapability, NOW);
    expect(liveGate.ok).toBe(true);
    if (liveGate.ok) {
      const disconnected = liveGate.gateway.execute(paperRequest);
      expect(liveGate.gateway.connected).toBe(false);
      expect(disconnected.disconnected).toBe(true);
      expect(disconnected.execution.status).toBe("REJECTED");
      expect(disconnected.execution.broadcast).toBe(false);
      expect(disconnected.execution.signature).toBeNull();
      expect(disconnected.execution.chainTransactionId).toBeNull();
    }
    const paperGate = openPaperGateway(paperAuthority(), NOW);
    expect(paperGate.ok).toBe(true);
    expect(openLiveGateway(paperAuthority() as unknown as ReturnType<typeof issueLiveForTest>, NOW).ok).toBe(false);

    const source = readdirSync(join(process.cwd(), "paper"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(process.cwd(), "paper", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/@\/wallet/);
    expect(source).not.toMatch(/bnb-ports/);
    expect(source).not.toMatch(/@\/services\/binance/);
    expect(source).not.toMatch(/signTransaction/);
    expect(source).not.toMatch(/broadcastTransaction/);
    expect(source).not.toMatch(/sendTransaction/);
  });

  it("isolates users and leaves the sample command center unchanged", () => {
    const userB = asUserId("user_b");
    const agentB = asAgentId("agent_b");
    run(select("BUY"));
    const cashA = readPaperBook(ids.userId, ids.agentId)?.account.cash;
    const other = runPreparedAgentCycle({
      userId: userB,
      agentId: agentB,
      board: board(userB, [paperRow(userB, selectFor(userB, "NVDA", "BUY"))]),
      candles: new Map(),
      riskPolicy: policy({ userId: userB, agentId: agentB }),
      nowMs: NOW,
      authority: paperAuthority(userB, agentB),
    });
    expect(other.createdIntentIds).toHaveLength(1);
    expect(readPaperBook(ids.userId, ids.agentId)?.account.cash).toBe(cashA);
    expect(readPaperBook(userB, agentB)?.records[0]?.userId).toBe(userB);
    expect(readPaperBook(userB, ids.agentId)).toBeNull();
    const lifeA = readTradeLifecycle(ids.userId, ids.agentId, {
      correlationId: readPaperBook(ids.userId, ids.agentId)!.records[0]!.correlationId,
    });
    expect(lifeA).not.toBeNull();
    expect(readTradeLifecycle(userB, agentB, { correlationId: lifeA!.correlationId })).toBeNull();
    expect(readStoredRiskPolicy("user_b")).toBeNull();
    expect(readStoredRiskPolicy(DEMO_USER_ID)?.userId).toBe(DEMO_USER_ID);
    expect(runAgentCycle("user_b").ran).toBe(false);
    expect(readPaperBook(ids.userId, ids.agentId)?.account.cash).toBe(cashA);
    expect(getCommandCenterModel().portfolio.equity).toBe("47,217.90 USDT");
    expect(getCommandCenterModel().agent.lastDecision).toBe("None");
  });

  it("creates one intent for a confirmation and reports user and agent mismatches", () => {
    const confirmed = selectFor(ids.userId, "NVDA", "BUY", "MULTI_STRATEGY_CONFIRMATION");
    const once = run(confirmed);
    expect(once.createdIntentIds).toHaveLength(1);
    const notional = readPaperBook(ids.userId, ids.agentId)?.records[0]?.intent.requestedNotional;
    expect(notional !== undefined && notional <= parseDecimal("1000")).toBe(true);

    const owned = mustIntent();
    const mismatch = assessTradeIntent(owned, policy({ userId: asUserId("user_b") }), accountState(), NOW);
    expect(mismatch.reasonCodes).toContain("USER_MISMATCH");
    const agent = assessTradeIntent(owned, policy({ agentId: asAgentId("agent_b") }), accountState(), NOW);
    expect(agent.reasonCodes).toContain("AGENT_MISMATCH");
    const slippery = assessTradeIntent({ ...owned, maxSlippageBps: 80 }, policy(), accountState(), NOW);
    expect(slippery.reasonCodes).toContain("SLIPPAGE_TOO_HIGH");
  });

  it("fills the deterministic paper board once and does not repeat the buy", () => {
    const first = paperObservationBoard(DEMO_USER_ID, { now: new Date(NOW), authority: demoAuthority(NOW) });
    const tsla = first.rows.find((row) => row.ticker === "TSLA");
    expect(tsla?.arbitration?.decision).toBe("SELECT_STRATEGY");
    expect(tsla?.arbitration?.selectedAction).toBe("BUY");
    expect(first.paperCycle?.history.some((mission) => mission.asset === "TSLA" && mission.status === "PAPER FILLED")).toBe(true);
    expect(first.paperCycle?.broadcast).toBe(false);
    expect(first.paperCycle?.badge).toBe("PAPER MODE");
    const filled = readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"));
    const marked = summarizePortfolio(markPositions(filled!.account, { TSLA: parseDecimal("248.10") }));
    expect(marked.equity).toBe(marked.cash + marked.invested);
    expect(marked.equity < parseDecimal("10000")).toBe(true);
    expect(filled!.account.positions[0]?.currentPrice).not.toBe(parseDecimal("248.10"));
    expect(first.paperCycle?.equity).toBe(formatUsdt(marked.equity));
    expect(first.paperCycle?.invested).toBe(formatUsdt(marked.invested));
    expect(first.paperCycle?.unrealizedPnl).toBe(formatSignedUsdt(marked.unrealizedPnl));
    expect(first.paperCycle?.unrealizedPnl).toBe(first.paperCycle?.positions[0]?.unrealizedPnl);
    const cash = filled?.account.cash;
    const second = paperObservationBoard(DEMO_USER_ID, { now: new Date(NOW + 15_000), authority: demoAuthority(NOW + 15_000) });
    expect(second.paperCycle?.history.filter((mission) => mission.fill === "FILLED")).toHaveLength(1);
    expect(readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"))?.account.cash).toBe(cash);
    expect(JSON.stringify(second.paperCycle?.assets)).toMatch(/HOLD · OPEN · THESIS_VALID/);
    const meta = readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"))?.metas.get("TSLA");
    expect(meta?.addCount).toBe(0);
    expect(meta?.lifecycle).toBe("OPEN");
    expect(meta?.entry?.entryStrategySignal.strategyId).toBe("momentum");
    expect(meta?.entry?.entryStrategySignal.action).toBe("BUY");
    expect(JSON.stringify(second.paperCycle?.assets)).toMatch(/Trade intent created/);
    expect(JSON.stringify(second.paperCycle?.assets)).toMatch(/Position updated/);
    expect(second.events.some((event) => event.type === "TRADE_INTENT_CREATED")).toBe(true);
    expect(second.events.some((event) => event.type === "RISK_APPROVED")).toBe(true);
    expect(second.events.some((event) => event.type === "PAPER_SIMULATION_PASSED")).toBe(true);
    expect(second.events.some((event) => event.type === "PAPER_EXECUTED")).toBe(true);
    expect(second.events.some((event) => event.type === "POSITION_UPDATED")).toBe(true);
    expect(first.paperCycle?.loopState).toBe("MONITORING_POSITION");
    expect(second.paperCycle?.loopState).toBe("MONITORING_POSITION");
    expect(second.paperCycle?.executionMode).toBe("PAPER");
    expect(readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"))?.account.positions).toHaveLength(1);
    expect(getCommandCenterModel().portfolio.equity).toBe("47,217.90 USDT");
  });

  it("refuses an untrusted or live authority and does not open a book", () => {
    const forged = runPreparedAgentCycle({
      authority: { kind: "paper_execution", context: { mode: "PAPER" } } as PaperExecutionCapability,
      userId: ids.userId,
      agentId: ids.agentId,
      board: board(ids.userId, [paperRow(ids.userId, select("BUY"))]),
      candles: new Map(),
      riskPolicy: policy(),
      nowMs: NOW,
    });
    expect(forged.ran).toBe(false);
    expect(forged.authorityCode).toBe("EXECUTION_CONTEXT_INVALID");
    expect(readPaperBook(ids.userId, ids.agentId)).toBeNull();

    const live = runPreparedAgentCycle({
      authority: issueLiveForTest() as unknown as PaperExecutionCapability,
      userId: ids.userId,
      agentId: ids.agentId,
      board: board(ids.userId, [paperRow(ids.userId, select("BUY"))]),
      candles: new Map(),
      riskPolicy: policy(),
      nowMs: NOW,
    });
    expect(live.ran).toBe(false);
    expect(live.authorityCode).toBe("EXECUTION_CAPABILITY_MISMATCH");
    expect(live.executionContextId).toBeNull();
    expect(readPaperBook(ids.userId, ids.agentId)).toBeNull();

    const boardOnly = paperObservationBoard(DEMO_USER_ID, {
      now: new Date(NOW),
      authority: { mode: "LIVE" } as unknown as PaperExecutionCapability,
    });
    expect(boardOnly.rows.length).toBeGreaterThan(0);
    expect(boardOnly.paperCycle).toBeUndefined();
    expect(boardOnly.events.some((event) => event.type === "TRADE_INTENT_CREATED" || event.type === "PAPER_EXECUTED")).toBe(false);
    expect(readPaperBook(asUserId(DEMO_USER_ID), asAgentId("agent_demo"))).toBeNull();
  });
});

function run(
  decision: ArbitrationDecision,
  options: {
    nowMs?: number;
    risk?: ReturnType<typeof policy>;
    paper?: PaperExecutionPolicy;
    authority?: PaperExecutionCapability;
    kairos?: KAIROSContext;
  } = {},
) {
  const userId = options.risk?.userId ?? ids.userId;
  const agentId = options.risk?.agentId ?? ids.agentId;
  const nowMs = options.nowMs ?? NOW;
  return runPreparedAgentCycle({
    authority: options.authority ?? paperAuthority(userId, agentId, nowMs),
    userId,
    agentId,
    board: board(userId, [paperRow(userId, decision, options.kairos)]),
    candles: new Map(),
    riskPolicy: options.risk ?? policy(),
    paperPolicy: options.paper,
    nowMs,
  });
}

function paperAuthority(userId = ids.userId, agentId = ids.agentId, nowMs = NOW, ttlMs?: number) {
  return issuePaperExecutionContext({ userId, agentId, nowMs, ttlMs });
}

function demoAuthority(nowMs: number) {
  return issuePaperExecutionContext({
    userId: asUserId(DEMO_USER_ID),
    agentId: asAgentId("agent_demo"),
    nowMs,
  });
}

function issueLiveForTest() {
  return issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW });
}

function select(action: "BUY" | "SELL"): ArbitrationDecision {
  return selectFor(ids.userId, "NVDA", action);
}

function selectFor(userId: string, ticker: string, action: "BUY" | "SELL" | "HOLD" | "NO_SIGNAL", kind: ArbitrationDecision["decision"] = "SELECT_STRATEGY"): ArbitrationDecision {
  return {
    asset: { id: `paper:${ticker}`, ticker, userId },
    timestamp: "2026-10-04T15:00:00.000Z",
    decision: kind,
    selectedStrategy: action === "NO_SIGNAL" ? null : "momentum",
    selectedStrategyName: action === "NO_SIGNAL" ? null : "Momentum",
    selectedAction: action === "NO_SIGNAL" ? null : action,
    score: 0.8,
    confidence: 0.7,
    candidates: [],
    conflicts: [],
    evidence: { summary: "Momentum selected", supports: ["Trend up"], penalties: [], rejected: [] },
    dataQuality: "DEGRADED",
    marketRegime: "TRENDING_UP",
    marketSession: "UNKNOWN",
    validUntil: "2026-10-04T15:15:00.000Z",
    version: "1.0",
    cooldownHeld: false,
    loopPhase: "WAITING_FOR_RISK",
    ...NEUTRAL_EXTERNAL_POLICY,
  };
}

function factoryInput(risk: ReturnType<typeof policy>, action: "BUY" | "SELL" | "HOLD" | "NO_SIGNAL", kind?: ArbitrationDecision["decision"]) {
  const decision = selectFor(risk.userId, "NVDA", action, kind);
  return {
    userId: risk.userId,
    agentId: risk.agentId,
    accountId: ids.accountId,
    decision,
    observation: {
      assetId: "paper:NVDA",
      ticker: "NVDA",
      userId: risk.userId,
      observedPrice: parseDecimal("100"),
      referencePrice: null,
      priceTimestamp: "2026-10-04T15:00:00.000Z",
    },
    riskPolicy: risk,
    quantity: parseDecimal("1"),
    notional: parseDecimal("100"),
    paperPolicy: DEFAULT_PAPER_POLICY,
    nowMs: NOW,
    correlationId: "corr_test",
  };
}

function mustIntent() {
  const created = createTradeIntent(factoryInput(policy(), "BUY"));
  if (!created.ok) {
    throw new Error(created.reason);
  }
  return created.intent;
}

function snapshotFor(userId: string): PaperMarketSnapshot {
  return {
    assetId: "paper:NVDA",
    ticker: "NVDA",
    userId,
    observedPrice: parseDecimal("100"),
    referencePrice: null,
    priceTimestamp: "2026-10-04T15:00:00.000Z",
    volatilityBps: 40,
    supported: true,
  };
}

function paperRow(userId: string, decision: ArbitrationDecision, kairos?: KAIROSContext): ObservationRow {
  return {
    id: decision.asset.id,
    ticker: decision.asset.ticker,
    companyName: decision.asset.ticker,
    tokenSymbol: `MOCK:${decision.asset.ticker}`,
    platformLabel: "Paper sample",
    chainLabel: "Not resolved",
    contractAddress: null,
    price: "100.00",
    referencePrice: null,
    deviationPct: null,
    change24hPct: null,
    session: "UNKNOWN",
    sessionLabel: "UNKNOWN",
    rawMarketStatus: null,
    freshness: "SAMPLE",
    freshnessLabel: "SAMPLE",
    ageMs: null,
    sourceTimestamp: "2026-10-04T15:00:00.000Z",
    receivedAt: "2026-10-04T15:00:00.000Z",
    volume24hUsd: null,
    nextOpenAt: null,
    reasonMessage: null,
    fidelity: "paper",
    representationId: decision.asset.id,
    regime: "TRENDING_UP",
    regimeDetail: null,
    dataQuality: "DEGRADED",
    historyPoints: 48,
    features: [],
    signals: [],
    candles: [],
    arbitration: decision,
    ...(kairos ? { kairos } : {}),
  };
}

function manageContext(input: { confidence: number; timestamp: string; signalTimestamp?: string; mark?: string }): KAIROSContext {
  const mark = input.mark ?? "100.00";
  return {
    userId: ids.userId,
    agentId: ids.agentId,
    assetId: "paper:NVDA",
    cycleId: `cycle-${input.timestamp}`,
    timestamp: input.timestamp,
    externalAbsence: "NONE",
    quality: "DEGRADED",
    market: { status: "AVAILABLE", freshness: "UNKNOWN", value: { price: mark, fidelity: "paper" } },
    features: { value: { features: [{ id: "trend", value: "UP" }] } },
    regime: { value: { regime: "TRENDING_UP" } },
    session: { value: { session: "UNKNOWN" } },
    strategySignals: {
      value: {
        signals: [
          {
            strategyId: "momentum",
            strategyName: "Momentum",
            version: "1",
            action: "BUY",
            evaluation: "SIGNAL",
            confidence: input.confidence,
            timestamp: input.signalTimestamp ?? input.timestamp,
            validUntil: "2026-10-04T20:00:00.000Z",
            source: "test",
          },
        ],
      },
    },
    strategyHealth: { value: { reports: [] } },
    strategyPerformance: { value: { records: [] } },
    externalSignals: { status: "UNAVAILABLE", value: null },
    tokenSecurity: { value: { gate: "NOT_EVALUATED", label: "UNKNOWN" } },
    eventContext: { status: "UNAVAILABLE", value: null },
    positionContext: {
      value: {
        state: "OPEN",
        quantity: "10",
        averageEntry: "100.00",
        currentMark: mark,
        unrealizedPnL: "0",
        notional: "1000.00",
        originStrategy: "momentum",
        strategyVersion: "1",
        openedAt: "2026-10-04T15:00:00.000Z",
        representationId: "paper:NVDA",
        positionId: "pos_nvda",
        correlationId: "corr_open",
        addCount: 0,
        lastAddAt: null,
        reduceCount: 0,
        lastReduceAt: null,
        lastDecision: null,
        lastDecisionAt: null,
        thesisState: "VALID",
        entryContextId: "ctx_entry",
        highestMark: "100.00",
        previousSnapshot: null,
        alternateStrategyId: null,
        exitClass: null,
        managementPolicy: null,
        appliedReductions: [],
        entry: {
          entryContextId: "ctx_entry",
          entryCycleId: "cycle-entry",
          entryStrategySignal: { strategyId: "momentum", action: "BUY", evaluation: "SIGNAL", confidence: 0.7 },
          entryRegime: "TRENDING_UP",
          entrySession: "UNKNOWN",
          entryPrice: "100.00",
          entryStrategyHealth: null,
          entryExternalEvidence: null,
          entryEventState: null,
          entryTimestamp: "2026-10-04T15:00:00.000Z",
          entryFeatures: { trend: "UP", distanceFromMeanBps: null },
        },
        risk: {
          maxPositionNotional: "2500",
          maxAllocationBps: 5000,
          equity: "10000",
          invested: "1000",
          dailyLossReached: false,
          minimumTradeNotional: "25",
        },
      },
    },
  } as unknown as KAIROSContext;
}

function reversalContext(): KAIROSContext {
  return {
    userId: ids.userId,
    agentId: ids.agentId,
    assetId: "paper:NVDA",
    cycleId: "cycle-exit",
    timestamp: "2026-10-04T15:01:00.000Z",
    quality: "DEGRADED",
    market: { status: "AVAILABLE", freshness: "UNKNOWN", value: { price: "100.00" } },
    features: { value: { features: [{ id: "trend", value: "UP" }] } },
    regime: { value: { regime: "TRENDING_UP" } },
    strategySignals: {
      value: {
        signals: [
          {
            strategyId: "momentum",
            strategyName: "Momentum",
            version: "1",
            action: "SELL",
            evaluation: "SIGNAL",
            confidence: 0.8,
            timestamp: "2026-10-04T15:01:00.000Z",
            validUntil: "2026-10-04T16:00:00.000Z",
            source: "test",
          },
        ],
      },
    },
    strategyHealth: { value: { reports: [] } },
    strategyPerformance: { value: { records: [] } },
    externalSignals: { status: "UNAVAILABLE", value: null },
    tokenSecurity: { value: { gate: "NOT_EVALUATED", label: "UNKNOWN" } },
    eventContext: { status: "UNAVAILABLE", value: null },
    positionContext: {
      value: {
        state: "OPEN",
        quantity: "1",
        averageEntry: "100.00",
        currentMark: "100.00",
        unrealizedPnL: "0",
        notional: "100.00",
        originStrategy: "momentum",
        strategyVersion: "1",
        openedAt: "2026-10-04T15:00:00.000Z",
        representationId: "paper:NVDA",
        positionId: "pos_nvda",
        correlationId: "corr_open",
        addCount: 0,
        lastAddAt: null,
        appliedReductions: [],
        entry: null,
        risk: {
          maxPositionNotional: "5000",
          maxAllocationBps: 2500,
          equity: "10000",
          invested: "100",
          dailyLossReached: false,
          minimumTradeNotional: "25",
        },
      },
    },
  } as unknown as KAIROSContext;
}

function board(userId: string, rows: ObservationRow[]): ObservationBoard {
  return {
    ok: true,
    dataMode: "paper",
    refreshIntervalMs: 15_000,
    freshMaxMs: 30_000,
    agingMaxMs: 120_000,
    generatedAt: "2026-10-04T15:00:00.000Z",
    userId,
    watchlistId: "watch",
    health: {
      connection: "offline",
      reason: null,
      httpStatus: null,
      lastSuccessAt: null,
      rwa: "skipped",
      market: "skipped",
      history: "skipped",
    },
    rows,
    unresolved: [],
    events: [],
    recentEvaluations: [],
    error: null,
  };
}
