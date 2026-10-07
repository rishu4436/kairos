import { transitionPaperLoop } from "@/agent/states";
import type { ArbitrationDecision } from "@/domain/arbitration";
import { scaleDecimal, type Candle } from "@/domain/candle";
import { admitPaperCapability, type ExecutionAuthorityErrorCode, type PaperExecutionCapability } from "@/domain/execution-authority";
import type { ExecutionMode } from "@/domain/execution-mode";
import { realizedVolBps } from "@/domain/features";
import type { AgentId, UserId } from "@/domain/ids";
import type { AgentRuntimeState, PaperAccountState, RiskPolicy } from "@/domain/models";
import { mul, parseDecimal, type Scaled } from "@/domain/money";
import { deterministicPositionManager } from "@/context/position-manager";
import { captureEntrySnapshot } from "@/position/entry";
import { captureCycleSnapshot } from "@/position/diff";
import { rememberDecision } from "@/position/memory";
import { DEFAULT_ADD_POLICY } from "@/position/policy";
import type { PositionDecision } from "@/position/types";
import type { RiskEffect } from "@/risk/validate";
import type { ObservationBoard, ObservationEventView, ObservationRow } from "@/domain/observation";
import { formatClock } from "@/lib/format";
import { summarizePortfolio } from "@/domain/portfolio";
import type { AgentEventType } from "@/domain/events";
import { recordPaperFill } from "@/lifecycle/recorder";
import { openPaperGateway, type PaperExecutionGateway } from "@/paper/gateway";
import { priorPaperFill, rememberPaperFill } from "@/paper/idempotency";
import { createManagementIntent, createTradeIntent, type AgentTradeIntent } from "@/paper/intent";
import { DEFAULT_PAPER_POLICY, type PaperExecutionPolicy } from "@/paper/policy";
import { commitPaperExecution, monitorPositions, type PositionMeta, type PositionOrigin } from "@/paper/positions";
import type { ExecutionRecord } from "@/paper/records";
import type { PaperCycleStep } from "@/domain/paper-cycle-view";
import { assessTradeIntent } from "@/paper/risk-gate";
import { previewPaperExecution, type PaperMarketSnapshot } from "@/paper/simulate";
import { sizePaperOrder } from "@/paper/sizing";
import {
  appendCycleEvent,
  appendRecord,
  dropMeta,
  ensurePaperBook,
  openIntent,
  paperAccountId,
  putMeta,
  readLastIntentAt,
  readPaperBook,
  stampIntent,
  writeAccount,
  writeLoopState,
} from "@/paper/store";
import { buildPaperCycleView, type AssetOutcome } from "@/paper/view";

export interface PreparedCycleInput {
  authority: PaperExecutionCapability;
  userId: UserId;
  agentId: AgentId;
  board: ObservationBoard;
  candles: ReadonlyMap<string, readonly Candle[]>;
  riskPolicy: RiskPolicy;
  paperPolicy?: PaperExecutionPolicy;
  nowMs: number;
  /** Paper-only safety mode. It blocks OPEN and ADD. REDUCE and EXIT still pass risk. */
  safetyMode?: "NORMAL" | "RISK_REDUCTION_ONLY";
}

export interface PaperLoopTransition {
  from: AgentRuntimeState;
  to: AgentRuntimeState;
}

export interface AgentCycleResult {
  ran: boolean;
  reason: string;
  events: ObservationEventView[];
  view: ReturnType<typeof buildPaperCycleView> | null;
  createdIntentIds: string[];
  executionMode: ExecutionMode | null;
  authorityCode: ExecutionAuthorityErrorCode | null;
  executionContextId: string | null;
  loopState: AgentRuntimeState | null;
  transitions: readonly PaperLoopTransition[];
}

