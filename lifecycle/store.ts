import { applyOutcome, emptyRecord } from "@/lifecycle/metrics";
import type { OutcomeDataset, PerformanceContext, StrategyHealthReport, StrategyOutcome, StrategyPerformanceRecord } from "@/lifecycle/types";
import { healthReport } from "@/lifecycle/health";

interface Memory {
  records: Map<string, StrategyPerformanceRecord>;
}

const KEY = "__kairosStrategyMemory";

function memory(): Memory {
  const host = globalThis as typeof globalThis & { [KEY]?: Memory };
  if (!host[KEY]) {
    host[KEY] = { records: new Map() };
  }
  return host[KEY];
}

export function resetStrategyMemory(): void {
  memory().records.clear();
}

function contextKey(userId: string, strategyId: string, version: string, dataset: OutcomeDataset, context: PerformanceContext): string {
  return [userId, strategyId, version, dataset, context.assetId ?? "*", context.regime ?? "*", context.session ?? "*"].join("|");
}

export interface StrategyPerformanceStore {
  record(outcome: StrategyOutcome): readonly StrategyPerformanceRecord[];
  get(userId: string, strategyId: string, version: string, dataset: OutcomeDataset, context: PerformanceContext): StrategyPerformanceRecord | null;
  list(userId: string, dataset?: OutcomeDataset): readonly StrategyPerformanceRecord[];
  getByContext(userId: string, strategyId: string, version: string, dataset: OutcomeDataset, context: PerformanceContext): StrategyPerformanceRecord | null;
  getHealth(userId: string, strategyId: string, version: string, dataset: OutcomeDataset): StrategyHealthReport;
  clear(): void;
}

function slices(outcome: StrategyOutcome): PerformanceContext[] {
  const asset = outcome.assetId;
  const regime = outcome.regime;
  const session = outcome.session;
  const rows: PerformanceContext[] = [{ assetId: null, regime: null, session: null }];
  if (asset) {
    rows.push({ assetId: asset, regime: null, session: null });
  }
  if (regime) {
    rows.push({ assetId: null, regime, session: null });
  }
  if (session) {
    rows.push({ assetId: null, regime: null, session });
  }
  if (asset && regime) {
    rows.push({ assetId: asset, regime, session: null });
  }
  if (asset && session) {
    rows.push({ assetId: asset, regime: null, session });
  }
  if (regime && session) {
    rows.push({ assetId: null, regime, session });
  }
  return rows;
}

export function createStrategyMemory(): StrategyPerformanceStore {
  return {
    record(outcome) {
      const written: StrategyPerformanceRecord[] = [];
      for (const context of slices(outcome)) {
        const key = contextKey(outcome.userId, outcome.strategyId, outcome.strategyVersion, outcome.dataset, context);
        const current =
          memory().records.get(key) ??
          emptyRecord({
            strategyId: outcome.strategyId,
            strategyVersion: outcome.strategyVersion,
            userId: outcome.userId,
            dataset: outcome.dataset,
            assetId: context.assetId,
            regime: context.regime,
            session: context.session,
            at: outcome.evaluationTime,
            experimentVersion: outcome.experimentId,
          });
        const next = applyOutcome(current, outcome);
        memory().records.set(key, next);
        written.push(next);
      }
      return written;
    },
    get(userId, strategyId, version, dataset, context) {
      return memory().records.get(contextKey(userId, strategyId, version, dataset, context)) ?? null;
    },
    list(userId, dataset) {
      return [...memory().records.values()].filter((record) => record.userId === userId && (dataset === undefined || record.dataset === dataset));
    },
    getByContext(userId, strategyId, version, dataset, context) {
      return this.get(userId, strategyId, version, dataset, context);
    },
    getHealth(userId, strategyId, version, dataset) {
      return healthReport(userId, strategyId, version, dataset, this.list(userId, dataset));
    },
    clear() {
      resetStrategyMemory();
    },
  };
}

export function strategyMemory(): StrategyPerformanceStore {
  return createStrategyMemory();
}

export function exportUserPerformance(userId: string): StrategyPerformanceRecord[] {
  return [...memory().records.values()].filter((record) => record.userId === userId);
}

export function importUserPerformance(userId: string, records: readonly StrategyPerformanceRecord[]): void {
  for (const [key, record] of memory().records) {
    if (record.userId === userId) {
      memory().records.delete(key);
    }
  }
  for (const record of records) {
    if (record.userId !== userId) {
      continue;
    }
    memory().records.set(contextKey(record.userId, record.strategyId, record.strategyVersion, record.dataset, record.context), record);
  }
}
