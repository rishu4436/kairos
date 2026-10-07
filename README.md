# KAIROS

KAIROS is an autonomous multi-strategy market intelligence system that observes a user's watchlist, evaluates multiple strategies, and deterministically selects or rejects strategy candidates.

This repository can simulate a paper fill. It does not sign or submit a transaction. This is simulated execution and does not broadcast blockchain transactions.

## Product vision

KAIROS is not one strategy and not a chatbot. The intended system will:

1. Monitor a user-defined watchlist of tokenized equities.
2. Observe price, liquidity, session, and events.
3. Select a strategy from a modular library.
4. Respect hard user risk limits that the agent cannot override.
5. Produce a trade decision.
6. Simulate before any execution.
7. Execute only through the user's authorized account.
8. Monitor the position and evaluate the outcome.
9. Later, paper-test new strategy hypotheses.
10. Later, support multiple users and agent-to-agent access.

The long-term path is:

```text
Agent proposes
  → Risk validates
  → Execution prepares
  → Simulation validates
  → Wallet authorizes
  → Chain executes
```

A future model may propose. It is never the authority for user risk limits.

## Current implementation status

Working in this build:

- Domain models for users, agents, assets, observations, strategies, intents, risk, plans, paper positions, and events.
- A typed agent state machine.
- Three deterministic strategies (momentum, mean reversion, weekend / off-hours) plus a registry. Signals are not orders.
- Coming-soon strategy metadata that cannot be executed.
- Deterministic risk validation, including rejection of orders that break user limits.
- A decision pipeline that stops before a fill and never broadcasts.
- Paper portfolio math: cash, average entry, unrealized and realized PnL, and strategy attribution.
- Live Binance Web3 observation for tokenized equities, behind `KAIROS_DATA_MODE=live`.
- 15-minute candle history, a feature engine, a rules-based regime, and strategy signals for the watchlist only.
- A deterministic per-asset strategy arbitrator. It selects, confirms, or abstains. It does not itself create an order.
- A paper-only loop from that decision through a trade intent, the existing risk engine, a deterministic execution preview, a simulated fill, and a user-scoped position. The sample portfolio card is a separate fixture.
- A research brain that can draft a falsifiable thesis and a declarative proposal, then run a deterministic paper experiment on a separate book. The research brain cannot directly execute trades. `KAIROS_LLM_PROVIDER` selects `qwen` or `xai`. Without a key the lab says the model is not configured. The mock lab runs only when it is selected.
- An explicit paper / mock market mode that does not replace a failed live request.
- A command center that polls observations, plus read-only strategy, portfolio, risk, and agent screens.
- A live preparation path that can quote, build an unsigned swap, and simulate it. It stops before signing and broadcast. Agent Studio and Agentic Wallet stay disconnected.
- A disconnected external-access boundary for a future MCP adapter.
- An Agent Studio runtime boundary. `bag` 0.0.5 is installed and no Studio project is configured, so nothing is registered, deployed, or paid. See [docs/AGENT_STUDIO.md](docs/AGENT_STUDIO.md).
- Binance skill inputs for signals and token security. Skills do not replace the arbitrator or risk, and they cannot sign or broadcast. Trading-signal CLI use and wallet tracking are blocked on the installed baw 1.9.0. See [docs/BINANCE_SKILLS.md](docs/BINANCE_SKILLS.md).
- One `KAIROSContext` per user, tokenized representation, and cycle. Strategy health, external signals, token security, tokenized-security events, the paper position, and underlying earnings and news are read from that context. FMP is the earnings and news provider. Without `FMP_API_KEY` those slices stay `NOT_CONFIGURED`. They do not create orders. See [docs/CONTEXT_FUSION.md](docs/CONTEXT_FUSION.md) and [docs/FMP_INTEGRATION.md](docs/FMP_INTEGRATION.md).
- One canonical autonomous cycle, `runKairosAutonomousCycle`. Paper pages and the Agent Studio runtime adapter call it. Live mode does not fill paper. The default state backend is ephemeral memory. See [docs/AUTONOMOUS_RUNTIME.md](docs/AUTONOMOUS_RUNTIME.md).
- A deterministic paper position manager. An open position can be held, added, reduced, or exited from the current context. HOLD and BLOCKED create no intent. ADD, REDUCE, and EXIT reuse the paper risk, simulation, and ledger path. EXIT uses `CLOSE_RISK` and cannot increase exposure. Live position execution stays closed. See [docs/POSITION_MANAGER.md](docs/POSITION_MANAGER.md), [docs/POSITION_THESIS.md](docs/POSITION_THESIS.md), and [docs/POSITION_RISK.md](docs/POSITION_RISK.md).

Intentionally not built:

- Live trading, wallet signing, and chain submission.
- Agent Studio and Agentic Wallet calls. Quote, unsigned build, and simulation stop at `TRANSACTION_SIMULATED`.
- WebSocket streaming. Polling is the transport in this phase.
- News ingestion, earnings feeds, and automatic promotion of a research candidate into the executable registry.
- Live execution after the paper gateway. The real execution gateway is disconnected.
- Authentication and durable multi-user storage. Paper books are process-local and keyed by user and agent.