export function runPreparedAgentCycle(input: PreparedCycleInput): AgentCycleResult {
  const admitted = admitPaperCapability(input.authority, {
    userId: input.userId,
    agentId: input.agentId,
    nowMs: input.nowMs,
  });
  if (!admitted.ok) {
    return stopped(admitted.message, null, admitted.code);
  }
  if (input.board.dataMode !== "paper" || input.board.rows.some((row) => row.fidelity !== "paper")) {
    return stopped("Live observations are not paper-filled.", "PAPER");
  }
  if (!input.board.ok || input.board.userId !== input.userId) {
    return stopped(input.board.error?.message ?? "No paper observation is available for this user.", "PAPER");
  }
  if (input.riskPolicy.userId !== input.userId || input.riskPolicy.agentId !== input.agentId) {
    return stopped("The risk policy does not belong to this user and agent.", "PAPER");
  }

  const opened = openPaperGateway(admitted.capability, input.nowMs);
  if (!opened.ok) {
    return stopped(opened.message, null, opened.code);
  }
  const paperPolicy = input.paperPolicy ?? DEFAULT_PAPER_POLICY;
  const gateway = opened.gateway;
  const contextId = admitted.capability.context.contextId;
  const book = ensurePaperBook(input.userId, input.agentId, paperPolicy.paperStartingCash);
  const events: ObservationEventView[] = [];
  const outcomes: AssetOutcome[] = [];
  const createdIntentIds: string[] = [];
  const transitions: PaperLoopTransition[] = [];
  const createdAt = new Date(input.nowMs).toISOString();

  for (const row of [...input.board.rows].sort((left, right) => left.ticker.localeCompare(right.ticker))) {
    outcomes.push(evaluateRow(row, input, paperPolicy, gateway, contextId, events, createdIntentIds, transitions));
  }

  const stored = readPaperBook(input.userId, input.agentId) ?? book;
  const loopState = resolveLoopState(stored.account.positions.length > 0, transitions);
  writeLoopState(input.userId, input.agentId, loopState);
  return {
    ran: true,
    reason: "Paper cycle finished.",
    events,
    createdIntentIds,
    executionMode: "PAPER",
    authorityCode: null,
    executionContextId: contextId,
    loopState,
    transitions,
    view: buildPaperCycleView({
      account: stored.account,
      metas: stored.metas,
      records: stored.records,
      outcomes,
      marks: marksFrom(input.board),
      generatedAt: createdAt,
      policyVersion: paperPolicy.version,
      loopState,
    }),
  };
}

function resolveLoopState(positionOpen: boolean, transitions: readonly PaperLoopTransition[]): AgentRuntimeState {
  if (positionOpen) {
    return "MONITORING_POSITION";
  }
  return transitions.at(-1)?.to ?? "WAITING_FOR_RISK";
}

function evaluateRow(
  row: ObservationRow,
  input: PreparedCycleInput,
  paperPolicy: PaperExecutionPolicy,
  gateway: PaperExecutionGateway,
  contextId: string,
  events: ObservationEventView[],
  createdIntentIds: string[],
  transitions: PaperLoopTransition[],
): AssetOutcome {
  let phase: AgentRuntimeState = "WAITING_FOR_RISK";
  const step = (to: AgentRuntimeState): boolean => {
    const moved = transitionPaperLoop(phase, to, "PAPER");
    if (!moved.ok) {
      return false;
    }
    transitions.push({ from: phase, to: moved.state });
    phase = moved.state;
    return true;
  };
  const managedBook = readPaperBook(input.userId, input.agentId);
  const managedHeld = managedBook?.account.positions.find((position) => position.assetSymbol === row.ticker && position.quantity > 0n) ?? null;
  if (managedHeld && row.kairos && managedBook) {
    return manageOpenPosition({
      row,
      input,
      paperPolicy,
      gateway,
      contextId,
      events,
      createdIntentIds,
      step,
      held: managedHeld,
      book: managedBook,
    });
  }
  const decision = row.arbitration;
  const action = decision?.selectedAction;
  const executable =
    decision !== null &&
    (decision.decision === "SELECT_STRATEGY" || decision.decision === "MULTI_STRATEGY_CONFIRMATION") &&
    (action === "BUY" || action === "SELL") &&
    decision.selectedStrategy !== null;
  if (!decision || !executable || !decision.selectedStrategy || (action !== "BUY" && action !== "SELL")) {
    return {
      assetId: row.representationId,
      ticker: row.ticker,
      headline: `${row.ticker} — no executable selection`,
      steps: [
        { label: "Arbitration", state: "skipped", detail: decision ? decision.decision : "No decision" },
        { label: "Trade intent", state: "skipped", detail: action === "HOLD" ? "HOLD is not a trade intent" : "Not created" },
      ],
    };
  }

  const strategyId = decision.selectedStrategy;
  const dedupKey = `${row.representationId}|${strategyId}|${action}`;
  const previous = readLastIntentAt(input.userId, input.agentId, dedupKey);
  if (previous !== null && input.nowMs - previous < paperPolicy.minimumActionIntervalMs) {
    return recall(input, row, "No new intent. The last intent for this strategy is still inside the minimum action interval.");
  }
  if (openIntent(input.userId, input.agentId, row.representationId, input.nowMs)) {
    return recall(input, row, "An unexpired intent already exists for this asset.");
  }

  const book = readPaperBook(input.userId, input.agentId);
  if (!book) {
    return skip(row, `${row.ticker} — no paper book`, "The paper book is missing.");
  }
  const held = book.account.positions.find((position) => position.assetSymbol === row.ticker);
  if (input.safetyMode === "RISK_REDUCTION_ONLY" && action === "BUY") {
    return skip(row, `${row.ticker} — risk reduction only`, "RISK_REDUCTION_ONLY blocks a new long.");
  }
  if (action === "BUY" && held) {
    return recall(input, row, "Re-entry is blocked while this asset is open. One position per asset.");
  }
  if (action === "SELL" && !held) {
    return skip(row, `${row.ticker} — no position`, "A sell requires an open paper position.");
  }

  const observed = row.price === null ? null : scaleDecimal(row.price);
  if (observed === null || observed <= 0n) {
    return skip(row, `${row.ticker} — no price`, "The observation has no usable price.");
  }
  const summary = summarizePortfolio(book.account);
  const sized = sizePaperOrder({
    action,
    observedPrice: observed,
    cash: book.account.cash,
    equity: summary.equity,
    invested: summary.invested,
    heldQuantity: held?.quantity ?? 0n,
    existingMarketValue: held ? mul(held.currentPrice, held.quantity) : 0n,
    riskPolicy: input.riskPolicy,
    paperPolicy,
  });
  if (!sized.ok) {
    const detail =
      sized.reason === "ALLOCATION_EXCEEDED"
        ? "Allocation limit leaves no room for another buy."
        : sized.reason === "NO_POSITION"
          ? "A sell requires an open paper position."
          : "The sized order is below the paper minimum.";
    return skip(row, `${row.ticker} — ${sized.reason}`, detail);
  }

  const correlationId = `corr_${input.userId}_${row.representationId}_${decision.timestamp}_${action}`;
  const created = createTradeIntent({
    userId: input.userId,
    agentId: input.agentId,
    accountId: paperAccountId(input.userId),
    decision,
    observation: {
      assetId: row.representationId,
      ticker: row.ticker,
      userId: input.userId,
      observedPrice: observed,
      referencePrice: row.referencePrice === null ? null : scaleDecimal(row.referencePrice),
      priceTimestamp: row.sourceTimestamp ?? row.receivedAt,
    },
    riskPolicy: input.riskPolicy,
    quantity: sized.quantity,
    notional: sized.notional,
    paperPolicy,
    nowMs: input.nowMs,
    correlationId,
    cycleId: row.kairos?.cycleId,
    strategyVersion: row.kairos?.strategySignals.value?.signals.find((item) => item.strategyId === strategyId)?.version ?? "1",
  });
  if (!created.ok) {
    return skip(row, `${row.ticker} — intent refused`, created.reason);
  }

  return completePaperIntent({
    row,
    input,
    paperPolicy,
    gateway,
    contextId,
    events,
    createdIntentIds,
    step,
    intent: created.intent,
    arbitration: decision,
    action,
    strategyId,
    heldQuantity: held?.quantity ?? 0n,
    dedupKey,
    book,
    observed,
    riskEffect: action === "BUY" ? "INCREASE_RISK" : "CLOSE_RISK",
    positionDecision: null,
    headline: `${row.ticker} — ${decision.selectedStrategyName ?? strategyId} selected`,
  });
}

