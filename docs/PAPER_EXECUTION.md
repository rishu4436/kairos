# Paper execution

This is simulated execution and does not broadcast blockchain transactions. Paper shares observation, strategies, arbitration, risk, and intent shape with live. It is the Strategy Lab / shadow-execution boundary, not a second risk engine.

The paper loop proves the path from a decision to a position. It does not sign, broadcast, move real funds, call Agentic Wallet, call Agent Studio, call an LLM, or call a news provider.

```text
Observation
  → Strategy
    → Arbitration
      → Trade intent
        → Risk
          → Simulation
            → Paper execution
              → Position
```

A repeated intent id is an idempotent fill. The ledger is not applied twice. See [IDEMPOTENCY.md](IDEMPOTENCY.md).

No layer skips the one below it. The strategy cannot trade. The arbitrator cannot trade. A trade intent cannot bypass risk. Risk cannot execute. The paper executor cannot reach a wallet or a chain client.

Execution authority is a trusted context, not a mode flag. `runPreparedAgentCycle`, `previewPaperExecution`, `executePaper`, and `openPaperGateway` admit a `PaperExecutionCapability`. The request boundary is `resolveServerPaperCapability`. See [EXECUTION_CONTEXT.md](EXECUTION_CONTEXT.md).

After risk passes, the paper loop moves `WAITING_FOR_RISK → SIMULATING → PAPER_EXECUTING → MONITORING_POSITION`. `PAPER_EXECUTING` is the simulated fill. Chain `EXECUTING` is not on this path. `MONITORING_POSITION` means a paper position is open. The mark reader does not write the ledger price. The next cycle builds a new KAIROS context and runs the position manager before entry dedup. HOLD and BLOCKED do not create an intent. ADD uses `INCREASE_RISK`. REDUCE uses `REDUCE_RISK`. EXIT uses `CLOSE_RISK`. Entry allocation caps do not reject REDUCE or EXIT. A buy on either reducing effect is rejected as `exposure_increase`. The arbitrator's own `loopPhase` remains `WAITING_FOR_RISK` on the stored decision. The cycle result carries the later agent state. See [POSITION_MANAGER.md](POSITION_MANAGER.md).

## Safety invariants

- A strategy cannot execute.
- The arbitrator cannot execute.
- An LLM cannot execute. No model is on this path. Risk is `validateRiskPolicy`, outside any proposer.
- Paper cannot reach live execution. `transitionPaperLoop` rejects `EXECUTING`. A paper capability cannot open the live gateway. The executor does not sign or broadcast.
- Live cannot fall back to paper. A live capability cannot open the paper gateway, preview a fill, or run the paper cycle. `paperObservationBoard` runs only after a paper capability is admitted. An invalid capability returns the analytical board and does not fill.
- The wallet stays outside strategy logic and outside the paper executor.

The command center reads this stored book. The cycle keeps a separate user-scoped account whose id is `acct_paper_cycle_<userId>` and whose cash starts at `paperStartingCash`.

## Two policies

User risk (`RiskPolicy`) answers what that user is willing to allow. `validateRiskPolicy` remains the authority for those limits. The UI does not reimplement them.

Paper policy (`PaperExecutionPolicy`, version `1.0`) answers how the simulator behaves:

- `paperStartingCash` — 10,000
- `baseFeeBps` — 10 (0.10 percent)
- `impactModel` — version `1.0`
- `minimumTradeNotional` — 25
- `minimumActionIntervalMs` — 15 minutes
- `intentTtlMs` — 15 minutes
- `maxPaperPosition` — 1,500

## Risk decision

`assessTradeIntent` calls `validateRiskPolicy` and adds expiry. The returned decision has `allowed`, `reasonCodes`, `violations`, `checkedAt`, `policyVersion` (`1.0`), `policyId`, and `intentId`.

| Engine code | Reason code |
| --- | --- |
| `asset_not_allowed` | `ASSET_NOT_ALLOWED` |
| `position_limit` | `POSITION_TOO_LARGE` |
| `allocation_limit` | `ALLOCATION_EXCEEDED` |
| `slippage_limit` | `SLIPPAGE_TOO_HIGH` |
| `daily_loss_limit` | `EXPOSURE_LIMIT` |
| `exposure_increase` | `EXPOSURE_INCREASE` |
| `live_trading_disabled`, `paper_trading_disabled` | `TRADING_DISABLED` |
| `user_mismatch` | `USER_MISMATCH` |
| `agent_mismatch` | `AGENT_MISMATCH` |
| quantity shape error | `INVALID_QUANTITY` |

`EXPIRED_INTENT` is added by the gate. The limit math is not copied.

## Simulation formula

The preview runs before any fill. A failure stops the executor. Same inputs always produce the same preview.

```text
volatilityPenaltyBps = min(cap, floor(realizedVolBps * cap / reference))
liquidityPenaltyBps = paper policy value, default 0
impactBps = min(maxImpactBps, baseImpactBps + volatilityPenaltyBps + liquidityPenaltyBps)

BUY executionPrice = round(observedPrice * (10000 + impactBps) / 10000)
SELL executionPrice = round(observedPrice * (10000 - impactBps) / 10000)
fee = round(executionNotional * baseFeeBps / 10000)
```

