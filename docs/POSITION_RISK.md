# Position risk

This is simulated execution and does not broadcast blockchain transactions.

Position risk is a typed policy plus the existing user risk engine. The position manager proposes a `riskEffect`. `validateRiskPolicy` still decides. Nothing in `position/` signs, broadcasts, or writes the paper ledger.

## PositionRiskPolicy

`PositionRiskPolicy` has five optional fields. A null field is unused. The manager does not invent a universal stop.

| Field | Meaning when set |
| --- | --- |
| `maxPositionDrawdownBps` | Adverse move from entry, in basis points, that can exit |
| `maxHoldingBars` | Maximum holding time in 15-minute bars. Expiry is `THESIS_EXPIRED` |
| `maxHoldingMinutes` | Maximum holding time in minutes. Expiry is `THESIS_EXPIRED` |
| `profitProtectionBps` | Paper trailing may fire only after the high is at least this far above entry |
| `trailingExitBps` | Paper trailing distance from `highestMark`, in basis points |

Built-in values, policy version `1.0`:

| Strategy | `maxPositionDrawdownBps` | Holding, profit protection, trailing |
| --- | --- | --- |
| Momentum | 150 | Null |
| Mean reversion | Null | Null. `extensionBps` 120 is a thesis rule, not this policy |
| Weekend | Null | Null. `managesPositions` is false |

The cycle copies `positionPolicyFor(origin).risk` onto the position slice as `managementPolicy`. A test or a later strategy can set those fields explicitly. Unset fields stay null.

Drawdown lookup order is `managementPolicy.maxPositionDrawdownBps`, then the strategy risk field, then `adverseMoveBps`.

## Hard risk

Checked first, before security, thesis, reduce, and add.

| Condition | Result |
| --- | --- |
| Mark status or freshness is `STALE` | `BLOCKED`, reason `MARKET_DATA_STALE`. No intent |
| Mark is `UNAVAILABLE`, quality is `BLOCKED`, or the price is missing | `BLOCKED`, reason `CRITICAL_DATA_FAILURE`. No intent |
| Paper sample quality `DEGRADED` with a price and freshness `UNKNOWN` | Not a data block. Management continues |
| Configured adverse move reached | `EXIT`, `ADVERSE_MOVE`, `exitClass` `RISK` |
| Origin paper performance net PnL at or below −1500.00 | `EXIT`, `MAX_DRAWDOWN_BREACH` |
| Notional above twice the position cap | `EXIT`, `POSITION_LIMIT_BREACH` |
| Notional above the cap and at most twice the cap | Later `REDUCE`, `EXPOSURE_TOO_LARGE`, size capped at 5000 bps |
| Daily loss already reached, and another hard reason already fired | Also records `RISK_BREACH` |
| Daily loss alone, or a small negative PnL | Does not exit |

`RISK_GATE_VERSION` stays `1.0`. Confidence is not an input to `validateRiskPolicy`.

## Time exit and paper trailing

`THESIS_EXPIRED` fires only when `maxHoldingBars` or `maxHoldingMinutes` is configured and the open time has reached that limit. It is an `EXIT` with `exitClass` `THESIS`. Built-in strategies leave both fields null, so they do not expire on the clock.

`TRAILING_EXIT` fires only when `trailingExitBps` is configured and `market.value.fidelity` is `paper`. The drop is `(highestMark - currentMark) * 10000 / highestMark`. If `profitProtectionBps` is set, the high must first be at least that far above entry. A live-fidelity context with the same numbers does not trail. The manager does not read the paper store. The cycle stores `highestMark` when it remembers a decision. The opening high is the entry price.

## Security and events

| Fact | Paper | Live |
| --- | --- | --- |
| Security label or gate `BLOCK` | Opportunity `BLOCKED`. With a mark, position `EXIT` `SECURITY_BLOCK`. Without a mark, `BLOCKED` `TOKEN_NOT_TRADABLE` | Same block and the same exit |
| Security `NOT_EVALUATED`, `UNKNOWN`, or otherwise not `PASS` | Opportunity may proceed. The reason appends `PAPER_ONLY. SECURITY_UNVERIFIED.` An open position uses the management state (`MONITORING`, `QUALIFIED`, `RISK_REDUCTION`, `EXIT_REQUIRED`, or `BLOCKED`) | No position: opportunity `BLOCKED`, reason `Security state is unknown.` Open position: opportunity `BLOCKED`, reason `LIVE_SECURITY_UNKNOWN. Security state is unknown.` |
| Active `TRADING_RESTRICTION`, or any active non-maintenance event with severity `RESTRICTION` | `EXIT` `TRADING_RESTRICTION` when a mark exists. Otherwise `BLOCKED` | Same |
| Active `MAINTENANCE` | `HOLD` records `MAINTENANCE` and add is blocked. It does not exit, including when severity is `RESTRICTION` | Same on the paper manager. Live position execution is closed |
| New active `INFO` event absent at entry | One `REDUCE` of 2500 bps, `EVENT_UNCERTAINTY` | Same on the paper manager |

An earnings row, by itself, does not exit. There is no `EARNINGS_RESTRICTION` rule. Arbitration still data-blocks only when the security gate is `BLOCK`. Security does not change the score. `classifyQuality` still treats a non-`PASS` security label as `DEGRADED`, not `BLOCKED`.

Paper unverified monitoring is simulation only. It does not open the live gateway and it does not weaken the live opportunity block.

## Risk effect on the existing engine

`NONE` is not sent to the risk engine. HOLD and BLOCKED stop before `createManagementIntent`.

| Effect | Side | Entry caps |
| --- | --- | --- |
| `INCREASE_RISK` | Buy. Entry open and position add | Position, allocation, slippage, daily loss, allowlist, user, agent, and the paper switch |
| `REDUCE_RISK` | Sell. Partial reduction. `reductionBps` is in `(0, 10000)` and at most 5000 | Shape, user, agent, allowlist, slippage, and the paper switch. Entry allocation, position cap, and daily loss do not reject it |
| `CLOSE_RISK` | Sell. Full exit | Same remaining checks as `REDUCE_RISK`. Entry caps do not reject it |

A buy labeled `REDUCE_RISK` or `CLOSE_RISK` is rejected with `exposure_increase`, mapped to paper reason `EXPOSURE_INCREASE`. REDUCE and EXIT cannot increase quantity. ADD still passes the full increase checks. A rejected increase does not fill.

The paper cycle is the only caller of `createTradeIntent` and `createManagementIntent`. Sizing for an add also respects `maxIncrementalNotional` (500). A sell with `reduceBps` in `(0, 10000)` is a partial reduction. A sell without that bound is a full close.

## Reductions that are not exits

Applied once, then sticky: `WEAKENED_SIGNAL` 2500, `EVENT_UNCERTAINTY` 2500, `ALLOCATION_ABOVE_POLICY` 2500, `HEALTH_DEGRADED` 5000. Exposure is recomputed every pass. The largest applicable size wins, capped at `MAX_REDUCE_BPS` 5000. A 10000 bps close is `EXIT`, not `REDUCE`.

## Memory

Process-local position meta stores `lastDecision`, `lastDecisionAt`, `addCount`, `reduceCount`, `lastAddAt`, `lastReduceAt`, `thesisState`, `entryContextId`, `highestMark`, `previousSnapshot`, `alternateStrategyId`, `exitClass`, and `lastReasonCodes`. The interface is the meta record. A later store can replace the process map. One user cannot read or manage another user's book. One representation cannot manage another representation's position.