function completePaperIntent(args: {
  row: ObservationRow;
  input: PreparedCycleInput;
  paperPolicy: PaperExecutionPolicy;
  gateway: PaperExecutionGateway;
  contextId: string;
  events: ObservationEventView[];
  createdIntentIds: string[];
  step: (to: AgentRuntimeState) => boolean;
  intent: AgentTradeIntent;
  arbitration: ArbitrationDecision;
  action: "BUY" | "SELL";
  strategyId: string;
  heldQuantity: Scaled;
  dedupKey: string;
  book: NonNullable<ReturnType<typeof readPaperBook>>;
  observed: Scaled;
  riskEffect: RiskEffect;
  positionDecision: PositionDecision | null;
  headline: string;
}): AssetOutcome {
  const {
    row,
    input,
    paperPolicy,
    gateway,
    contextId,
    events,
    createdIntentIds,
    step,
    intent,
    arbitration,
    action,
    strategyId,
    heldQuantity,
    dedupKey,
    book,
    observed,
    riskEffect,
    positionDecision,
    headline,
  } = args;
  const correlationId = intent.correlationId;
  const noted = (steps: AssetOutcome["steps"]): AssetOutcome["steps"] =>
    positionDecision
      ? [
          {
            label: "Position decision",
            state: "done",
            detail: `${positionDecision.action} · ${positionDecision.positionState} · ${positionDecision.reasonCodes.join(", ")}`,
          },
          ...steps,
        ]
      : steps;
  createdIntentIds.push(intent.intentId);
  const snapshot = snapshotOf(row, input, observed);
  if (positionDecision) {
    emit(events, input, row, correlationId, "POSITION_INTENT_CREATED", `${row.ticker} position intent created`, {
      action: positionDecision.action,
      decisionId: positionDecision.decisionId,
      positionId: positionDecision.positionId ?? "",
      cycleId: positionDecision.cycleId,
    });
  }
  emit(events, input, row, correlationId, "TRADE_INTENT_CREATED", `${row.ticker} trade intent created`, {
    action,
    strategyId,
  });
  emit(events, input, row, correlationId, "RISK_CHECK_STARTED", `${row.ticker} risk check started`, null);
  const risk = assessTradeIntent(
    intent,
    input.riskPolicy,
    book.account,
    input.nowMs,
    riskEffect,
  );
  if (!risk.allowed) {
    const expired = risk.reasonCodes.includes("EXPIRED_INTENT");
    intent.status = expired ? "EXPIRED" : "RISK_REJECTED";
    if (expired) {
      emit(events, input, row, correlationId, "TRADE_INTENT_EXPIRED", `${row.ticker} trade intent expired`, {
        cause: "expiration",
        reasons: risk.reasonCodes.join(","),
      });
    } else {
      emit(events, input, row, correlationId, "RISK_REJECTED", `${row.ticker} risk rejected`, {
        cause: "risk_rejection",
        reasons: risk.reasonCodes.join(","),
      });
    }
    save(input, arbitration, intent, risk, null, null, null, null, contextId);
    stampIntent(input.userId, input.agentId, dedupKey, input.nowMs);
    return {
      assetId: row.representationId,
      ticker: row.ticker,
      headline,
      steps: [
        { label: "Trade intent created", state: "done", detail: action },
        { label: "Risk", state: "failed", detail: risk.reasonCodes.join(", ") },
        { label: "Simulation", state: "skipped", detail: "Stopped" },
        { label: "Paper execution", state: "skipped", detail: "Stopped" },
      ],
    };
  }

  if (!step("SIMULATING")) {
    return skip(row, `${row.ticker} — paper state refused`, "The paper loop refused to enter simulation.");
  }
  intent.status = "SIMULATION_PENDING";
  emit(events, input, row, correlationId, "RISK_APPROVED", `${row.ticker} risk passed`, null);
  emit(events, input, row, correlationId, "PAPER_SIMULATION_STARTED", `${row.ticker} paper simulation started`, null);
  const preview = previewPaperExecution({
    intent,
    snapshot,
    policy: paperPolicy,
    nowMs: input.nowMs,
    cash: book.account.cash,
    heldQuantity,
    authority: input.authority,
  });
  if (preview.status !== "PASS") {
    intent.status = "SIMULATION_REJECTED";
    step("OBSERVING");
    emit(events, input, row, correlationId, "PAPER_SIMULATION_FAILED", `${row.ticker} paper simulation failed`, {
      reasons: preview.reasons.join(" "),
    });
    save(input, arbitration, intent, risk, preview, null, null, null, contextId);
    stampIntent(input.userId, input.agentId, dedupKey, input.nowMs);
    return {
      assetId: row.representationId,
      ticker: row.ticker,
      headline,
      steps: [
        { label: "Trade intent created", state: "done", detail: action },
        { label: "Risk", state: "done", detail: "PASSED" },
        { label: "Simulation", state: "failed", detail: preview.reasons[0] ?? "FAILED" },
        { label: "Paper execution", state: "skipped", detail: "Stopped" },
      ],
    };
  }

  if (!step("PAPER_EXECUTING")) {
    return skip(row, `${row.ticker} — paper state refused`, "The paper loop refused to enter paper execution.");
  }
  intent.status = "READY_FOR_PAPER";
  emit(events, input, row, correlationId, "PAPER_SIMULATION_PASSED", `${row.ticker} paper simulation passed`, {
    executionContextId: contextId,
  });
  const executed = gateway.execute({
    intent,
    risk,
    snapshot,
    policy: paperPolicy,
    nowMs: input.nowMs,
    cash: book.account.cash,
    heldQuantity,
  });
  const execution = executed.execution;
  if (priorPaperFill(intent.intentId)) {
    intent.status = "PAPER_EXECUTED";
    step(heldQuantity > 0n ? "MONITORING_POSITION" : "OBSERVING");
    return {
      assetId: row.representationId,
      ticker: row.ticker,
      headline: `${row.ticker} — idempotent fill`,
      steps: noted([
        { label: "Trade intent created", state: "done", detail: action },
        { label: "Paper execution", state: "done", detail: "IDEMPOTENT" },
      ]),
    };
  }
  const safeFill =
    execution.status === "FILLED" &&
    execution.broadcast === false &&
    execution.chainTransactionId === null &&
    execution.signature === null &&
    executed.disconnected !== true &&
    gateway.kind === "paper";
  if (!safeFill) {
    intent.status = execution.status === "EXPIRED" ? "EXPIRED" : "CANCELLED";
    if (execution.status === "EXPIRED") {
      emit(events, input, row, correlationId, "TRADE_INTENT_EXPIRED", `${row.ticker} trade intent expired`, {
        cause: "expiration",
        reasons: "EXPIRED",
      });
    }
    step("OBSERVING");
    save(input, arbitration, intent, risk, executed.simulation, execution, null, null, contextId);
    stampIntent(input.userId, input.agentId, dedupKey, input.nowMs);
    return {
      assetId: row.representationId,
      ticker: row.ticker,
      headline: `${row.ticker} — execution stopped`,
      steps: [
        { label: "Trade intent created", state: "done", detail: action },
        { label: "Risk", state: "done", detail: "PASSED" },
        { label: "Simulation", state: "done", detail: "PASSED" },
        { label: "Paper execution", state: "failed", detail: execution.status },
      ],
    };
  }

  const committed = commitPaperExecution(book.account, execution, intent);
  if (!committed.ok) {
    intent.status = "CANCELLED";
    step("OBSERVING");
    save(input, arbitration, intent, risk, executed.simulation, execution, null, null, contextId);
    stampIntent(input.userId, input.agentId, dedupKey, input.nowMs);
    return {
      assetId: row.representationId,
      ticker: row.ticker,
      headline: `${row.ticker} — ledger rejected the fill`,
      steps: [
        { label: "Trade intent created", state: "done", detail: action },
        { label: "Risk", state: "done", detail: "PASSED" },
        { label: "Simulation", state: "done", detail: "PASSED" },
        { label: "Paper execution", state: "failed", detail: committed.reason },
      ],
    };
  }

  writeAccount(input.userId, input.agentId, committed.state);
  rememberPaperFill(intent.intentId, execution.executionId);
  const stillOpen = committed.state.positions.some((position) => position.assetSymbol === row.ticker);
  let meta = nextMeta(
    book.metas.get(row.ticker),
    row.representationId,
    {
      strategyId,
      arbitrationDecisionId: intent.arbitrationDecisionId,
      intentId: intent.intentId,
      executionId: execution.executionId,
      correlationId,
    },
    execution.timestamp,
    action,
    row,
    intent.intentId.includes("_pos_") && action === "SELL" ? intent.reason.split(", ").filter((item) => item.length > 0) : [],
  );
  if (meta && positionDecision && row.kairos) {
    meta = rememberDecision(meta, positionDecision, captureCycleSnapshot(row.kairos), row.price);
  }
  if (stillOpen && meta) {
    putMeta(input.userId, input.agentId, row.ticker, meta);
  } else {
    dropMeta(input.userId, input.agentId, row.ticker);
  }
  step(stillOpen ? "MONITORING_POSITION" : "OBSERVING");
  intent.status = "PAPER_EXECUTED";
  const marked = monitorPositions(committed.state, latestMetas(input), marksFrom(input.board)).find((position) => position.ticker === row.ticker) ?? null;
  const closedPnl = committed.state.trades.at(-1)?.realizedPnl ?? null;
  emit(events, input, row, correlationId, "PAPER_EXECUTED", `${row.ticker} paper fill`, {
    status: "FILLED",
    executionContextId: contextId,
  });
  emit(events, input, row, correlationId, "POSITION_UPDATED", `${row.ticker} paper position updated`, null);
  if (positionDecision?.action === "ADD") {
    emit(events, input, row, correlationId, "POSITION_ADD_EXECUTED", `${row.ticker} position add filled`, decisionMetadata(positionDecision));
  } else if (positionDecision?.action === "REDUCE") {
    emit(events, input, row, correlationId, "POSITION_REDUCE_EXECUTED", `${row.ticker} position reduce filled`, decisionMetadata(positionDecision));
  } else if (positionDecision?.action === "EXIT") {
    emit(events, input, row, correlationId, "POSITION_EXIT_EXECUTED", `${row.ticker} position exit filled`, decisionMetadata(positionDecision));
  }
  if (positionDecision && !stillOpen) {
    emit(events, input, row, correlationId, "POSITION_CLOSED", `${row.ticker} position closed`, decisionMetadata(positionDecision));
  }
  save(input, arbitration, intent, risk, executed.simulation, execution, marked, marked ? marked.unrealizedPnl : closedPnl, contextId);
  try {
    recordPaperFill({
      userId: input.userId,
      strategyId,
      strategyVersion: intent.position.strategyVersion,
      assetId: row.representationId,
      session: row.session,
      regime: row.regime,
      nowMs: input.nowMs,
      net: closedPnl,
      gross: closedPnl,
      correlationId,
      intentId: intent.intentId,
      executionId: execution.executionId,
    });
  } catch {
    // A replay or an older clock does not undo a fill that is already committed.
  }
  stampIntent(input.userId, input.agentId, dedupKey, input.nowMs);
  return {
    assetId: row.representationId,
    ticker: row.ticker,
    headline,
    steps: noted([
      { label: "Trade intent created", state: "done", detail: action },
      { label: "Risk", state: "done", detail: "PASSED" },
      { label: "Simulation", state: "done", detail: "PASSED" },
      { label: "Paper execution", state: "done", detail: "FILLED" },
      { label: "Position updated", state: "done", detail: marked ? "Open" : "Closed" },
    ]),
  };
}