Rounding is half away from zero, at the 6-decimal scaled integer. Realized volatility comes from the 20-return candle sample when that sample exists. The default liquidity penalty is 0 because candle volume is not a verified USD liquidity score. Impact is a cost. A buy fills above the observation and a sell fills below it. A round trip at the same observation loses the impact and the fee. The fill does not create cash.

Default impact is 8 bps plus a volatility term capped at 12 bps, with a hard cap of 40 bps.

The preview shows requested quantity, estimated price, estimated notional, expected slippage, estimated fee, and estimated total. The status is `PASS` or `FAIL`.

## Execution

`PaperExecutionService` (`executePaper`) accepts only:

- a risk decision with `allowed` for that intent
- status `READY_FOR_PAPER`
- `BUY` or `SELL`
- a positive quantity
- a supported asset
- an unexpired intent
- the same user as the observation

It returns `FILLED` or `REJECTED` or `EXPIRED`. `PARTIALLY_FILLED` is in the status union and is not produced. `broadcast` is false. `chainTransactionId` and `signature` are null.

`ExecutionGateway` has two implementations. `PaperExecutionGateway` calls the paper executor. `RealExecutionGateway` is disconnected and returns a rejection. It does not sign or broadcast.

A successful fill is applied with the existing `applyPaperFill`. Buys debit cash and increase the position. An add updates quantity and average cost on that same function. A partial sell realizes PnL in proportion to the quantity closed. A full sell realizes the remaining PnL and closes the position. Average entry, realized PnL, unrealized PnL, today's PnL, and strategy attribution stay on that ledger. The strategy id on the fill is the origin strategy, including on a later add. Equity is cash plus mark-to-market value. Only a fill calls `recordPaperFill`. A hold is not a trade.

## Position and audit

`MonitoredPosition` is user-scoped. It carries `userId`, `assetId`, `tokenizedRepresentationId`, quantity, average entry, current price, unrealized PnL, realized PnL, `openedAt`, `updatedAt`, and the opening ownership: strategy, strategy version, arbitration decision id, intent id, execution id, and `correlationId`. Process memory on the same record stores the last decision, decision time, add count, reduce count, last add time, last reduce time, thesis state, entry context id, highest mark, previous cycle snapshot, alternate strategy id, exit class, and last reason codes. The agent status on an open position is `MONITORING_POSITION`. The ledger `Position` remains the quantity and price record. Monitoring calls `markPositions` on a copy and does not write the book. The cycle view summarizes that same copy, so displayed equity is cash plus the observation mark and the position's unrealized PnL matches the book total. The stored ledger price stays the fill price. `/portfolio` and the asset terminal read this view. The portfolio summary reads stored paper state; cycle views can use current observation marks.

Each attempt that creates an intent stores an `ExecutionRecord`: strategy, arbitration decision, intent, risk result, simulation, execution context id, execution, and the resulting position. The context id is an audit key, not a credential. `readTradeLifecycle(userId, agentId, { correlationId })` or `{ intentId }` rebuilds arbitration, intent, risk, simulation, execution context, execution, and position for the same user and agent. Another user's book is not visible. The command center and the missions page read the same record.

## Events

An entry fill emits `TRADE_INTENT_CREATED`, `RISK_CHECK_STARTED`, then either `RISK_APPROVED` or `RISK_REJECTED`. An expired intent emits `TRADE_INTENT_EXPIRED` with `cause: "expiration"` and does not emit `RISK_REJECTED`. A risk rejection uses `cause: "risk_rejection"`. After approval the events are `PAPER_SIMULATION_STARTED`, `PAPER_SIMULATION_PASSED` or `PAPER_SIMULATION_FAILED`, then `PAPER_EXECUTED` and `POSITION_UPDATED` only after a fill. Each of those events has a timestamp, `userId`, `agentId`, `assetId`, `correlationId`, and metadata.

A position review emits `POSITION_REVIEW_STARTED` and one of `POSITION_DECISION_HOLD`, `POSITION_DECISION_ADD`, `POSITION_DECISION_REDUCE`, `POSITION_DECISION_EXIT`, or `POSITION_DECISION_BLOCKED`. HOLD also emits `POSITION_DECISION_RECORDED` and does not emit `TRADE_INTENT_CREATED`. BLOCKED records the reason codes and does not emit an intent. ADD, REDUCE, and EXIT emit `POSITION_INTENT_CREATED` and then the same risk, simulation, and fill sequence. A fill emits `POSITION_ADD_EXECUTED`, `POSITION_REDUCE_EXECUTED`, or `POSITION_EXIT_EXECUTED`, and `POSITION_CLOSED` when the book is flat. Review metadata includes `cycleId`, `positionId`, and `decisionId`.

A risk rejection does not simulate a fill. An expired intent does not simulate a fill. A simulation failure does not execute. An expired, missing, or live capability is not paper-filled. `EXECUTION_CONTEXT_EXPIRED` stops the fill.

## What is still disconnected

Quote, swap, wallet authorization, signing, and BSC broadcast are not on this path. The older decision pipeline can still reach `paper_ready` without applying a fill. Unscoped `WAITING_FOR_RISK` still cannot transition to `EXECUTING`. The paper fill moves to `PAPER_EXECUTING` and then `MONITORING_POSITION`. That is a simulator result, not a chain execution.

The future real path, not implemented here, remains:

```text
Risk PASS
  → Transaction quote
    → Transaction simulation
      → Agentic Wallet authorization
        → Wallet signing
          → BSC broadcast
            → Verification
```
