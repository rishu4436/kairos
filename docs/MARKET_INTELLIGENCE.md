# Market intelligence

Observation stays watchlist-scoped.

```text
User
  → Watchlist
    → Underlying
      → Tokenized representation from RWA search
        → RWA price and session
        → 15m candles for that contract
          → In-memory history
            → Features
              → Regime
                → Strategy signals
```

Nothing in that chain creates an order.

## History

`MarketHistory` can append candles, query a recent window, query a time range, and return the latest and previous candle. `InMemoryMarketHistory` is the implementation. Duplicate timestamps keep the later write. Out-of-order input is sorted. Each series stops at 500 candles.

The store is behind the interface so a later Redis or Postgres implementation can replace it. Strategies receive a `Candle[]` from the caller. They do not read the map.

Paper mode appends a deterministic sample series and labels the board paper. A failed live candle request does not copy that series.

## Features

`computeFeatures` reads candle closes, highs, lows, and volume. Each feature records its lookback, source, timestamp, and whether enough data existed. A missing input stays null. It is not stored as zero.

The set is: 15m, 1h, and 4h returns, SMA 20, EMA 12, 20-return volatility, rolling high, rolling low, range, one-bar volume change, trend, 1h momentum, distance from the 20-bar mean, reference deviation, and freshness.

Returns are integer basis points from scaled prices. EMA uses alpha `2 / (period + 1)` after an SMA seed. Volatility is the sample standard deviation of those basis-point returns. Volume change is null when the previous volume is zero or volume was absent.

## Regime

`classifyRegime` is a rule list over the last 21 candles. It is not a learned model.

- Fewer than 21 candles, or a zero close in the lookback: `UNKNOWN`.
- 20-return volatility at or above 0.80%: `HIGH_VOLATILITY`.
- 20-bar return at or above 0.80% and the close above the 20-bar mean: `TRENDING_UP`.
- The symmetric negative case: `TRENDING_DOWN`.
- Volatility at or below 0.20% and a small 20-bar return: `LOW_VOLATILITY`.
- Close within 0.40% of the mean and the 20-bar return under 0.80%: `RANGE_BOUND`.
- Otherwise `UNKNOWN`.

## Data quality

`GOOD` requires a live observation, freshness `FRESH`, enough history for the check, and no missing required fields. Paper samples and `AGING` or `UNKNOWN` freshness are `DEGRADED`. A short history or a missing required field is `INSUFFICIENT`. Freshness `STALE` is `STALE` and is never `GOOD`.

## Where it shows up

The command center lists regime and the three strategy outputs on each representation. `/markets/[ticker]` shows the candle chart, the feature grid, and the evidence. `/strategies/[strategyId]` shows the catalog entry, parameters, and the current evaluations.

The activity feed uses `MARKET_OBSERVED`, `HISTORY_UPDATED`, `FEATURES_UPDATED`, `REGIME_UPDATED`, `STRATEGY_EVALUATED`, `SIGNAL_CREATED`, `SIGNAL_REJECTED`, and `INSUFFICIENT_DATA`.
