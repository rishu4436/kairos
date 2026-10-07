# KAIROS architecture

## Phase 17G public intelligence boundary

`observation/live.ts` projects public provider rows into `studio/intelligence.ts`
before user-specific enrichment. The projection recomputes the standard public
strategies from public candles; it never copies user context, arbitration memory,
positions, or policies. Freshness is reclassified at read time and stale signals
are withheld. Snapshots are process-local; a different Studio process honestly
returns unavailable until a trusted public ingestion source populates its cache.

`KairosPublicIntelligencePort`, exported alongside `KairosExternalAgentInterface`,
provides the typed read surface. The HTTP adapter and Studio `runIntelligenceWork`
hook validate a fixed job schema and return a public brief. Optional public event,
arbitration, strategy-health, and research snapshots are currently unavailable;
private user stores are not substituted. Fulfillment imports no executor, wallet,
signer, risk override, or autonomous runtime.

The free ERC-8183 commerce capability is separate from stock execution authority;
both real paper/live capability admission functions reject it. ERC-8183 may later
authenticate service quotes/fulfillment through official fixed signing code.
That transport is not instantiated here. Stock execution remains KAIROS →
deterministic risk → Binance quote/build/simulation → Agentic Wallet.
The rail is configured, on-chain publication NOT PERFORMED, deployment NOT DEPLOYED,
ERC-8004 NOT_REGISTERED, and trading wallet NOT CONNECTED.

This build is the skeleton. Names below match the code. Anything described as later is not implemented.

## System boundaries

```text
app / components / features     render read models
        │
        ├── services/command-center.ts     paper ledger and sample decision
        └── GET /api/observations          polled by the browser
                │
                ▼
        observation                        fetch, validate, normalize, serve
                │
                ▼
        services/binance                   signed RWA reads
                │
                ▼
domain

agent                           state machine + decision pipeline
        ├── strategies          deterministic evaluators, no orders
        ├── risk                deterministic user policy
        ├── execution           plan + mock simulation
        └── wallet              paper authorization, no signature

execution ports and external access stay disconnected
```

UI components do not validate orders. Portfolio and decision strings come from `services/command-center.ts`. Market rows come from `GET /api/observations`. The decision pipeline does not read the live observation yet.

Domain types do not import React. A later API or MCP adapter can call the same functions without rendering a page.

There is no global wallet. `User`, `Agent`, `WalletAccount`, `RiskPolicy`, and `PaperAccountState` all carry user and agent ids. The demo session is one example of that graph, not a singleton the domain requires.

## Agent loop

The runtime states are:

The intelligence path added for arbitration is:

`OBSERVING → ANALYZING → EVALUATING_STRATEGIES → ARBITRATING → DECISION_READY → WAITING_FOR_RISK`

`WAITING_FOR_RISK` does not transition to `EXECUTING` on the unscoped table. The older path through `RISK_CHECK` and `SIMULATING` remains, and that path may still move `SIMULATING → EXECUTING`. The arbitrator still does not create a trade intent. Its stored `loopPhase` stays `WAITING_FOR_RISK`.

The paper cycle is `runAgentCycle` / `runPreparedAgentCycle`. It does not take a caller-chosen mode. The server issues a `PaperExecutionCapability`, and the cycle admits that capability before it opens a book or a gateway. A paper fill then moves only through `transitionPaperLoop`:

`WAITING_FOR_RISK → SIMULATING → PAPER_EXECUTING → MONITORING_POSITION`

`ArbitrationDecision` describes the decision boundary. Its `loopPhase` stays `WAITING_FOR_RISK`. The paper execution lifecycle is a separate state machine and ends at `MONITORING_POSITION` when a position is open. Those two records are not merged.

`PAPER_EXECUTING` records a simulated fill. It is not chain `EXECUTING`. `MONITORING_POSITION` means an open paper position exists. The mark reader does not write the book. The next paper cycle can hold, add, reduce, or exit that position from the current KAIROS context, and only after risk. A closed book returns to `OBSERVING`. A risk rejection or an expired intent stays at `WAITING_FOR_RISK`. This is simulated execution and does not broadcast blockchain transactions. The sample 47,217.90 USDT ledger is not the cycle book. See [EXECUTION_CONTEXT.md](EXECUTION_CONTEXT.md) and [POSITION_MANAGER.md](POSITION_MANAGER.md).

```text
Observation → Strategy → Arbitration → Trade intent → Risk → Simulation → Paper execution → Position
```