function manageOpenPosition(args: {
  row: ObservationRow;
  input: PreparedCycleInput;
  paperPolicy: PaperExecutionPolicy;
  gateway: PaperExecutionGateway;
  contextId: string;
  events: ObservationEventView[];
  createdIntentIds: string[];
  step: (to: AgentRuntimeState) => boolean;
  held: PaperAccountState["positions"][number];
  book: NonNullable<ReturnType<typeof readPaperBook>>;
}): AssetOutcome {
  const { row, input, paperPolicy, gateway, contextId, events, createdIntentIds, step, held, book } = args;
  const context = row.kairos;
  if (!context) {
    return recall(input, row, "Position manager needs a KAIROS context.");
  }
  const decision = deterministicPositionManager.evaluatePosition(context);
  const meta = book.metas.get(row.ticker);
  emitPositionReview(events, input, row, decision);
  if (decision.action === "HOLD" || decision.action === "BLOCKED") {
    if (meta) {
      putMeta(
        input.userId,
        input.agentId,
        row.ticker,
        rememberDecision(meta, decision, captureCycleSnapshot(context), row.price),
      );
    }
    const recalled = recall(input, row, decision.action === "HOLD" ? "Position held." : decision.reasonCodes.join(", "));
    return {
      ...recalled,
      steps: [
        ...recalled.steps,
        {
          label: "Position decision",
          state: "done",
          detail: `${decision.action} · ${decision.positionState} · ${decision.reasonCodes.join(", ")}`,
        },
      ],
    };
  }
  if (input.safetyMode === "RISK_REDUCTION_ONLY" && decision.action === "ADD") {
    const recalled = recall(input, row, "RISK_REDUCTION_ONLY blocks an add.");
    return {
      ...recalled,
      steps: [
        ...recalled.steps,
        { label: "Position decision", state: "skipped", detail: "ADD blocked by RISK_REDUCTION_ONLY" },
      ],
    };
  }
  const arbitration = row.arbitration;
  if (!arbitration || decision.riskEffect === "NONE") {
    const recalled = recall(input, row, "The position decision was not executed.");
    return {
      ...recalled,
      steps: [
        ...recalled.steps,
        {
          label: "Position decision",
          state: "skipped",
          detail: `${decision.action} · ${decision.reasonCodes.join(", ")}`,
        },
      ],
    };
  }
  if (openIntent(input.userId, input.agentId, row.representationId, input.nowMs)) {
    return recall(input, row, "An unexpired intent already exists for this asset.");
  }
  const observed = row.price === null ? null : scaleDecimal(row.price);
  if (observed === null || observed <= 0n) {
    return recall(input, row, "The observation has no usable price.");
  }
  const summary = summarizePortfolio(book.account);
  const action = decision.action === "ADD" ? "BUY" : "SELL";
  const sized = sizePaperOrder({
    action,
    observedPrice: observed,
    cash: book.account.cash,
    equity: summary.equity,
    invested: summary.invested,
    heldQuantity: held.quantity,
    existingMarketValue: mul(held.currentPrice, held.quantity),
    riskPolicy: input.riskPolicy,
    paperPolicy,
    reduceBps: decision.action === "REDUCE" ? decision.reductionBps : null,
    maxIncrementalNotional: decision.action === "ADD" ? parseDecimal(DEFAULT_ADD_POLICY.maxIncrementalNotional) : null,
  });
  if (!sized.ok) {
    const recalled = recall(input, row, sized.reason);
    return {
      ...recalled,
      steps: [
        ...recalled.steps,
        {
          label: "Position decision",
          state: "done",
          detail: `${decision.action} · ${decision.reasonCodes.join(", ")}`,
        },
        { label: "Trade intent", state: "skipped", detail: sized.reason },
      ],
    };
  }
  const strategyId = decision.originStrategyId ?? meta?.strategyId ?? held.strategyId ?? "unattributed";
  const correlationId = `corr_${input.userId}_${row.representationId}_${decision.decisionId}_${action}`;
  const created = createManagementIntent({
    userId: input.userId,
    agentId: input.agentId,
    accountId: paperAccountId(input.userId),
    action,
    strategyId,
    assetId: row.representationId,
    ticker: row.ticker,
    observedPrice: observed,
    referencePrice: row.referencePrice === null ? null : scaleDecimal(row.referencePrice),
    priceTimestamp: row.sourceTimestamp ?? row.receivedAt,
    riskPolicy: input.riskPolicy,
    quantity: sized.quantity,
    notional: sized.notional,
    paperPolicy,
    nowMs: input.nowMs,
    correlationId,
    decisionId: decision.decisionId,
    reason: decision.reasonCodes.join(", "),
    kind: decision.action === "ADD" ? "ADD" : decision.action === "REDUCE" ? "REDUCE" : "EXIT",
    strategyVersion: decision.originStrategyVersion ?? meta?.strategyVersion ?? "1",
    positionId: decision.positionId ?? held.id,
    cycleId: decision.cycleId,
  });
  if (!created.ok) {
    return recall(input, row, created.reason);
  }
  return completePaperIntent({
    row,
    input,
    paperPolicy,
    gateway,
    contextId,
    events,
    createdIntentIds,
    step,
    intent: created.intent,
    arbitration,
    action,
    strategyId,
    heldQuantity: held.quantity,
    dedupKey: `${row.representationId}|${strategyId}|${decision.action}`,
    book,
    observed,
    riskEffect: decision.riskEffect === "INCREASE_RISK" ? "INCREASE_RISK" : decision.riskEffect === "CLOSE_RISK" ? "CLOSE_RISK" : "REDUCE_RISK",
    positionDecision: decision,
    headline: `${row.ticker} — position ${decision.action}`,
  });
}

