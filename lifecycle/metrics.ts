import { formatDecimal, parseDecimal } from "@/domain/money";
import { sampleState } from "@/lifecycle/policy";
import type { StrategyOutcome, StrategyPerformanceRecord } from "@/lifecycle/types";
import { STRATEGY_MEMORY_POLICY_VERSION } from "@/lifecycle/types";

export function emptyRecord(input: {
  strategyId: string;
  strategyVersion: string;
  userId: string;
  dataset: StrategyPerformanceRecord["dataset"];
  assetId: string | null;
  regime: string | null;
  session: string | null;
  at: string;
  experimentVersion: string | null;
}): StrategyPerformanceRecord {
  return {
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    userId: input.userId,
    dataset: input.dataset,
    context: { assetId: input.assetId, regime: input.regime, session: input.session },
    signalCount: 0,
    tradeCount: 0,
    wins: 0,
    losses: 0,
    grossPnL: "0",
    netPnL: "0",
    winRate: null,
    averageReturn: null,
    expectancy: null,
    profitFactor: null,
    maxDrawdown: "0",
    averageHoldingPeriod: null,
    sampleSize: 0,
    sampleState: "INSUFFICIENT",
    lastOutcome: null,
    consecutiveLosses: 0,
    conflictCount: 0,
    dataFailures: 0,
    winSum: "0",
    lossAbs: "0",
    peakPnL: "0",
    holdingSum: "0",
    holdingCount: 0,
    updatedAt: input.at,
    snapshot: {
      marketAt: input.at,
      strategyVersion: input.strategyVersion,
      policyVersion: STRATEGY_MEMORY_POLICY_VERSION,
      experimentVersion: input.experimentVersion,
    },
  };
}

/**
 * Expectancy = (wins / n) × average win − (losses / n) × average loss.
 * Average win and average loss are positive magnitudes of net PnL.
 * The identity is net PnL / n. Flat trades remain in n and contribute zero.
 * n = 0 leaves expectancy null.
 */
export function applyOutcome(record: StrategyPerformanceRecord, outcome: StrategyOutcome): StrategyPerformanceRecord {
  const evaluationMs = Date.parse(outcome.evaluationTime);
  if (!Number.isFinite(evaluationMs) || evaluationMs > outcome.nowMs) {
    throw new Error("FUTURE_OUTCOME_REJECTED");
  }
  if (record.signalCount > 0 && Date.parse(record.updatedAt) > evaluationMs) {
    throw new Error("BACKDATED_OUTCOME_REJECTED");
  }
  const next: StrategyPerformanceRecord = {
    ...record,
    context: { ...record.context },
    snapshot: { ...record.snapshot, marketAt: outcome.evaluationTime },
    signalCount: record.signalCount + 1,
    conflictCount: record.conflictCount + (outcome.conflict ? 1 : 0),
    dataFailures: record.dataFailures + (outcome.dataQualityFailure ? 1 : 0),
    updatedAt: outcome.evaluationTime,
    lastOutcome: "SIGNAL",
  };
  if (outcome.signalOnly || outcome.net === null || outcome.gross === null) {
    return next;
  }
  const net = parseDecimal(record.netPnL) + outcome.net;
  const gross = parseDecimal(record.grossPnL) + outcome.gross;
  const winSum = parseDecimal(record.winSum) + (outcome.net > 0n ? outcome.net : 0n);
  const lossAbs = parseDecimal(record.lossAbs) + (outcome.net < 0n ? -outcome.net : 0n);
  const tradeCount = record.tradeCount + 1;
  const wins = record.wins + (outcome.net > 0n ? 1 : 0);
  const losses = record.losses + (outcome.net < 0n ? 1 : 0);
  const peak = net > parseDecimal(record.peakPnL) ? net : parseDecimal(record.peakPnL);
  const drawdown = peak - net;
  const maxDrawdown = drawdown > parseDecimal(record.maxDrawdown) ? drawdown : parseDecimal(record.maxDrawdown);
  const holdingCount = outcome.holdingBars === null ? record.holdingCount : record.holdingCount + 1;
  const holdingSum = outcome.holdingBars === null ? parseDecimal(record.holdingSum) : parseDecimal(record.holdingSum) + parseDecimal(String(outcome.holdingBars));
  next.netPnL = formatDecimal(net);
  next.grossPnL = formatDecimal(gross);
  next.winSum = formatDecimal(winSum);
  next.lossAbs = formatDecimal(lossAbs);
  next.tradeCount = tradeCount;
  next.wins = wins;
  next.losses = losses;
  next.sampleSize = tradeCount;
  next.sampleState = sampleState(tradeCount);
  next.consecutiveLosses = outcome.net < 0n ? record.consecutiveLosses + 1 : 0;
  next.winRate = unitRatio(BigInt(wins), BigInt(tradeCount));
  next.expectancy = moneyAverage(net, BigInt(tradeCount));
  next.averageReturn = next.expectancy;
  next.profitFactor = lossAbs === 0n ? null : unitRatio(winSum, lossAbs);
  next.peakPnL = formatDecimal(peak);
  next.maxDrawdown = formatDecimal(maxDrawdown);
  next.holdingCount = holdingCount;
  next.holdingSum = formatDecimal(holdingSum);
  next.averageHoldingPeriod = holdingCount === 0 ? null : moneyAverage(holdingSum, BigInt(holdingCount));
  next.lastOutcome = outcome.net > 0n ? "WIN" : outcome.net < 0n ? "LOSS" : "FLAT";
  return next;
}

function moneyAverage(total: bigint, count: bigint): string | null {
  if (count === 0n) {
    return null;
  }
  return formatDecimal(total / count);
}

function unitRatio(numerator: bigint, denominator: bigint): string | null {
  if (denominator === 0n) {
    return null;
  }
  return formatDecimal((numerator * 1_000_000n) / denominator);
}
