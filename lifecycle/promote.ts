import { parseDecimal } from "@/domain/money";
import { PROMOTION_MAX_DRAWDOWN, PROMOTION_MIN_OUT_OF_SAMPLE, PROMOTION_MIN_TRADES } from "@/lifecycle/policy";
import type { PromotionAudit, StrategyPerformanceRecord } from "@/lifecycle/types";
import { STRATEGY_MEMORY_POLICY_VERSION } from "@/lifecycle/types";

export interface PromotionInput {
  candidateId: string;
  strategyVersion: string;
  nowMs: number;
  tradeCount: number;
  outOfSampleTrades: number;
  expectancy: string | null;
  maxDrawdown: string | null;
  baselineDifference: string | null;
  warnings: readonly string[];
  overfitting: "LOW" | "HIGH" | "UNKNOWN";
}

interface Memory {
  audits: PromotionAudit[];
}

const KEY = "__kairosPromotionAudits";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [KEY]?: Memory };
  if (!host[KEY]) {
    host[KEY] = { audits: [] };
  }
  return host[KEY];
}

export function resetPromotionAudits(): void {
  memory().audits = [];
}

export function listPromotionAudits(candidateId: string): readonly PromotionAudit[] {
  return memory().audits.filter((audit) => audit.candidateId === candidateId);
}

export function exportPromotionAudits(candidateIds?: readonly string[]): PromotionAudit[] {
  return memory().audits.filter((audit) => candidateIds === undefined || candidateIds.includes(audit.candidateId));
}

export function importPromotionAudits(audits: readonly PromotionAudit[]): void {
  const ids = new Set(audits.map((audit) => audit.candidateId));
  memory().audits = [...memory().audits.filter((audit) => !ids.has(audit.candidateId)), ...audits.map((audit) => ({ ...audit, reasons: [...audit.reasons], warnings: [...audit.warnings] }))];
}

/** Records a decision. It does not change lifecycle state and it does not activate a strategy. */
export function reviewPromotion(input: PromotionInput): PromotionAudit {
  const reasons: string[] = [];
  const warnings = [...input.warnings];
  if (input.tradeCount < PROMOTION_MIN_TRADES || input.outOfSampleTrades < PROMOTION_MIN_OUT_OF_SAMPLE) {
    reasons.push("The sample or the out-of-sample slice is below the configured minimum.");
  }
  if (input.expectancy === null || parseDecimal(input.expectancy) <= 0n) {
    reasons.push("Expectancy is missing or not positive.");
  }
  if (input.maxDrawdown !== null && parseDecimal(input.maxDrawdown) > PROMOTION_MAX_DRAWDOWN) {
    reasons.push("Drawdown is above the configured limit.");
  }
  if (input.baselineDifference !== null && parseDecimal(input.baselineDifference) <= 0n) {
    reasons.push("The candidate does not beat its baseline.");
  }
  if (input.overfitting === "HIGH") {
    warnings.push("Overfitting warning.");
    reasons.push("A critical overfitting warning is present.");
  }
  const insufficient = input.tradeCount < PROMOTION_MIN_TRADES || input.outOfSampleTrades < PROMOTION_MIN_OUT_OF_SAMPLE || input.expectancy === null;
  const result = insufficient ? "INSUFFICIENT_EVIDENCE" : reasons.length === 0 ? "PROMOTION_PASS" : "PROMOTION_FAIL";
  const audit: PromotionAudit = {
    candidateId: input.candidateId,
    strategyVersion: input.strategyVersion,
    policyVersion: STRATEGY_MEMORY_POLICY_VERSION,
    timestamp: new Date(input.nowMs).toISOString(),
    result,
    reasons,
    metrics: {
      tradeCount: input.tradeCount,
      outOfSampleTrades: input.outOfSampleTrades,
      expectancy: input.expectancy,
      maxDrawdown: input.maxDrawdown,
      baselineDifference: input.baselineDifference,
    },
    warnings,
  };
  memory().audits.push(audit);
  return audit;
}

export function reviewResearchRetirement(record: StrategyPerformanceRecord | null): { retire: boolean; reason: string | null } {
  if (!record || record.sampleState !== "ESTABLISHED") {
    return { retire: false, reason: null };
  }
  const expectancy = record.expectancy === null ? 0n : parseDecimal(record.expectancy);
  if (expectancy < 0n && parseDecimal(record.maxDrawdown) >= PROMOTION_MAX_DRAWDOWN && record.consecutiveLosses >= 8) {
    return { retire: true, reason: "Severe paper deterioration. Built-in strategies are not retired by this check." };
  }
  return { retire: false, reason: null };
}
