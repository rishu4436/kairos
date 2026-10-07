import type { Candle } from "@/domain/candle";
import type { ObservationBoard } from "@/domain/observation";

export interface MarketObservationSnapshot {
  board: ObservationBoard;
  candles: ReadonlyMap<string, readonly Candle[]>;
}

export type ObserveMarket = (input: {
  userId: string;
  now: Date;
}) => MarketObservationSnapshot | Promise<MarketObservationSnapshot>;
