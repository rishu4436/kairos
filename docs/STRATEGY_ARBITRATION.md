# Strategy arbitration

KAIROS evaluates Momentum, Mean reversion, and Weekend / off-hours independently. The arbitrator then decides, per watchlist asset, whether one candidate is clear, whether two agree, whether they conflict, or whether KAIROS should abstain.

A decision is not an order. `loopPhase` is `WAITING_FOR_RISK`. The arbitrator does not create a trade intent and does not update a portfolio. A later paper cycle may create one intent for a selected `BUY` or `SELL`. That cycle is simulated execution and does not broadcast blockchain transactions. See [TRADE_INTENTS.md](TRADE_INTENTS.md) and [PAPER_EXECUTION.md](PAPER_EXECUTION.md).

Policy version: `1.0`, in `arbitration/policy.ts`.

## Eligibility

A candidate can be selected only when all of these hold:

- Strategy status is `implemented`. Coming-soon rows are rejected.
- The asset and the session are in the strategy metadata (`*` or the specific value).
- The evaluation is `SIGNAL`. A `VALID` hold, `NO_SIGNAL`, `INSUFFICIENT_DATA`, or `STALE_DATA` cannot win.
- Weekend dislocation is the one `HOLD` that can be selected, and only with the `OFF_HOURS_DISLOCATION` tag.
- History meets the strategy minimum: momentum 21 candles, mean reversion 20, weekend 0.
- Every feature the signal names was actually computed. Missing features stay missing.
- The signal timestamp is within 2 minutes of the observation, and `validUntil` is still ahead.
- Regime fit and session fit are not `ZERO`.
- Signal strength is at least 0.40.

If the observation freshness is `STALE`, the data-quality status is `STALE`, or the token price is missing, the asset decision is `DATA_BLOCKED`. No candidate is selected.

External intelligence is a separate policy. It does not change the weights above.

| Field | Values | Effect on the score |
| --- | --- | --- |
| `externalConfirmation` | `CONFIRMING_EVIDENCE`, `NO_SIGNAL`, `STALE` | None. A confirming Smart Money row is evidence, not points. |
| `externalConflict` | `CONFLICTING_EVIDENCE`, `NONE` | None. A fresh opposing Smart Money row is recorded and the score stays the same. |
| `securityGate` | `NOT_EVALUATED`, `UNAVAILABLE`, `ELIGIBLE`, `BLOCK` | None. `BLOCK` (authoritative `HIGH`, risk level 4 or 5) sets the decision to `DATA_BLOCKED` and clears the selected action. Confidence is withheld. `LOW` stays `LOW` and is not called safe. |
| `externalFreshness` | `FRESH`, `AGING`, `STALE`, `EXPIRED`, `UNKNOWN`, `NONE` | A signal that is not `FRESH` cannot confirm or conflict. |

`UNAVAILABLE` means the audit was not authoritative. It does not become a pass and it does not become a fabricated block. `NOT_EVALUATED` means no assessment was supplied, which is how the existing paper board behaves.

Measured history is optional. When it is absent, `historicalHealth` is `NONE` and the score is unchanged. When it is present, the 0.06 health component is multiplied by a factor: established and healthy is 1, developing is 0.8, early is 0.6, insufficient is 0.5, degraded is 0.45, unstable is 0.25, and retired is 0. Signal strength is not multiplied. A healthy history does not override a security block. See [STRATEGY_PERFORMANCE.md](STRATEGY_PERFORMANCE.md).

The running observation loop now supplies that history through `KAIROSContext`. `arbitrationViewFromContext` copies a report only when `sampleSize` is greater than zero and the status is not `UNKNOWN`. The weight stays 0.06. The arbitrator does not fetch a wallet, a market, a skill, research, or news. An invalid or `BLOCKED` context is not passed in. External signals and events are evidence on that view. They do not create an order, and they do not increase the score. See [CONTEXT_FUSION.md](CONTEXT_FUSION.md).

## Score

Each component is in the range 0 to 1. The weights sum to 1.