function nextMeta(
  existing: PositionMeta | undefined,
  assetId: string,
  origin: PositionOrigin,
  at: string,
  action: "BUY" | "SELL",
  row: ObservationRow,
  appliedReductions: readonly string[],
): PositionMeta | null {
  if (action === "SELL" && !existing) {
    return null;
  }
  if (existing && action === "BUY") {
    return {
      ...existing,
      updatedAt: at,
      addCount: existing.addCount + 1,
      lastAddAt: at,
      lifecycle: "OPEN",
    };
  }
  if (existing) {
    return {
      ...existing,
      updatedAt: at,
      lifecycle: "OPEN",
      reduceCount: existing.reduceCount + 1,
      lastReduceAt: at,
      appliedReductions: [...new Set([...existing.appliedReductions, ...appliedReductions])],
    };
  }
  const version = row.kairos?.strategySignals.value?.signals.find((item) => item.strategyId === origin.strategyId)?.version ?? null;
  const entryPrice = row.price && row.price.trim().length > 0 ? row.price : null;
  const entry = row.kairos && entryPrice ? captureEntrySnapshot(row.kairos, origin.strategyId, entryPrice, at) : null;
  return {
    assetId,
    tokenizedRepresentationId: assetId,
    openedAt: at,
    updatedAt: at,
    strategyVersion: version,
    lifecycle: "OPEN",
    addCount: 0,
    lastAddAt: null,
    reduceCount: 0,
    lastReduceAt: null,
    lastDecision: null,
    lastDecisionAt: null,
    thesisState: null,
    entryContextId: entry?.entryContextId ?? null,
    highestMark: entryPrice,
    previousSnapshot: null,
    alternateStrategyId: null,
    exitClass: null,
    lastReasonCodes: [],
    appliedReductions: [],
    entry,
    ...origin,
  };
}