The sample portfolio card, decision card, and paper lab stay fixture data. In paper mode the command center also shows the simulated cycle and a separate paper book. Live mode does not create that fill. The agent card is still a sample runtime. It does not mean a chain order was sent.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Path | Responsibility |
| --- | --- |
| `domain/` | Types and pure money, intent, and portfolio math |
| `agent/` | State machine and decision pipeline |
| `strategies/` | Deterministic strategies, registry, and catalog |
| `arbitration/` | Per-asset scoring, conflict handling, and abstention |
| `risk/` | User risk policy validation |
| `execution/` | Plan building and mock simulation for the older pipeline. Not called by strategies |
| `paper/` | Trade intents, sizing, risk gate, paper simulation, and the paper cycle |
| `research/` | Thesis, strategy DSL, validation, and paper experiments. No execution |
| `skills/` | Binance skill registry, signal normalization, and security gates. No execution |
| `studio/` | Agent Studio runtime boundary. It does not sign or deploy |
| `lifecycle/` | Strategy versions, performance memory, health, and promotion audits. No live activation |
| `wallet/` | Account authorization without signatures |
| `data/` | Mock observations and the demo session |
| `services/binance/` | Signed Binance Web3 client, RWA reads, and candle mapping |
| `observation/` | Watchlist observation, history, features, and signal board |
| `context/` | Canonical decision context, event boundary, and arbitration view |
| `position/` | Paper position decisions, thesis, risk policy, and context diff. No execution |
| `events/` | Underlying earnings and news normalization. No execution |
| `runtime/` | Canonical autonomous cycle, lease, and state store. No live execution |
| `services/` | Read models, market ports, disconnected execution ports |
| `app/` `components/` `features/` | Interface only. No trading rules live in components |

## Local setup

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other checks:

```bash
npm run lint
npm run typecheck
npm test
```

## Environment variables

Copy `.env.example` to `.env`. RWA endpoints are in [docs/BINANCE_INTEGRATION.md](docs/BINANCE_INTEGRATION.md). Candles are in [docs/BINANCE_MARKET_DATA.md](docs/BINANCE_MARKET_DATA.md). The feature and strategy write-ups are [docs/MARKET_INTELLIGENCE.md](docs/MARKET_INTELLIGENCE.md) and [docs/STRATEGY_ENGINE.md](docs/STRATEGY_ENGINE.md). Arbitration is [docs/STRATEGY_ARBITRATION.md](docs/STRATEGY_ARBITRATION.md). Context fusion is [docs/CONTEXT_FUSION.md](docs/CONTEXT_FUSION.md). Events are [docs/EVENT_INTELLIGENCE.md](docs/EVENT_INTELLIGENCE.md).

| Variable | Required | Meaning |
| --- | --- | --- |
| `KAIROS_DATA_MODE` | No | `paper` (default) or `live`. `mock` means paper. Any other value fails. |
| `BINANCE_WEB3_API_KEY` | For live | API key. Header `X-OC-APIKEY`. Server only. |
| `BINANCE_WEB3_SECRET_KEY` | For live | HMAC secret. Server only. |

Live mode with either secret empty returns "API credentials missing" and does not show the paper prices. The integration test in `services/binance/integration.test.ts` runs only when `BINANCE_WEB3_API_KEY` is present.

## Data modes

Paper / mock:

- Market rows, the activity feed, and the decision card are sample data.
- Token symbols use a `MOCK:` prefix. They are not resolved contracts.
- The panel says `DATA MODE PAPER / MOCK` and the Binance API line says it was not called.

Live:

- The demo watchlist (NVDA, TSLA, AAPL, MSFT, AMD, SPY) is resolved with RWA search.
- Prices, reference prices, session, and freshness come from the payload.
- A failed request stays an error. It is not filled with the paper sample.

Both modes:

- The portfolio is a simulated USDT ledger for one demo user.
- A paper plan that passes risk is marked ready and is not filled automatically.
- Live venue is blocked even if a caller flips the user switch in code.
- Simulation results set `broadcast` to false. Executions set `chainTransactionId` to null.

## What stays disconnected

`services/bnb-ports.ts` keeps these closed:

- BNB quote service
- BNB transaction simulation
- BNB wallet integration
- BNB Agent Studio runtime
- Agentic Wallet provider

Market data and tokenized-equity reference data point at the RWA adapters. They do not quote or sign.

## Security principles

- User risk limits are enforced by deterministic code outside any proposer.
- Confidence cannot override a limit.
- Intents, policies, and accounts must belong to the same user and agent.
- Live trading defaults off.
- This build never signs and never broadcasts.
- Unknown data mode fails closed.
- No production secrets are stored in the repo.

## Next implementation steps

1. Add authentication and persist one watchlist, agent, policy, and account per user.
2. Let a strategy refuse a stale observation. The freshness fields are already on the record.
3. Connect a verified wallet provider for authorization. Still keep risk in front of signing.
4. Implement strategy arbitration as a separate step that still cannot bypass risk.
5. Record paper fills only after the pipeline reaches `paper_ready`.
6. Build the strategy lab on the paper ledger.
7. Add an MCP transport in front of `services/external-access.ts` without giving it signing rights.
8. Consider the documented market WebSocket only in a later phase. This phase polls.