| Component | Weight | Meaning |
| --- | --- | --- |
| Signal strength | 0.40 | `0.7 * confidence + 0.2 * evidence coverage + 0.1 * remaining validity`. Coverage caps at 4 evidence lines. Validity is the fraction of the 15-minute window still left. Confidence alone is not the score. |
| Regime fit | 0.18 | Table below. `HIGH` is 1, `MEDIUM` is 0.6, `LOW` is 0.25, `ZERO` is 0. |
| Session fit | 0.12 | Same scale, from the session table. |
| Data quality | 0.14 | `GOOD` is 1, `DEGRADED` is 0.55, `INSUFFICIENT` and `STALE` are 0. |
| Evidence quality | 0.10 | Evidence lines divided by 3, capped at 1. Empty evidence is 0. |
| Strategy health | 0.06 | This evaluation only, unless measured history is supplied. History scales this weight and does not replace signal strength. |

`total = weighted sum - stale penalty - uncertainty penalty`, clamped to 0..1 and rounded to 4 decimal places.

The uncertainty penalty is 0.10 for momentum and mean reversion when the regime is `HIGH_VOLATILITY`, and 0.05 for a strategy whose regime fit is not zero when the regime is `UNKNOWN`. Weekend's regime fit is `MEDIUM` in every regime, including `UNKNOWN`, because it is a session rule.

The conflict penalty is stored on the candidate when a conflict is declared. It is not subtracted. Opposing sides are not averaged.

## Regime and session

Momentum is `HIGH` in `TRENDING_UP` and `TRENDING_DOWN`, `LOW` in range and volatility regimes, and `ZERO` when the regime is `UNKNOWN`.

Mean reversion is `HIGH` in `RANGE_BOUND` and `LOW_VOLATILITY`, `MEDIUM` in either trend, `LOW` in `HIGH_VOLATILITY`, and `ZERO` when the regime is `UNKNOWN`.

Weekend session fit is `HIGH` for `CLOSED`, `PRE_OPEN`, and `POST_CLOSE`, and `ZERO` for `OPEN` and `UNKNOWN`. Momentum and mean reversion are `HIGH` when the session is `OPEN`, `MEDIUM` off hours, and `LOW` when the session is `UNKNOWN`.

The session value is the normalized observation state. The arbitrator does not assume a weekend from the clock.

## Decisions

| Decision | When |
| --- | --- |
| `DATA_BLOCKED` | Stale observation, stale quality, or a missing token price. |
| `CONFLICT` | An eligible `BUY` and an eligible `SELL` both score at least 0.55. Selected strategy is empty. Resolution text is `NO ACTION`. |
| `MULTI_STRATEGY_CONFIRMATION` | Two or more eligible candidates share `BUY` or share `SELL`, and each scores at least 0.70. This is analytical agreement. Capital is not doubled. |
| `SELECT_STRATEGY` | One eligible candidate scores at least 0.72 and leads the next eligible candidate by at least 0.08. |
| `INSUFFICIENT_EVIDENCE` | The top two eligible scores are inside that 0.08 margin, or regime, session, or features left nothing usable. |
| `NO_OPPORTUNITY` | Strategies ran and none produced a selectable signal, or the best score is below 0.72. |

## Cooldown

Memory is keyed by `userId` and asset id. A selection for one user does not seed another user.

Inside 15 minutes, a new `SELECT_STRATEGY` replaces the incumbent only when its score exceeds the stored score by at least 0.08. Otherwise the incumbent stays, if it is still eligible, still the same action, and still at or above 0.72. Conflicts and confirmations are not hidden by the cooldown. A blocked or abstaining result does not keep advertising the old selection as the current decision.

The stored timestamp does not refresh on every poll, so the hold window can expire.

## Future model

`ReasoningProvider` accepts observations, features, regime, signals, arbitration evidence, news, and an optional user thesis. It may return a thesis, context, hypothesis, and explanation. No implementation is registered. The interface states that the model does not receive authority over risk limits, wallet permissions, or transaction signing.