An open position continues:

```text
Open position → new KAIROS context → position decision → risk → paper execution
```

`PaperExecutionGateway` is opened from a `PaperExecutionCapability`. `LiveExecutionGateway` is opened from a `LiveExecutionCapability` and stays disconnected. Quote, signing, and broadcast stay outside both gateways.

## Safety invariants

- A strategy cannot execute. It returns an analytical signal.
- The arbitrator cannot execute. It selects or rejects a candidate and stops at `WAITING_FOR_RISK`.
- An LLM cannot execute. No model is called on this path. Risk stays in `validateRiskPolicy`, outside any proposer.
- Paper cannot reach live execution. A paper capability cannot open the live gateway, and the paper loop cannot enter chain `EXECUTING`.
- Live cannot fall back to paper execution. A live capability cannot open the paper gateway or preview a paper fill.
- A browser request cannot mint either capability. Client mode and client agent id are ignored.
- The wallet stays outside strategy logic and outside the paper executor.

Live preparation can quote, build an unsigned swap, and simulate it. It stops at `TRANSACTION_SIMULATED`. The address belongs to one user. Signing and broadcast return `EXECUTION_NOT_AVAILABLE`. A failed live quote does not create a paper fill. See [BNB_EXECUTION.md](BNB_EXECUTION.md), [QUOTE_ENGINE.md](QUOTE_ENGINE.md), and [TRANSACTION_SIMULATION.md](TRANSACTION_SIMULATION.md).

Strategy versions, paper outcomes, and experiment outcomes feed a performance memory. Health is computed from that memory. It does not replace the current signal, and a research strategy cannot activate itself for live trading. See [STRATEGY_LIFECYCLE.md](STRATEGY_LIFECYCLE.md).

Agent Studio, when a project exists, is a runtime around the same KAIROS cycle. The operating wallet and the Agentic Wallet stay separate. This workspace has `bag` 0.0.5 and no `studio.toml`, so the runtime port stays disconnected. See [AGENT_STUDIO.md](AGENT_STUDIO.md).

Binance skills are inputs. KAIROS normalizes them and decides. Trading-signal CLI commands and wallet tracking are blocked on baw 1.9.0 because those skills require 1.9.1. Smart Money live read is unavailable because the skill script is not installed and the current CLI reference does not publish a URL. Token audit and Ondo tokenized-security info are direct public APIs. They are not called from the browser, and a missing result stays missing. Token security is a gate after KAIROS risk. It does not add to strategy confidence. See [BINANCE_SKILLS.md](BINANCE_SKILLS.md).

```text
MARKET → BINANCE INTELLIGENCE → STRATEGIES → KAIROS CONTEXT → ARBITRATOR → RESEARCH → RISK → SECURITY → EXECUTION
```

One `KAIROSContext` is built per user, representation, and cycle in `context/`. Consumers read it. They do not fetch the wallet, the skills, or a second copy of the market. A stale or missing price blocks that context before arbitration, so a market-data failure cannot open a paper or live trade. Optional gaps degrade the context. See [CONTEXT_FUSION.md](CONTEXT_FUSION.md) and [EVENT_INTELLIGENCE.md](EVENT_INTELLIGENCE.md).

The research brain is a separate path. `ReasoningProvider` has two adapters: Qwen Chat Completions and the xAI Responses API. The pipeline sees only the normalized thesis and proposal. A model failure is not replaced by another provider or by the mock. The provider cannot create a trade intent, open a gateway, or register a strategy. The research brain cannot directly execute trades. See [RESEARCH_BRAIN.md](RESEARCH_BRAIN.md) and [QWEN_INTEGRATION.md](QWEN_INTEGRATION.md).

## REAL MODEL EXECUTION

xAI uses `POST https://api.x.ai/v1/responses`. Qwen uses the configured Chat Completions URL. Both requests ask for a strict JSON schema and send no tools. The server builds the context from the user's watchlist and the existing market pipeline. Structured output is parsed, then the thesis, evidence, and DSL validators run. Identity is assigned by KAIROS. Source metadata records `MOCK` or `LLM` separately from `MOCK FIXTURE` or `LIVE BINANCE HISTORY`. A failed call stays `MODEL_ERROR`. The model cannot modify risk, sign, broadcast, execute code, or promote a strategy.

`OFFLINE → STARTING → OBSERVING → ANALYZING → EVALUATING_STRATEGIES → RISK_CHECK → SIMULATING → EXECUTING → MONITORING_POSITION`

