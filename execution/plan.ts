import { deterministicPositionManager } from "@/context/position-manager";
import type { ArbitrationDecision } from "@/domain/arbitration";
import { scaleDecimal, type Candle } from "@/domain/candle";
import { classifySeries } from "@/domain/candle-quality";
import type { AgentId, UserId } from "@/domain/ids";
import type { PaperAccountState, RiskPolicy, TradeVenue } from "@/domain/models";
import { formatDecimal, mul, parseDecimal, type Scaled } from "@/domain/money";
import type { ObservationRow } from "@/domain/observation";
import { summarizePortfolio } from "@/domain/portfolio";
import { createManagementIntent, createTradeIntent, type AgentTradeIntent } from "@/paper/intent";
import { DEFAULT_PAPER_POLICY, type PaperExecutionPolicy } from "@/paper/policy";
import { assessTradeIntent, type StructuredRiskDecision } from "@/paper/risk-gate";
import { sizePaperOrder } from "@/paper/sizing";
import { paperAccountId } from "@/paper/store";
import { DEFAULT_ADD_POLICY } from "@/position/policy";
import type { PositionDecision } from "@/position/types";
import type { RiskEffect } from "@/risk/validate";
import type { OperatorConfig } from "@/operator/config";
import { capTradeNotional } from "@/execution/capital";
import { dcaEligibleKey, emptyDcaState, readDcaState, writeDcaState } from "@/strategies/dca-state";

export interface IntentPlanInput {
  userId: UserId;
  agentId: AgentId;
  row: ObservationRow;
  account: PaperAccountState;
  riskPolicy: RiskPolicy;
  paperPolicy?: PaperExecutionPolicy;
  nowMs: number;
  safetyMode?: "NORMAL" | "RISK_REDUCTION_ONLY";
  venue: TradeVenue;
  candles?: ReadonlyMap<string, readonly Candle[]>;
  operatorConfig?: OperatorConfig;
}

export type IntentPlan =
  | {
      kind: "NO_TRADE";
      ticker: string;
      assetId: string;
      reason: string;
      arbitration: ArbitrationDecision | null;
      positionDecision: PositionDecision | null;
    }
  | {
      kind: "READY";
      ticker: string;
      assetId: string;
      intent: AgentTradeIntent;
      risk: StructuredRiskDecision;
      action: "BUY" | "SELL";
      strategyId: string;
      riskEffect: RiskEffect;
      observed: Scaled;
      arbitration: ArbitrationDecision;
      positionDecision: PositionDecision | null;
      heldQuantity: Scaled;
      dedupKey: string;
    };

export const MARKET_DATA_SUSPICIOUS = "MARKET_DATA_SUSPICIOUS";

/** Shared arbitration → position/sizing → intent → risk. Paper and live consume this plan. */
export function planAssetIntent(input: IntentPlanInput): IntentPlan {
  const row = input.row;
  const paperPolicy = input.paperPolicy ?? DEFAULT_PAPER_POLICY;
  const quality = row.dataQuality;
  if (quality === "STALE" || quality === "INSUFFICIENT") {
    return skip(row, "Market data quality blocks execution.");
  }
  if (row.arbitration?.decision === "DATA_BLOCKED") {
    return skip(row, "Arbitration blocked on data quality.");
  }
  const candles = input.candles?.get(row.representationId) ?? [];
  const barClass = classifySeries(candles);
  const liveGate = input.venue === "live" || row.fidelity === "live";
  if (liveGate && barClass === "SUSPICIOUS") {
    return skip(row, MARKET_DATA_SUSPICIOUS);
  }
  if (liveGate && barClass === "INVALID") {
    return skip(row, "Market data quality blocks execution.");
  }
  const held = input.account.positions.find((position) => position.assetSymbol === row.ticker && position.quantity > 0n) ?? null;
  if (held && row.kairos) {
    return planOpenPosition(input, held, paperPolicy);
  }
  return planEntry(input, held, paperPolicy);
}

