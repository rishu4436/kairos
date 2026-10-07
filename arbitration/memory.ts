import { ARBITRATION_POLICY_VERSION, MIN_STRATEGY_HOLD_TIME_MS } from "@/arbitration/policy";
import type { PriorSelection } from "@/domain/arbitration";

/** Minimum record that keeps a cooldown decision stable across a restart. */
export interface StoredArbitrationSelection extends PriorSelection {
  cooldownUntilMs: number;
  policyVersion: string;
}

export interface ArbitrationMemory {
  read(userId: string, assetId: string): PriorSelection | null;
  write(selection: PriorSelection): void;
  clear(): void;
}

export class InMemoryArbitrationMemory implements ArbitrationMemory {
  private readonly selections = new Map<string, PriorSelection>();

  read(userId: string, assetId: string): PriorSelection | null {
    return this.selections.get(key(userId, assetId)) ?? null;
  }

  write(selection: PriorSelection): void {
    this.selections.set(key(selection.userId, selection.assetId), selection);
  }

  clear(): void {
    this.selections.clear();
  }

  exportFor(userId: string): StoredArbitrationSelection[] {
    return [...this.selections.values()].filter((selection) => selection.userId === userId).map((selection) => stored(selection));
  }

  importFor(userId: string, rows: readonly StoredArbitrationSelection[]): void {
    for (const [id, selection] of this.selections) {
      if (selection.userId === userId) {
        this.selections.delete(id);
      }
    }
    for (const row of rows) {
      if (row.userId !== userId || row.policyVersion !== ARBITRATION_POLICY_VERSION) {
        continue;
      }
      this.write({
        userId: row.userId,
        assetId: row.assetId,
        strategyId: row.strategyId,
        action: row.action,
        score: row.score,
        selectedAtMs: row.selectedAtMs,
      });
    }
  }
}

export const arbitrationMemory = new InMemoryArbitrationMemory();

export function exportArbitrationMemory(userId: string): StoredArbitrationSelection[] {
  return arbitrationMemory.exportFor(userId);
}

export function importArbitrationMemory(userId: string, rows: readonly StoredArbitrationSelection[]): void {
  arbitrationMemory.importFor(userId, rows);
}

function key(userId: string, assetId: string): string {
  return `${userId}:${assetId}`;
}

function stored(selection: PriorSelection): StoredArbitrationSelection {
  return {
    ...selection,
    cooldownUntilMs: selection.selectedAtMs + MIN_STRATEGY_HOLD_TIME_MS,
    policyVersion: ARBITRATION_POLICY_VERSION,
  };
}