`PAUSED` and `ERROR` are reachable from the states listed in `agent/states.ts`. Illegal jumps, including `OFFLINE → EXECUTING`, are rejected.

The decision pipeline in `agent/pipeline.ts` is the enforcement spine:

1. A proposer returns a `TradeIntent` or declines. The `TradeProposer` interface is the slot for a future model. No model is called.
2. Intent shape is checked.
3. `validateRiskPolicy` applies the user policy. Failure stops the pipeline. No plan is built.
4. A live venue stops at `blocked_chain_not_implemented`.
5. A paper venue can build a plan, run the mock simulator, and ask the wallet layer for authorization.
6. `paper_ready` means the plan is eligible for a later paper fill. This function does not apply the fill and does not broadcast.

`submittedToChain` is the literal `false`. `SimulationResult.broadcast` is the literal `false`. `TradeExecution.chainTransactionId` is the literal `null`. `WalletAuthorization.signature` is the literal `null`.

`arbitrateAsset` in `arbitration/arbitrate.ts` is a pure function. `StrategyArbitrator` only reads and writes the prior selection for that user and asset. It does not call Binance, a wallet, a risk policy, or a model. The decision is stored on the observation row. See [STRATEGY_ARBITRATION.md](STRATEGY_ARBITRATION.md).

## Strategy abstraction

Implemented strategies evaluate an observation context and return an `AnalyticalSignal`. `executable` is false. Coming-soon metadata is not registered and cannot win arbitration.

- Momentum
- Mean reversion
- Weekend / off-hours

`ReasoningProvider` in `arbitration/reasoning.ts` is an unimplemented interface. A later model may explain a decision. It does not gain authority over risk limits, wallet permissions, or signing.

## Autonomous runtime

`runKairosAutonomousCycle` is the single orchestration entry. It acquires a user/agent lease, recovers an interrupted cycle, runs the existing paper path for `PAPER`, and refuses paper when the mode is `LIVE` or `LIVE_PREVIEW`. See [AUTONOMOUS_RUNTIME.md](AUTONOMOUS_RUNTIME.md), [STATE_PERSISTENCE.md](STATE_PERSISTENCE.md), [IDEMPOTENCY.md](IDEMPOTENCY.md), and [RECOVERY.md](RECOVERY.md).

## Event boundary

Binance tokenized-security status is execution context for one representation. FMP earnings and news are underlying-equity context. KAIROS fuses them. Neither provider creates a trade intent. The position manager can hold, or reduce when the paper event policy says so, and risk still has to pass. See [FMP_INTEGRATION.md](FMP_INTEGRATION.md).

## Risk boundary

`risk/validate.ts` is the hard limit. It does not read confidence.

A buy is rejected when any of these hold:

- The intent, policy, and paper account are not the same user and agent.
- Live trading is disabled and the venue is live, or paper trading is disabled and the venue is paper.
- The asset is outside the allowlist.
- Slippage exceeds the user maximum.
- The resulting position notional would exceed the maximum position.
- The resulting invested share of equity would exceed the maximum allocation.
- Realized losses already booked that calendar day have reached the daily loss limit.

A sell is still allowed after the daily loss limit so a later phase can reduce risk. Sells still have to pass ownership, venue, allowlist, and slippage checks. The paper simulator separately rejects a sell larger than the position.

`validateRiskPolicy` takes `INCREASE_RISK`, `REDUCE_RISK`, or `CLOSE_RISK`. Omitted, a buy is `INCREASE_RISK` and a sell is `REDUCE_RISK`. `CLOSE_RISK` is a full exit. Both reducing effects skip the entry position, allocation, and daily-loss caps and still run every other check. A buy on either reducing effect fails with `exposure_increase`. HOLD and BLOCKED use `NONE` and never reach this function. See [POSITION_RISK.md](POSITION_RISK.md).

Policy fields that are not valid basis points fail closed.

## Execution boundary

`execution/prepare.ts` builds a plan only from a mock quote for the same asset and side. The simulator checks paper cash and position size. It returns an estimated price only when those checks pass, and it never broadcasts.

Live plans are not described as simulated chain transactions. The pipeline refuses them before that function can accept them.

## Wallet boundary

`wallet/authorize.ts` can grant a paper account for a paper plan when the user, agent, and account ids match and paper trading is enabled.

A grant is permission for a future paper fill. It is not a signature.

