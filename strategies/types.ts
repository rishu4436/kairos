import type { StrategyMetadata } from "@/domain/models";
import type { AnalyticalSignal } from "@/domain/signal";
import type { StrategyContext } from "@/strategies/context";

export interface IntelligenceStrategy {
  metadata: StrategyMetadata;
  evaluate(context: StrategyContext): AnalyticalSignal;
}