function latestMetas(input: PreparedCycleInput): ReadonlyMap<string, PositionMeta> {
  return readPaperBook(input.userId, input.agentId)?.metas ?? new Map();
}

function save(
  input: PreparedCycleInput,
  decision: ArbitrationDecision,
  intent: AgentTradeIntent,
  risk: ReturnType<typeof assessTradeIntent>,
  simulation: ExecutionRecord["simulation"],
  execution: ExecutionRecord["execution"],
  position: ExecutionRecord["position"],
  bookedPnl: Scaled | null,
  executionContextId: string,
): void {
  const record: ExecutionRecord = {
    correlationId: intent.correlationId,
    executionContextId,
    userId: input.userId,
    agentId: input.agentId,
    assetId: intent.assetId,
    ticker: intent.ticker,
    strategyId: intent.strategyId,
    strategyName: decision.selectedStrategyName ?? intent.strategyId,
    arbitration: decision,
    intent,
    risk,
    simulation,
    execution,
    position,
    bookedPnl,
    createdAt: intent.createdAt,
  };
  appendRecord(input.userId, input.agentId, record);
}

function snapshotOf(row: ObservationRow, input: PreparedCycleInput, observed: Scaled): PaperMarketSnapshot {
  const candles = input.candles.get(row.representationId) ?? [];
  const vol = realizedVolBps(candles, 20);
  return {
    assetId: row.representationId,
    ticker: row.ticker,
    userId: input.userId,
    observedPrice: observed,
    referencePrice: row.referencePrice === null ? null : scaleDecimal(row.referencePrice),
    priceTimestamp: row.sourceTimestamp ?? row.receivedAt,
    volatilityBps: vol === null ? null : Number(vol),
    supported: input.riskPolicy.allowedAssets.includes(row.ticker),
  };
}