`external_agentic_wallet` and every live plan are denied with an explicit "signing is not connected" reason.

The demo account stores `address: null`.

## Paper ledger

`domain/portfolio.ts` is the sandbox math:

- Cash is scaled integer USDT, 6 decimal places, rounded half away from zero.
- Buys debit cash, including fee, and average the entry.
- Sells credit cash, realize price minus entry minus fee, and attribute that result to the strategy id on the fill.
- Equity is cash plus mark-to-market value.
- Today's PnL is equity minus session-start equity.
- Total PnL is realized plus unrealized.

`applyPaperFill` returns a new state and rejects another user's fill, a cash shortfall, and an oversized sell. The decision pipeline does not call it.

## Future paper strategy lab

`StrategyExperiment` records a named hypothesis, a strategy id, a status (`draft`, `paper`, or `archived`), and paper capital. The command center counts the demo experiments. It does not generate, run, rank, or evolve them. The best recent experiment is empty on purpose.

The lab is meant to sit on the paper ledger above, after a hypothesis exists, and to stay away from the wallet signer.

## Future multi-user model

```text
User
  → Agent
    → Wallet account
    → Risk policy
    → Positions and paper trades
```

Isolation is already required by the risk check and the paper fill. What is missing is authentication, storage, and a request scoped to the signed-in user. The read models currently load the single demo session. `KAIROS_DATA_MODE` selects live or paper market data. An unknown mode fails. Live market data does not change the paper ledger.

## Future MCP model

`services/external-access.ts` names four capabilities and implements none of them:

- query agent state
- read approved signals
- request trade information
- subscribe to agent decisions

Calls throw. There is no server, socket, or subscription.

A later transport should call domain and service functions and should not receive a path to signing or to `liveTradingEnabled`. The UI is not on that path, so the transport does not need to render React.

## Market observation

```text
User
  → Watchlist
    → Underlying tickers
      → Tokenized representations returned by search
```

`createUserWatchlist(userId, tickers)` builds one list for that user. It does not read a process-global list. This phase stores a list only for `user_demo`, with NVDA, TSLA, AAPL, MSFT, AMD, and SPY. Another user id gets "No watchlist is stored for this user."

The live pipeline is `observation/engine.ts`:

1. Load issuance platforms.
2. Search each ticker. Keep an asset only when the returned ticker matches exactly.
3. Load the token list and the price batch for each chain those assets use.
4. Validate required identity fields.
5. Map into `MarketObservationRecord`.

An underlying and a representation are different types. One ticker can have several representations. A missing representation is an unresolved ticker, not a guessed contract.

`referencePrice` is stored separately from the token price. The percent gap is `reference_deviation`. Session state is `OPEN`, `CLOSED`, `PRE_OPEN`, `POST_CLOSE`, or `UNKNOWN`. `overnight` and `pause` stay `UNKNOWN` with the raw status kept. Freshness is `FRESH`, `AGING`, `STALE`, or `UNKNOWN`, from the source price time and the receive time.

After the RWA snapshot, `observation/analyze.ts` loads 15-minute candles for each representation already on that watchlist, appends them to `InMemoryMarketHistory`, computes features, classifies a regime, and evaluates the implemented strategies. The loop stops at signals. It does not build a trade intent.

Candle history is watchlist-scoped. The hot-token ranking is not called. Paper mode builds a labeled sample series and does not call the candle endpoint. A failed candle request leaves that representation's history empty or unchanged and does not copy the paper series in.

`GET /api/observations` serves the board, including regime, features, candles, and signals. Paper mode returns the sample and labels it. Live mode calls Binance or returns a KAIROS error. The client polls on a timer, aborts on unmount, and backs off after a transient failure.

The older `MarketObservation` type remains the fixture shape for the paper decision pipeline. Intelligence strategies do not read it. See `docs/MARKET_INTELLIGENCE.md` and `docs/STRATEGY_ENGINE.md`.

## BNB ports

`services/bnb-ports.ts` lists market data, tokenized-equity reference data, quotes, transaction simulation, wallet integration, Agent Studio, and an Agentic Wallet provider.

Market data and tokenized-equity reference data are connected to the adapters in `services/binance/`. RWA reads are in `docs/BINANCE_INTEGRATION.md`. Candles are in `docs/BINANCE_MARKET_DATA.md`. Quote, simulation, wallet, Agent Studio, and Agentic Wallet stay `connected: false`. `assertPortReady` throws on those before any network call.
