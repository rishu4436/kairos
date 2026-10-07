# KAIROS

KAIROS is an autonomous multi-strategy tokenized-equity trading agent. Production execution targets BNB Smart Chain mainnet (chain ID 56). One canonical cycle (`runKairosAutonomousCycle`) powers the local persistent runner and the Agent Studio adapter. The configured watchlist is the market universe. Built-in deterministic strategies are live decision authority. The Research Brain proposes and tests candidate strategies and has no execution authority. Paper mode is the Strategy Lab / simulation boundary. Current submission scope is a single local operating agent.

## Implemented capabilities

- Canonical underlying/representation discovery, prices, candles, freshness, sessions, regimes, and features.
- Momentum, mean reversion, weekend/off-hours (observation/dislocation HOLD only), and deterministic DCA strategies, arbitration, and position management.
- Local operator desk for one owner: RUN, STOP, and RUN ONE CYCLE. AUTO and MANUAL are mandates over the same cycle, not separate engines. Paper simulation is only for thesis research.
- User-scoped risk policies, trade intents, execution simulation, paper accounting, idempotency, and lifecycle history.
- Research Brain with Qwen, Gemini, and xAI adapters, strict output schemas, evidence validation, and a declarative Strategy DSL. Mock reasoning is explicitly selected for development/tests.
- Strategy Lab experiments, shadow candidates, measured performance, and guarded promotion analysis.
- Binance quote/build/simulation adapters and an explicitly gated Binance Agentic Wallet execution boundary.
- Autonomous runtime leases, recovery, bounded context history, and configurable Redis persistence.
- Agent Studio adapters and a read-only Market Intelligence Brief work hook with ERC-8183 configuration.
- Optional Binance intelligence and FMP earnings/news adapters. Missing input stays unavailable.

## Architecture

Observation → strategies → canonical context → arbitration → risk → simulation → paper execution or the separately gated wallet boundary.

Research proposes hypotheses and declarative candidates. It cannot change risk, create execution authority, sign, broadcast, or activate live trading. The Studio operating wallet is separate from the user's Agentic trading wallet. ERC-8183 is the external intelligence rail.

See [Architecture](docs/ARCHITECTURE.md), [Research Brain](docs/RESEARCH_BRAIN.md), [Strategy lifecycle](docs/STRATEGY_LIFECYCLE.md), and [Paper execution](docs/PAPER_EXECUTION.md).

## Local setup

Use Node.js 22 or newer. Install the root dependencies with `npm ci`, copy `.env.example` to ignored `.env.local`, configure only the services you need, and run `npm run dev`. The always-on local host is `npm run kairos:runner`.

### Operator setup

1. Clone the repository and install dependencies.
2. Copy `.env.example` to ignored `.env.local`.
3. Set Binance Web3 credentials for live observation.
4. Configure Agentic Wallet address and operator-attested token scope.
5. Optionally set `KAIROS_LLM_PROVIDER` and `KAIROS_LLM_API_KEY` (never `NEXT_PUBLIC_`).
6. Set `KAIROS_OPERATOR_ENABLED=true` only on the self-hosted owner instance.
7. Start `npm run kairos:runner` and `npm run dev`.
8. Open `/operator` (control plane) and `/` (read-only dashboard).
9. On the desk, choose AUTO (Low, Medium, or High) or MANUAL. Normal operation is live preview until you explicitly arm live execution. Paper experiments stay in the thesis lab.
10. Configure strategies and risk, then RUN.

Public dashboard = sanitized persisted snapshots. Local operator console = owner control plane. LLM theses stay paper-first and never auto-promote into the live registry.

The example lists variable names without credential values. Defaults are paper market mode and ephemeral memory state. Paper mode requires supplied market inputs; startup does not fabricate prices, positions, experiments, or research. Portfolio and mission views read the stored paper book or show empty state.

| Configuration | Variable names |
| --- | --- |
| Market | `KAIROS_DATA_MODE`, `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET_KEY` |
| Research | `KAIROS_LLM_PROVIDER`, `KAIROS_LLM_API_KEY`, `KAIROS_LLM_MODEL`, `KAIROS_LLM_TIMEOUT_MS`, `KAIROS_QWEN_BASE_URL` |
| Events | `FMP_API_KEY` |
| State | `KAIROS_STATE_BACKEND`, `REDIS_URL` |
| Studio | `KAIROS_BAG_BIN`, `WALLET_PASSWORD`, `STORAGE_API_URL`, `STORAGE_API_KEY` |

Redis uses TCP RESP with optional TLS, not an HTTPS REST token. State errors fail closed; memory is not durable deployment storage. See [State persistence](docs/STATE_PERSISTENCE.md).

The separate Studio workspace pins pnpm 10.24.0. See [Agent Studio](docs/AGENT_STUDIO.md) and the [Deployment runbook](docs/DEPLOYMENT_RUNBOOK.md).

## Validation

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` validate the root project. The Studio agent's build is a TypeScript no-emit check.

Ordinary tests use explicit fixtures and local/fake transports. Live tests require separate environment gates and credentials; they do not run in default CI or write repository snapshots.

## Security and current limits

Credentials remain server-side and Git-ignored. Execution requires server-issued authority, deterministic risk approval, simulation, ownership checks, and wallet policy. A selected research provider never silently fails over.

Implementation does not establish live connectivity or a completed trade. Studio is not deployed, ERC-8004 identity is unregistered, commerce is not published, and automatic live candidate activation is disabled. Authentication and production multi-user wallet orchestration remain unfinished. The local account uses stable legacy IDs (`user_demo`, `agent_demo`) for state compatibility.

Studio deployment, wallet funding, and live validation are separate later phases.