function marksFrom(board: ObservationBoard): Record<string, Scaled> {
  const marks: Record<string, Scaled> = {};
  for (const row of board.rows) {
    if (row.price === null) {
      continue;
    }
    const price = scaleDecimal(row.price);
    if (price !== null && price > 0n) {
      marks[row.ticker] = price;
    }
  }
  return marks;
}

function skip(row: ObservationRow, headline: string, detail: string): AssetOutcome {
  return {
    assetId: row.representationId,
    ticker: row.ticker,
    headline,
    steps: [
      { label: "Trade intent", state: "skipped", detail },
      { label: "Risk", state: "skipped", detail: "Not run" },
      { label: "Paper execution", state: "skipped", detail: "Not run" },
    ],
  };
}

function decisionMetadata(decision: PositionDecision): Record<string, string> {
  return {
    cycleId: decision.cycleId,
    positionId: decision.positionId ?? "",
    decisionId: decision.decisionId,
    reasons: decision.reasonCodes.join(","),
  };
}

function emitPositionReview(
  events: ObservationEventView[],
  input: PreparedCycleInput,
  row: ObservationRow,
  decision: PositionDecision,
): void {
  const metadata = decisionMetadata(decision);
  emit(events, input, row, decision.correlationId, "POSITION_REVIEW_STARTED", `${row.ticker} position review started`, metadata);
  if (decision.action === "HOLD") {
    emit(events, input, row, decision.correlationId, "POSITION_DECISION_RECORDED", `${row.ticker} position decision recorded`, metadata);
    emit(events, input, row, decision.correlationId, "POSITION_DECISION_HOLD", `${row.ticker} position hold`, metadata);
    return;
  }
  if (decision.action === "BLOCKED") {
    emit(events, input, row, decision.correlationId, "POSITION_DECISION_BLOCKED", `${row.ticker} position blocked: ${decision.reasonCodes.join(", ")}`, metadata);
    return;
  }
  const type =
    decision.action === "ADD" ? "POSITION_DECISION_ADD" : decision.action === "REDUCE" ? "POSITION_DECISION_REDUCE" : "POSITION_DECISION_EXIT";
  emit(events, input, row, decision.correlationId, type, `${row.ticker} position ${decision.action.toLowerCase()}`, metadata);
}

