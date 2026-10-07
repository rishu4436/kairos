# Position thesis

This is simulated execution and does not broadcast blockchain transactions.

A thesis is the reason the originating strategy opened the paper position. `PositionThesisState` is `VALID`, `STRENGTHENED`, `WEAKENED`, `INVALIDATED`, or `UNKNOWN`. `evaluateThesisInvalidation` assigns it from the current `KAIROSContext`. A model does not assign it. Research may describe a hypothesis. That text cannot become a `PositionDecision`.

## Entry ownership

The opening fill stores the origin strategy id and version on the paper position. Later management uses `decision.originStrategyId`, then the stored meta, then the held position. It does not read `arbitration.selectedStrategy`.

An open position may span many cycles. Each review keeps `cycleId`, `correlationId`, `positionId`, and `decisionId`. A fill also keeps `intentId` and `executionId`.

If another directional strategy has higher confidence than the origin, the review records `ALTERNATE_STRATEGY_SIGNAL` and `alternateStrategyId`. Ownership stays with the origin. There is no automatic handoff.

The whole position, including later adds, reduces, and the exit, stays attributed to that origin version in the paper ledger and in strategy performance memory.

## Entry snapshot

A new fill stores a compact snapshot: context id, cycle id, signal, regime, session, price, strategy health, mapped external directions, event types, trend, distance from the mean, and the fill time. Raw provider payloads are not copied. `entryContextId` is that snapshot's context id.

## Quality before invalidation

When the origin still manages the position and no invalidation reason fired:

| State | Rule |
| --- | --- |
| `UNKNOWN` | The origin signal or the entry snapshot is missing |
| `WEAKENED` | Origin action is `HOLD`, evaluation is `VALID` or `NO_SIGNAL`, or confidence fell by at least 0.10 from entry |
| `STRENGTHENED` | Confidence rose by at least 0.05 from entry |
| `VALID` | Origin action is still `BUY` with evaluation `SIGNAL` |

A mapped fresh or aging external `SELL` against an origin `BUY` also forces `WEAKENED` and records `EXTERNAL_CONFLICT`. That conflict can reduce once. It does not exit. A mapped fresh or aging external `BUY` records `EXTERNAL_SUPPORT` on a hold. It does not add by itself. An unavailable, absent, or errored external source is not a conflict.

## Invalidation

Invalidation produces `INVALIDATED` and can produce `EXIT` with `exitClass` `THESIS`.

Momentum (`momentum`):

- Origin action `SELL` → `ORIGIN_STRATEGY_REVERSED`
- Trend is `DOWN` and the entry trend was not `DOWN` → `TREND_NO_LONGER_SUPPORTIVE`
- Regime `HIGH_VOLATILITY` → `REGIME_INVALIDATED`
- Regime `TRENDING_DOWN` → `TREND_NO_LONGER_SUPPORTIVE`

`RANGE_BOUND` does not invalidate momentum.

Mean reversion (`mean-reversion`):

- Distance from the mean is back through zero → `REVERSION_COMPLETED`
- Distance is at least `extensionBps` (120) further against the entry distance → `EXTENSION_AGAINST_THESIS`
- Regime `TRENDING_DOWN` or `HIGH_VOLATILITY` → `REGIME_INVALIDATED`

Shared:

- Origin evaluation `STALE_DATA`, `INSUFFICIENT_DATA`, or `BLOCKED` → `ORIGIN_STRATEGY_INVALID`
- Origin health `RETIRED` → `ORIGIN_STRATEGY_INVALID`

Weekend (`weekend`) has `managesPositions: false`. It does not gain a thesis exit. Hard risk and security still run first.

## Thesis exit versus risk exit

`exitClass` is `THESIS` or `RISK` on `EXIT`, and null on `HOLD`, `ADD`, `REDUCE`, and `BLOCKED`.

`THESIS` covers origin reversal, origin invalidation, regime and trend invalidation, reversion completion, extension, and a configured holding-period expiry (`THESIS_EXPIRED`).

`RISK` covers `ADVERSE_MOVE`, `MAX_DRAWDOWN_BREACH`, `POSITION_LIMIT_BREACH`, `RISK_BREACH`, `TRAILING_EXIT`, `SECURITY_BLOCK`, `TOKEN_NOT_TRADABLE`, and `TRADING_RESTRICTION`.

The command center prints which class fired. The sentences come from `position/explain.ts`.

## What does not replace the current signal

- Historical health. `DEGRADED` or `UNSTABLE` with `sampleSize > 0` can weaken the position into one `HEALTH_DEGRADED` reduction. It does not exit. `INSUFFICIENT_DATA` does neither. A small paper net loss does not exit. The 1500.00 paper drawdown breach remains a separate risk exit.
- External intelligence. Conflict and support are evidence on the thesis. They do not print `EXIT`.
- An earnings event. No earnings rule exists. An event exits only when its type or severity matches the tradability rule in [POSITION_RISK.md](POSITION_RISK.md).
- Qwen. The research prompt may receive `positionContext`, `positionThesisState`, and `positionContextDiff`. The instruction set says a position hypothesis is not a `PositionDecision`.

## Context diff

`PositionContextDiff` in `position/diff.ts` compares the entry snapshot, the previous cycle snapshot, and the current cycle. Fields are price, regime, session, strategy action, strategy health, external confirmation, security, and events. `changed` uses the previous cycle when one is stored, and the entry value when it is not. The asset terminal prints only the changed lines. Entry security is empty because the entry snapshot does not store a security label.

External confirmation uses `SOURCE_ERROR` or `SOURCE_UNAVAILABLE` when that absence is set. An empty mapped set is `NO_SIGNAL`. A missing external slice is `SOURCE_UNAVAILABLE`. A provider failure is not described as evidence that no signal exists.
