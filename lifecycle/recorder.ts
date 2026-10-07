import { strategyMemory } from "@/lifecycle/store";
import type { StrategyOutcome, StrategyPerformanceRecord } from "@/lifecycle/types";

export function recordStrategyOutcome(outcome: StrategyOutcome): readonly StrategyPerformanceRecord[] {
  return strategyMemory().record(outcome);
}

export function recordPaperFill(input: {
  userId: string;
  strategyId: string;
  strategyVersion: string;
  assetId: string;
  session: string | null;
  regime: string | null;
  nowMs: number;
  net: bigint | null;
  gross: bigint | null;
  correlationId: string | null;
  intentId: string | null;
  executionId: string | null;
}): readonly StrategyPerformanceRecord[] {
  return recordStrategyOutcome({
    ...input,
    dataset: "PAPER",
    evaluationTime: new Date(input.nowMs).toISOString(),
    signalOnly: input.net === null,
    holdingBars: null,
    experimentId: null,
    dataQualityFailure: false,
    conflict: false,
  });
}

export function recordExperimentSummary(input: {
  userId: string;
  strategyId: string;
  strategyVersion: string;
  assetId: string;
  experimentId: string;
  nowMs: number;
  net: bigint;
  gross: bigint;
}): readonly StrategyPerformanceRecord[] {
  return recordStrategyOutcome({
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    userId: input.userId,
    dataset: "EXPERIMENT",
    assetId: input.assetId,
    session: null,
    regime: null,
    evaluationTime: new Date(input.nowMs).toISOString(),
    nowMs: input.nowMs,
    signalOnly: false,
    net: input.net,
    gross: input.gross,
    holdingBars: null,
    correlationId: null,
    intentId: null,
    executionId: null,
    experimentId: input.experimentId,
    dataQualityFailure: false,
    conflict: false,
  });
}
