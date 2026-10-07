/** Documented KAIROS parameters. These are policy, not values returned by Binance. */
export const MARKET_BAR = "15m" as const;
export const CANDLE_LIMIT = 100;
export const CANDLE_REFRESH_MS = 10 * 60 * 1000;
export const CANDLE_RETRY_MS = 60 * 1000;
export const SIGNAL_TTL_MS = 15 * 60 * 1000;

export const MOMENTUM_PARAMS = {
  version: "1",
  interval: MARKET_BAR,
  momentumBars: 4,
  trendPeriod: 20,
  minReturnBps: 50,
  maxVolatilityBps: 80,
  minCandles: 21,
} as const;

export const MEAN_REVERSION_PARAMS = {
  version: "1",
  interval: MARKET_BAR,
  period: 20,
  entryBps: 120,
  minCandles: 20,
} as const;

export const WEEKEND_PARAMS = {
  version: "1",
  minDeviationBps: 75,
  offHours: ["CLOSED", "PRE_OPEN", "POST_CLOSE"],
} as const;
