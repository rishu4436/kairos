import type { Candle } from "@/domain/candle";
import type { ObservationBoard } from "@/domain/observation";
import type { OperatorConfig } from "@/operator/config";

export interface MarketObservationSnapshot {
  board: ObservationBoard;
  candles: ReadonlyMap<string, readonly Candle[]>;
}

export type ObserveMarket = (input: {
  userId: string;
  now: Date;
  operator?: OperatorConfig;
}) => MarketObservationSnapshot | Promise<MarketObservationSnapshot>;
