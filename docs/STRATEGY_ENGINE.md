# Strategy engine

A strategy returns an `AnalyticalSignal`. That object is an evaluation. `executable` is always false. The decision pipeline, risk policy, and wallet are not called. A research proposal is not one of these strategies. Status `research_candidate` cannot be registered. The research brain cannot directly execute trades.

```text
Strategy.evaluate(context)
  → signal
    → stored on the observation board
      → stop
```

The context carries the representation, the latest price and reference price, candle history, features, regime, session, freshness, and data quality. Optional `externalSignals`, `securityAssessment`, and `events` may be present. Existing strategies may ignore them.

Strategy versions and measured health live beside the catalog. A research candidate is declarative, starts at `PROPOSED`, and cannot become live by itself. See [STRATEGY_LIFECYCLE.md](STRATEGY_LIFECYCLE.md) and [STRATEGY_PERFORMANCE.md](STRATEGY_PERFORMANCE.md).

`SmartMoneyConfirmation` is not a registered strategy. It answers whether a fresh, mapped Smart Money signal agrees with an existing KAIROS action: `CONFIRMING_EVIDENCE`, `CONFLICTING_EVIDENCE`, or `NO_SIGNAL`. It does not create an order. A generic crypto signal that is not verified by chain and contract is `SIGNAL_UNRELATED` and is not attached to the asset.

## Evaluation and action

| Evaluation | Action | Meaning |
| --- | --- | --- |
| `SIGNAL` | `BUY`, `SELL`, or `HOLD` | A rule fired. Weekend dislocation uses `HOLD`. |
| `VALID` | `HOLD` | The inputs were usable and no side was taken. |
| `NO_SIGNAL` | `NO_SIGNAL` | The rule does not apply. |
| `INSUFFICIENT_DATA` | `NO_SIGNAL` | Required inputs were missing. This is not a hold. |
| `STALE_DATA` | `NO_SIGNAL` | The observation source time is stale. Confidence is 0. |

Serialization refuses a payload whose evaluation and action disagree, including an insufficient evaluation with `BUY` or `SELL`.

The arbitrator reads these signals after they are produced. It does not call the strategies again, and it does not turn a signal into an order. Scoring, conflicts, and abstention are in [STRATEGY_ARBITRATION.md](STRATEGY_ARBITRATION.md).

The paper cycle is outside the strategy. It may create a trade intent only when arbitration selects `BUY` or `SELL`. `HOLD` and `NO_SIGNAL` never become an intent. The strategy still does not size capital, call risk, or fill. See [TRADE_INTENTS.md](TRADE_INTENTS.md).

## Momentum version 1

Interval `15m`. Momentum window 4 candles (1 hour). Trend average 20 candles.

- `BUY` when the 1h return is at least `+0.50%`, the close is above the SMA, the trend label is `UP`, and 20-return volatility is at or below `0.80%`.
- `SELL` is the symmetric rule.
- Otherwise `VALID` / `HOLD` when 21 candles and a price exist.
- Fewer candles, a zero prior close, or a missing trend: `INSUFFICIENT_DATA`.
- Freshness `STALE`: `STALE_DATA`.

Confidence for a side starts at 0.55 and rises with the absolute return, capped at 0.84. A hold uses 0.42. `validUntil` is 15 minutes after the evaluation.

## Mean reversion version 1

Distance is `(close - SMA 20) / SMA 20`.

- `BUY` when distance is at or below `-1.20%` and the regime is not `TRENDING_DOWN` or `HIGH_VOLATILITY`.
- `SELL` when distance is at or above `+1.20%` and the regime is not `TRENDING_UP` or `HIGH_VOLATILITY`.
- Otherwise `HOLD` once 20 candles exist.
- A shorter series is `INSUFFICIENT_DATA`.
- A stale observation is `STALE_DATA`.

Side confidence starts at 0.55 and is capped at 0.82.

## Weekend / off-hours version 1

Sessions `CLOSED`, `PRE_OPEN`, and `POST_CLOSE` are in scope. `OPEN` returns `NO_SIGNAL`. `UNKNOWN` returns `INSUFFICIENT_DATA`.

The gap is `(token price - reference price) / reference price`. A missing price is `INSUFFICIENT_DATA`. A stale observation is `STALE_DATA`.

A gap of at least `0.75%` sets evaluation `SIGNAL`, action `HOLD`, and tags `REFERENCE_DEVIATION`, `OFF_HOURS_DISLOCATION`, and `POTENTIAL_OPPORTUNITY`. The copy calls that a dislocation. It does not call it arbitrage profit. The reference price remains the per-share conversion described by Binance, not an official stock quote.

## Registry

Implemented: momentum, mean reversion, weekend / off-hours.

Coming soon, and not registered for evaluation: cross-representation arbitrage, earnings, news / event, volatility, relative value, rebalancing, liquidity-aware execution, crypto / equity correlation, and agent-generated strategies.

Each entry exposes id, name, category, status, required data, supported sessions, description, and version.

## Why this is not an order

The signal has no quantity, no account, and no venue. Risk limits are not inputs to `evaluate`. The strategy modules do not import the wallet or the execution package.

Each evaluation is copied into the cycle's `KAIROSContext` with its strategy version. Historical health is attached beside that signal. It does not replace the action. The arbitrator reads the context view rather than asking each strategy to fetch the market again. See [CONTEXT_FUSION.md](CONTEXT_FUSION.md).

Momentum and mean reversion set `managesPositions`. Weekend does not. After a fill, only the origin strategy version owns later holds, adds, reductions, and the exit. Another strategy that later scores higher is recorded as an alternate signal. See [POSITION_THESIS.md](POSITION_THESIS.md).
