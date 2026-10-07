import type { IntelligenceStrategy } from "@/strategies/types";

export class StrategyRegistry {
  private readonly strategies = new Map<string, IntelligenceStrategy>();

  register(strategy: IntelligenceStrategy): void {
    const { id, status } = strategy.metadata;
    if (status !== "implemented") {
      throw new Error(`Strategy ${id} cannot be registered with status ${status}.`);
    }
    if (this.strategies.has(id)) {
      throw new Error(`Strategy already registered: ${id}`);
    }
    this.strategies.set(id, strategy);
  }

  get(id: string): IntelligenceStrategy | undefined {
    return this.strategies.get(id);
  }

  list(): IntelligenceStrategy[] {
    return [...this.strategies.values()];
  }

  listEligible(ticker: string): IntelligenceStrategy[] {
    return this.list().filter((strategy) => isEligible(strategy, ticker));
  }
}

export function isEligible(strategy: IntelligenceStrategy, ticker: string): boolean {
  const metadata = strategy.metadata;
  if (!metadata.enabled || metadata.status !== "implemented") {
    return false;
  }
  return metadata.supportedAssets.includes("*") || metadata.supportedAssets.includes(ticker);
}
