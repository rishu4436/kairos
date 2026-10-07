# Position manager

This is simulated execution and does not broadcast blockchain transactions.

An open paper position is managed on every later cycle. The position manager reads one `KAIROSContext` and returns a `PositionDecision`. That decision is not an execution. `executable` stays false. The paper cycle may then create an intent, and the existing risk check still has to pass.

The manager does not fetch a market, a Binance skill, Qwen, or a wallet. It does not close, increase, or reduce a position by itself. Live position execution stays closed.

```text
Open position
  → new KAIROS context
    → position decision (HOLD, ADD, REDUCE, EXIT, or BLOCKED)
      → risk
        → paper execution
```

`DeterministicPositionManager` is the implementation of `PositionManager`. `POSITION_MANAGER_IMPLEMENTED` is true. `generateExitIntent` reports an exit or a block that the decision already contains. It does not create an intent.

## Decision order

A later action cannot override an earlier one. An ADD never overrides a hard exit.

1. `HARD_RISK_OR_DATA_BLOCK`. A configured adverse move, a paper drawdown at or beyond 1500.00, a configured paper trailing stop, or a notional above twice the position cap forces EXIT. A stale mark is `MARKET_DATA_STALE` and BLOCKED. A missing, unavailable, or quality-blocked mark is `CRITICAL_DATA_FAILURE` and BLOCKED. Neither invents an exit. A paper sample with freshness `UNKNOWN` and quality `DEGRADED` is not a data block. Daily loss alone does not exit. A configured holding limit exits here as `THESIS_EXPIRED` after thesis invalidation is considered and before a discretionary reduce. Built-in strategies leave that limit unset.
2. `SECURITY_OR_TRADABILITY`. A security block or an active restriction exits when a mark exists. Without a mark the same fact is BLOCKED.
3. `THESIS_INVALIDATION`. The origin strategy's own policy. A regime change is not automatic.
4. `EXIT_SIGNAL`. An origin SELL that invalidation did not already capture. Momentum reversal is step 3, not this step. Mean reversion and weekend do not use it.
5. `REDUCE`. One named partial rule. The size is the largest applicable amount, capped at 5000 basis points. A full close is EXIT.
6. `ADD`. Every add gate passed.
7. `HOLD`. The default.

Negative PnL is not a thesis and is not an exit.

## Thesis and entry

`PositionThesisState` is `VALID`, `STRENGTHENED`, `WEAKENED`, `INVALIDATED`, or `UNKNOWN`. It is derived from the origin strategy, the current signal, regime, health, and the entry snapshot. A model does not assign it.

A new fill stores a compact entry snapshot: context id, cycle id, signal, regime, session, price, strategy health, mapped external directions, event types, trend, distance from the mean, and the fill time. Raw provider payloads are not copied. The next decision compares that snapshot with the current context.

Lifecycle states are `NO_POSITION`, `OPEN`, `ADDING`, `REDUCING`, `CLOSING`, `CLOSED`, and `BLOCKED`. Quantity and fills stay on the paper ledger. `ADDING`, `REDUCING`, and `CLOSING` describe the current decision. A synchronous pass does not leave those states stored.

## Strategy policy

Policy version `1.0`.

| Strategy | Management | Invalidation |
| --- | --- | --- |
| Momentum | Yes | Origin SELL, trend no longer supportive, `TRENDING_DOWN`, `HIGH_VOLATILITY`, or a 150 bps adverse move from entry |
| Mean reversion | Yes | Distance back through the mean, another 120 bps beyond the entry distance, or `TRENDING_DOWN` / `HIGH_VOLATILITY` |
| Weekend | No | Analytical only. Hard risk and security still apply. No live weekend behavior is invented |

`RANGE_BOUND` does not invalidate momentum. `INSUFFICIENT_DATA` does not reduce or exit. `RETIRED`, or a signal evaluation of `STALE_DATA`, `INSUFFICIENT_DATA`, or `BLOCKED`, invalidates the origin strategy.

## Hold, reduce, and add

HOLD records why it held. A valid thesis with room uses `THESIS_VALID`, `RISK_WITHIN_LIMIT`, and `NO_EXIT_TRIGGER`, plus any add gate that failed.

REDUCE sizes, in basis points of current quantity:

| Reason | Size |
| --- | --- |
| Weakened signal | 2500 |
| New information event | 2500 |
| Allocation above the copied policy | 2500 |
| Health `DEGRADED` or `UNSTABLE` with a sample | 5000 |
| Notional above the cap and at most twice the cap | The excess share, capped at 5000 |

The same weaken, event, allocation, or health reason is applied once. Exposure is recomputed.

