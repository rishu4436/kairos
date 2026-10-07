# Trade intents

A trade intent is the first object that says what KAIROS proposes to do. It is not an approval and it is not a fill.

```text
Strategy signal
  → Arbitration decision
    → Trade intent (RISK_PENDING)
      → Risk gate
        → Paper simulation
          → Paper execution
```

Strategies do not create intents. The arbitrator does not create intents. A position decision does not create an intent. The stored arbitration `loopPhase` stays `WAITING_FOR_RISK`. The paper cycle in `paper/cycle.ts` is the only caller of `createTradeIntent` and `createManagementIntent`. Entry still requires `SELECT_STRATEGY` or `MULTI_STRATEGY_CONFIRMATION` with `BUY` or `SELL`. A management intent can be created from a position decision when that arbitration is not a fresh buy or sell. HOLD and BLOCKED do not create one. After risk passes, that cycle's own loop state moves through `SIMULATING`, `PAPER_EXECUTING`, and `MONITORING_POSITION`. It does not enter chain `EXECUTING`.

## Executable actions

Only `BUY` and `SELL` can become an intent, and only from `SELECT_STRATEGY` or `MULTI_STRATEGY_CONFIRMATION`.

These never become an intent:

- `HOLD`, including a weekend dislocation
- `NO_SIGNAL`
- `NO_OPPORTUNITY`
- `CONFLICT`
- `DATA_BLOCKED`
- `INSUFFICIENT_EVIDENCE`

A confirmation creates one intent for the lead strategy. Capital is not doubled.

The code type is `AgentTradeIntent` in `paper/intent.ts`. `position` is a required `PositionTradeIntent`: `OPEN`, `ADD`, `REDUCE`, or `EXIT`, plus the user, agent, asset, origin strategy id and version, position id, decision id, cycle id, and correlation id. It is mapped to the existing risk-engine `TradeIntent` by `toRiskIntent`. The factory does not change the user risk policy. Entry buys are `OPEN`. Entry sells and management exits are `EXIT`. Management adds are `ADD`. Management partial sells are `REDUCE`.

## Fields

`intentId`, `userId`, `agentId`, `assetId`, `strategyId`, `action`, `requestedQuantity`, `requestedNotional`, `referencePrice`, `observedPrice`, `priceTimestamp`, `createdAt`, `expiresAt`, `maxSlippageBps`, `reason`, `arbitrationDecisionId`, `correlationId`, and `status`.

`venue` is the literal `paper`.

## Status

`PROPOSED`, `RISK_PENDING`, `RISK_REJECTED`, `SIMULATION_PENDING`, `SIMULATION_REJECTED`, `READY_FOR_PAPER`, `PAPER_EXECUTED`, `EXPIRED`, `CANCELLED`.

The factory returns `RISK_PENDING`. Later stages set the next status. An expired intent is `EXPIRED` and is not filled. Expiration emits `TRADE_INTENT_EXPIRED`. A policy violation emits `RISK_REJECTED`. Those events are not interchangeable.

## Position sizing

Sizing policy `1.0` in `paper/sizing.ts` is separate from both the strategy and the user risk policy.

A buy deploys at most 10 percent of available paper cash (`MAX_ALLOCATION_PERCENT`). The budget is then the tighter of that amount, remaining user allocation, remaining user position room, `maxPaperPosition`, and cash. Quantity is floored so the worst acceptable price plus the paper fee still fits. A buy cannot consume the whole book.

A sell never sells more than is held. With `reduceBps` in `(0, 10000)` it closes that share of the quantity. Otherwise it closes the position. An open position blocks a second independent entry. A later add exists only when the position manager returns `ADD`, and sizing then also respects `maxIncrementalNotional`.

## Repeats

The same user, asset, strategy, and action does not create another entry intent inside `minimumActionIntervalMs` (15 minutes on the default paper policy). An open unexpired intent also blocks a duplicate. A persistent entry `BUY` does not open a second position on the next poll. Management dedup is the representation, the origin strategy, and the position action. HOLD does not stamp that key. The add cooldown is one hour and is separate from the 15-minute entry interval.

## Correlation

`correlationId` is shared by the arbitration attempt, the intent, the risk decision, the simulation, the execution, and the position update. A management correlation id is `corr_<userId>_<representationId>_<decisionId>_<action>`. `readTradeLifecycle` in `paper/lifecycle.ts` rebuilds that sequence for one user and agent. An open position also stores the originating strategy and version, arbitration decision id, intent id, execution id, cycle id, and the same `correlationId`. One position can span many cycles. Each review stays reconstructable from those ids.

## Safety invariants

- A strategy cannot execute. A signal is not an intent.
- The arbitrator cannot execute. It does not create the intent.
- An LLM cannot execute. No model creates or approves an intent. Risk remains `validateRiskPolicy`.
- Paper cannot reach live execution. The intent venue is the literal `paper`. A paper capability cannot open the live gateway.
- Live cannot fall back to paper. A live capability cannot create a paper fill. A request cannot mint that capability. See [EXECUTION_CONTEXT.md](EXECUTION_CONTEXT.md).
- The wallet stays outside strategy logic and outside intent creation.