function emit(
  events: ObservationEventView[],
  input: PreparedCycleInput,
  row: ObservationRow,
  correlationId: string,
  type: AgentEventType,
  message: string,
  metadata: Record<string, string> | null,
): void {
  const at = new Date(input.nowMs).toISOString();
  const event: ObservationEventView = {
    id: `${at}:${type}:${correlationId}:${message}`,
    at,
    clock: formatClock(at),
    type,
    message,
    userId: input.userId,
    agentId: input.agentId,
    assetId: row.representationId,
    correlationId,
    metadata: metadata ?? undefined,
  };
  events.push(event);
  appendCycleEvent(input.userId, input.agentId, event);
}

function recall(input: PreparedCycleInput, row: ObservationRow, detail: string): AssetOutcome {
  const prior = readPaperBook(input.userId, input.agentId)
    ?.records.filter((record) => record.assetId === row.representationId)
    .at(-1);
  if (!prior) {
    return skip(row, `${row.ticker} — ${detail}`, detail);
  }
  return {
    assetId: row.representationId,
    ticker: row.ticker,
    headline: `${row.ticker} — ${prior.strategyName} selected`,
    steps: [...stepsFromRecord(prior), { label: "This pass", state: "skipped", detail }],
  };
}

function stepsFromRecord(record: ExecutionRecord): PaperCycleStep[] {
  const steps: PaperCycleStep[] = [{ label: "Trade intent created", state: "done", detail: record.intent.action }];
  if (!record.risk.allowed) {
    steps.push({ label: "Risk", state: "failed", detail: record.risk.reasonCodes.join(", ") || record.intent.status });
    steps.push({ label: "Simulation", state: "skipped", detail: "Stopped" });
    steps.push({ label: "Paper execution", state: "skipped", detail: "Stopped" });
    return steps;
  }
  steps.push({ label: "Risk", state: "done", detail: "PASSED" });
  if (record.simulation?.status !== "PASS") {
    steps.push({ label: "Simulation", state: "failed", detail: record.simulation?.reasons[0] ?? "FAILED" });
    steps.push({ label: "Paper execution", state: "skipped", detail: "Stopped" });
    return steps;
  }
  steps.push({ label: "Simulation", state: "done", detail: "PASSED" });
  if (record.execution?.status === "FILLED") {
    steps.push({ label: "Paper execution", state: "done", detail: "FILLED" });
    steps.push({ label: "Position updated", state: "done", detail: record.position ? "Open" : "Closed" });
    return steps;
  }
  steps.push({ label: "Paper execution", state: "failed", detail: record.execution?.status ?? "Stopped" });
  return steps;
}

function stopped(
  reason: string,
  executionMode: ExecutionMode | null = null,
  authorityCode: ExecutionAuthorityErrorCode | null = null,
): AgentCycleResult {
  return {
    ran: false,
    reason,
    events: [],
    view: null,
    createdIntentIds: [],
    executionMode,
    authorityCode,
    executionContextId: null,
    loopState: null,
    transitions: [],
  };
}