ADD requires a valid or strengthened thesis, a fresh supporting signal, risk room, allocation room, room under the position cap, no security block, no restriction, and a satisfied cooldown. Fresh support is a confidence rise of at least 0.05 after the entry time, or a new mapped fresh or aging BUY that was absent at entry. The signal must still be valid. A lower price is not a reason to add.

`PositionAddPolicy`: at most 2 adds, at least one hour between adds, total notional at most 1500, and one add at most 500. The opening fill is not an add. `addCount` and `lastAddAt` are stored on the position meta.

## Risk effect

The manager proposes. `validateRiskPolicy` decides.

| Effect | When | Entry caps |
| --- | --- | --- |
| `INCREASE_RISK` | ADD, and an entry buy | Position, allocation, and daily loss apply |
| `REDUCE_RISK` | REDUCE, and a legacy entry sell | Those entry caps do not apply. Shape, user, agent, allowlist, slippage, and the paper switch still apply. A buy on this effect is `exposure_increase` |
| `CLOSE_RISK` | EXIT | Same remaining checks as `REDUCE_RISK`. Entry caps do not reject the close. A buy on this effect is `exposure_increase` |
| `NONE` | HOLD and BLOCKED | No intent is created. The effect is not sent to the risk engine |

`PositionTradeIntent` is the `position` field on `AgentTradeIntent`. Kinds are `OPEN`, `ADD`, `REDUCE`, and `EXIT`. Entry buys are `OPEN`. Entry sells are `EXIT`. Management uses `createManagementIntent`. Both factories keep `userId`, `agentId`, `assetId`, `strategyId`, `strategyVersion`, `positionId`, `decisionId`, `cycleId`, and `correlationId`.

The paper cycle is the only caller of `createTradeIntent` and `createManagementIntent`. When a managed position is open and the row has a KAIROS context, the manager runs before the 15-minute entry dedup. The entry path does not open a second independent position. ADD is allowed only by the manager, and only after `INCREASE_RISK`. A position with no context still blocks a second entry buy. HOLD and BLOCKED remember the decision and do not stamp an intent. BLOCKED stores the exact reason, such as `MARKET_DATA_STALE`. The add cooldown is separate from the entry interval.

Each asset pass still starts at `WAITING_FOR_RISK`. Chain `EXECUTING` is not on this path.

## Attribution, events, and surfaces

The origin strategy version owns the position for its whole life. A later arbitration winner is recorded as `ALTERNATE_STRATEGY_SIGNAL` and does not replace that owner. Fills call `recordPaperFill` with `intent.position.strategyVersion`. HOLD and BLOCKED do not.

Review events are `POSITION_REVIEW_STARTED`, `POSITION_DECISION_RECORDED`, `POSITION_DECISION_HOLD`, `POSITION_DECISION_ADD`, `POSITION_DECISION_REDUCE`, `POSITION_DECISION_EXIT`, and `POSITION_DECISION_BLOCKED`. A management intent adds `POSITION_INTENT_CREATED`. A fill adds `POSITION_ADD_EXECUTED`, `POSITION_REDUCE_EXECUTED`, or `POSITION_EXIT_EXECUTED`, and `POSITION_CLOSED` when the quantity is flat. Each carries `cycleId`, `correlationId`, `positionId`, `decisionId`, `userId`, `agentId`, `assetId`, and a timestamp. The entry buy sequence is unchanged and does not insert those review events.

While a position is open, opportunity state follows the previous review: `MONITORING`, `QUALIFIED` after ADD, `RISK_REDUCTION` after REDUCE, `EXIT_REQUIRED` after EXIT, or `BLOCKED` after a blocked review. Paper security that is not `PASS` appends `PAPER_ONLY. SECURITY_UNVERIFIED.` Live unknown security stays `BLOCKED` with `LIVE_SECURITY_UNKNOWN`. See [POSITION_RISK.md](POSITION_RISK.md) and [POSITION_THESIS.md](POSITION_THESIS.md).

The command center card, `/portfolio`, and the asset-terminal position panel read the same paper view: state, origin strategy and version, entry context, thesis, last decision, add count, reduce count, unrealized and realized PnL, regime, and session. The "what changed" lines are `changedLines` on `PositionContextDiff`. Copy is deterministic. The sample 47,217.90 USDT ledger stays a separate fixture.

The canonical cycle calls this manager for an open asset and does not also run the entry path for that asset. An elevated FMP earnings window adds `EVENT_UNCERTAINTY` to a hold. `EVENT_REDUCTION_ENABLED=1` can turn a paper `PRE_EVENT` window into one partial reduce. The reduce still uses `REDUCE_RISK`. A headline and a research hypothesis do not exit. See [EARNINGS_INTELLIGENCE.md](EARNINGS_INTELLIGENCE.md).