function planEntry(
  input: IntentPlanInput,
  held: PaperAccountState["positions"][number] | null,
  paperPolicy: PaperExecutionPolicy,
): IntentPlan {
  const row = input.row;
  const decision = row.arbitration;
  const action = decision?.selectedAction;
  const executable =
    decision !== null &&
    (decision.decision === "SELECT_STRATEGY" || decision.decision === "MULTI_STRATEGY_CONFIRMATION") &&
    (action === "BUY" || action === "SELL") &&
    decision.selectedStrategy !== null;
  if (!decision || !executable || !decision.selectedStrategy || (action !== "BUY" && action !== "SELL")) {
    return skip(row, action === "HOLD" ? "HOLD is not a trade intent" : "No executable selection");
  }
  if (input.operatorConfig?.executionAdmissionDisabled) {
    return skip(row, "EXECUTION_DISABLED");
  }
  if (input.safetyMode === "RISK_REDUCTION_ONLY" && action === "BUY") {
    return skip(row, "RISK_REDUCTION_ONLY blocks a new long.");
  }
  if (action === "BUY" && held) {
    return skip(row, "Re-entry is blocked while this asset is open. One position per asset.");
  }
  if (action === "SELL" && !held) {
    return skip(row, "no position");
  }
  const observed = row.price === null ? null : scaleDecimal(row.price);
  if (observed === null || observed <= 0n) {
    return skip(row, "The observation has no usable price.");
  }
  const summary = summarizePortfolio(input.account);
  const sized = sizePaperOrder({
    action,
    observedPrice: observed,
    cash: input.account.cash,
    equity: summary.equity,
    invested: summary.invested,
    heldQuantity: held?.quantity ?? 0n,
    existingMarketValue: held ? mul(held.currentPrice, held.quantity) : 0n,
    riskPolicy: input.riskPolicy,
    paperPolicy,
  });
  if (!sized.ok) {
    return skip(row, sized.reason);
  }
  if (action === "BUY" && input.operatorConfig) {
    const reserved = parseDecimal(input.operatorConfig.capital.reserveCapitalNotional);
    const deployable = input.account.cash - reserved;
    const capped = capTradeNotional({
      proposed: sized.notional,
      config: input.operatorConfig,
      strategyId: decision.selectedStrategy,
      remainingDeployable: deployable > 0n ? deployable : 0n,
      remainingPosition: input.riskPolicy.maxPositionNotional - (held ? mul(held.currentPrice, held.quantity) : 0n),
      remainingAllocation: summary.equity > 0n ? (summary.equity * BigInt(input.riskPolicy.maxAllocationBps)) / 10_000n - summary.invested : 0n,
      availableBalance: input.account.cash,
    });
    if (!capped.ok) {
      return skip(row, capped.reason);
    }
    if (capped.notional < sized.notional) {
      const resized = sizePaperOrder({
        action,
        observedPrice: observed,
        cash: input.account.cash,
        equity: summary.equity,
        invested: summary.invested,
        heldQuantity: held?.quantity ?? 0n,
        existingMarketValue: held ? mul(held.currentPrice, held.quantity) : 0n,
        riskPolicy: input.riskPolicy,
        paperPolicy,
        maxIncrementalNotional: capped.notional,
      });
      if (!resized.ok) {
        return skip(row, resized.reason);
      }
      Object.assign(sized, resized);
    }
  }
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
    correlationId: `corr_${input.userId}_${row.representationId}_${decision.timestamp}_${action}`,
    cycleId: row.kairos?.cycleId,
    strategyVersion: row.kairos?.strategySignals.value?.signals.find((item) => item.strategyId === decision.selectedStrategy)?.version ?? "1",
  });
  if (!created.ok) {
    return skip(row, created.reason);
  }
  const risk = assessTradeIntent(created.intent, input.riskPolicy, input.account, input.nowMs, action === "BUY" ? "INCREASE_RISK" : "CLOSE_RISK", input.venue);
  if (risk.allowed && decision.selectedStrategy === "dca" && input.operatorConfig) {
    admitDcaTranche(input, row.representationId, row.ticker, observed, sized.notional);
  }
  return {
    kind: "READY",
    ticker: row.ticker,
    assetId: row.representationId,
    intent: created.intent,
    risk,
    action,
    strategyId: decision.selectedStrategy,
    riskEffect: action === "BUY" ? "INCREASE_RISK" : "CLOSE_RISK",
    observed,
    arbitration: decision,
    positionDecision: null,
    heldQuantity: held?.quantity ?? 0n,
    dedupKey: `${row.representationId}|${decision.selectedStrategy}|${action}`,
  };
}

