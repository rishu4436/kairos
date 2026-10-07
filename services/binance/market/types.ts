/**
 * Positional candle row from GET /api/v1/dex/market/candles.
 * Order: open, high, low, close, volume, timestamp (ms), tradeCount.
 */
export type BinanceCandleRow = readonly [unknown, unknown, unknown, unknown, unknown, unknown, unknown?];
