import { parseDecimal } from "@/domain/money";
import { CONSECUTIVE_LOSS_UNSTABLE, CONSECUTIVE_LOSS_WARNING, DRAWDOWN_BREACH } from "@/lifecycle/policy";
import type { HealthState, OutcomeDataset, StrategyHealthReport, StrategyPerformanceRecord } from "@/lifecycle/types";

export function healthFromRecord(record: StrategyPerformanceRecord | null, retired = false): HealthState {
  if (retired) {
    return "RETIRED";
  }
  if (!record || record.tradeCount === 0) {
    return "UNKNOWN";
  }
  if (record.sampleState === "INSUFFICIENT" || record.sampleState === "EARLY") {
    return "INSUFFICIENT_DATA";
  }
  const expectancy = record.expectancy === null ? 0n : parseDecimal(record.expectancy);
  const drawdown = parseDecimal(record.maxDrawdown);
  if (record.consecutiveLosses >= CONSECUTIVE_LOSS_UNSTABLE || drawdown >= DRAWDOWN_BREACH || record.dataFailures >= 5) {
    return "UNSTABLE";
  }
  if (expectancy <= 0n || record.consecutiveLosses >= CONSECUTIVE_LOSS_WARNING || record.conflictCount >= 5) {
    return "DEGRADED";
  }
  return "HEALTHY";
}

export function healthReport(
  userId: string,
  strategyId: string,
  version: string,
  dataset: OutcomeDataset,
  records: readonly StrategyPerformanceRecord[],
): StrategyHealthReport {
  const owned = records.filter((record) => record.userId === userId && record.strategyId === strategyId && record.strategyVersion === version && record.dataset === dataset);
  const global = owned.find((record) => record.context.assetId === null && record.context.regime === null && record.context.session === null) ?? null;
  const status = healthFromRecord(global);
  const warnings: string[] = [];
  if (global && global.consecutiveLosses >= CONSECUTIVE_LOSS_WARNING) {
    warnings.push("Consecutive losses are a warning. The strategy is not retired.");
  }
  if (global && parseDecimal(global.maxDrawdown) >= DRAWDOWN_BREACH) {
    warnings.push("Drawdown breached the configured paper limit.");
  }
  if (status === "INSUFFICIENT_DATA") {
    warnings.push("Sample size is below the developing threshold. This is not a healthy rating.");
  }
  return {
    strategyId,
    strategyVersion: version,
    userId,
    dataset,
    status,
    sampleSize: global?.sampleSize ?? 0,
    sampleState: global?.sampleState ?? "INSUFFICIENT",
    quality: global ? global.sampleState : "UNKNOWN",
    expectancy: global?.expectancy ?? null,
    drawdown: global?.maxDrawdown ?? null,
    consistency: !global || global.tradeCount === 0 ? "UNKNOWN" : global.consecutiveLosses >= CONSECUTIVE_LOSS_WARNING ? "WEAK" : "STABLE",
    assetCoverage: owned.filter((record) => record.context.assetId && !record.context.regime && !record.context.session).map((record) => record.context.assetId ?? ""),
    regimeCoverage: owned
      .filter((record) => record.context.regime && !record.context.assetId && !record.context.session)
      .map((record) => ({ regime: record.context.regime ?? "", status: healthFromRecord(record) })),
    sessionCoverage: owned
      .filter((record) => record.context.session && !record.context.assetId && !record.context.regime)
      .map((record) => ({ session: record.context.session ?? "", status: healthFromRecord(record) })),
    warnings,
    lastOutcome: global?.lastOutcome ?? null,
    updatedAt: global?.updatedAt ?? null,
  };
}
