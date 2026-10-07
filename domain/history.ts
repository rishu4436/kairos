import { HISTORY_CAP, type Candle } from "@/domain/candle";
import { classifyCandleBar } from "@/domain/candle-quality";

export interface MarketHistory {
  append(seriesKey: string, candles: readonly Candle[]): void;
  queryRecent(seriesKey: string, limit: number): Candle[];
  queryRange(seriesKey: string, fromMs: number, toMs: number): Candle[];
  latest(seriesKey: string): Candle | null;
  previous(seriesKey: string): Candle | null;
  clear(): void;
}

/**
 * Process-local candle store. Duplicate timestamps keep the later append.
 * Each series is capped so the map cannot grow without bound.
 */
export class InMemoryMarketHistory implements MarketHistory {
  private readonly series = new Map<string, Candle[]>();
  private readonly cap: number;

  constructor(cap = HISTORY_CAP) {
    if (!Number.isInteger(cap) || cap < 2) {
      throw new Error("History cap must be an integer of at least 2.");
    }
    this.cap = cap;
  }

  append(seriesKey: string, candles: readonly Candle[]): void {
    const existing = this.series.get(seriesKey) ?? [];
    const byTime = new Map<number, Candle>();
    for (const candle of existing) {
      byTime.set(candle.timestampMs, candle);
    }
    for (const candle of candles) {
      if (!Number.isFinite(candle.timestampMs) || classifyCandleBar(candle).classification === "INVALID") {
        continue;
      }
      byTime.set(candle.timestampMs, candle);
    }
    const sorted = [...byTime.values()].sort((left, right) => left.timestampMs - right.timestampMs);
    this.series.set(seriesKey, sorted.slice(Math.max(0, sorted.length - this.cap)));
  }

  queryRecent(seriesKey: string, limit: number): Candle[] {
    const rows = this.series.get(seriesKey) ?? [];
    if (!Number.isInteger(limit) || limit <= 0) {
      return [];
    }
    return rows.slice(Math.max(0, rows.length - limit));
  }

  queryRange(seriesKey: string, fromMs: number, toMs: number): Candle[] {
    const rows = this.series.get(seriesKey) ?? [];
    return rows.filter((candle) => candle.timestampMs >= fromMs && candle.timestampMs <= toMs);
  }

  latest(seriesKey: string): Candle | null {
    const rows = this.series.get(seriesKey) ?? [];
    return rows.at(-1) ?? null;
  }

  previous(seriesKey: string): Candle | null {
    const rows = this.series.get(seriesKey) ?? [];
    return rows.length < 2 ? null : rows[rows.length - 2];
  }

  clear(): void {
    this.series.clear();
  }
}