function planOpenPosition(
  input: IntentPlanInput,
  held: PaperAccountState["positions"][number],
  paperPolicy: PaperExecutionPolicy,
): IntentPlan {
  const row = input.row;
  const context = row.kairos;
  if (!context) {
    return skip(row, "Position manager needs a KAIROS context.");
  }
  const decision = deterministicPositionManager.evaluatePosition(context);
  if (decision.action === "HOLD" || decision.action === "BLOCKED") {
    return {
      kind: "NO_TRADE",
      ticker: row.ticker,
      assetId: row.representationId,
      reason: decision.action === "HOLD" ? "Position held." : decision.reasonCodes.join(", "),
      arbitration: row.arbitration,
      positionDecision: decision,
    };
  }
  if (input.safetyMode === "RISK_REDUCTION_ONLY" && decision.action === "ADD") {
    return skip(row, "RISK_REDUCTION_ONLY blocks an add.", decision);
  }
  const arbitration = row.arbitration;
  if (!arbitration || decision.riskEffect === "NONE") {
    return skip(row, "The position decision was not executed.", decision);
  }
  const observed = row.price === null ? null : scaleDecimal(row.price);
  if (observed === null || observed <= 0n) {
    return skip(row, "The observation has no usable price.", decision);
  }
  const summary = summarizePortfolio(input.account);
  const action = decision.action === "ADD" ? "BUY" : "SELL";
  const sized = sizePaperOrder({
    action,
    observedPrice: observed,
    cash: input.account.cash,
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
    return skip(row, sized.reason, decision);
  }
  const strategyId = decision.originStrategyId ?? held.strategyId ?? "unattributed";
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
    correlationId: `corr_${input.userId}_${row.representationId}_${decision.decisionId}_${action}`,
    decisionId: decision.decisionId,
    reason: decision.reasonCodes.join(", "),
    kind: decision.action === "ADD" ? "ADD" : decision.action === "REDUCE" ? "REDUCE" : "EXIT",
    strategyVersion: decision.originStrategyVersion ?? "1",
    positionId: decision.positionId ?? held.id,
    cycleId: decision.cycleId,
  });
  if (!created.ok) {
    return skip(row, created.reason, decision);
  }
  const riskEffect: RiskEffect =
    decision.riskEffect === "INCREASE_RISK" ? "INCREASE_RISK" : decision.riskEffect === "CLOSE_RISK" ? "CLOSE_RISK" : "REDUCE_RISK";
  const risk = assessTradeIntent(created.intent, input.riskPolicy, input.account, input.nowMs, riskEffect, input.venue);
  return {
    kind: "READY",
    ticker: row.ticker,
    assetId: row.representationId,
    intent: created.intent,
    risk,
    action,
    strategyId,
    riskEffect,
    observed,
    arbitration,
    positionDecision: decision,
    heldQuantity: held.quantity,
    dedupKey: `${row.representationId}|${strategyId}|${decision.action}`,
  };
}

function admitDcaTranche(input: IntentPlanInput, assetId: string, ticker: string, price: Scaled, notional: Scaled): void {
  const params = input.operatorConfig!.strategies.dca;
  const current = readDcaState(input.userId, input.agentId, assetId) ?? emptyDcaState(assetId, ticker, params.mode, params.reference);
  const priceText = (Number(price) / 1_000_000).toFixed(6);
  const spent = parseDecimal(current.budgetSpent) + notional;
  const key = dcaEligibleKey({
    mode: params.mode,
    nowMs: input.nowMs,
    intervalMs: params.intervalMs,
    dipThresholdBps: params.dipThresholdBps,
    referencePrice: price,
    lastFillPrice: current.lastFillPrice,
  });
  writeDcaState(input.userId, input.agentId, {
    ...current,
    initialReference: current.initialReference ?? priceText,
    lastFillPrice: priceText,
    lastFillAtMs: input.nowMs,
    lastEligibleKey: key,
    tranchesCompleted: current.tranchesCompleted + 1,
    budgetSpent: formatDecimal(spent, 6),
    status: current.tranchesCompleted + 1 >= params.maxTranches ? "COMPLETE" : "ACTIVE",
  });
}

function skip(row: ObservationRow, reason: string, positionDecision: PositionDecision | null = null): IntentPlan {
  return {
    kind: "NO_TRADE",
    ticker: row.ticker,
    assetId: row.representationId,
    reason,
    arbitration: row.arbitration,
    positionDecision,
  };
}
