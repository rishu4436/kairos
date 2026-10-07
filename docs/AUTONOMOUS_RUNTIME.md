# Autonomous runtime

## Modes

| Input | Values |
| --- | --- |
| Runtime | `LOCAL`, `AGENT_STUDIO` |
| Execution | `PAPER`, `LIVE_PREVIEW`, `LIVE` |
| Control | `RUNNING`, `PAUSED`, `STOPPED`, `RISK_REDUCTION_ONLY` |

`PAUSED` and `STOPPED` create no execution intent. `LIVE` and `LIVE_PREVIEW` never call the paper executor. `RISK_REDUCTION_ONLY` blocks a new buy and an add. Reduce and exit still pass risk. The mode is not turned on by itself.

## Order

Acquire the user/agent lease, recover a non-terminal prior cycle, observe and build context through the existing paper board, let the Position Manager own an open asset, arbitrate entries only when no position is open, run paper execution, schedule research without blocking, persist the cycle, update the heartbeat, release the lease.

One broken research call is `RESEARCH_ERROR` and the cycle is `DEGRADED`. FMP `NOT_CONFIGURED` does not fail the cycle. A missing market blocks trading for that pass.

## Health

Paper readiness is `READY` in paper mode. Live readiness stays `BLOCKED`. The state backend is `MEMORY` and ephemeral unless `KAIROS_STATE_BACKEND=redis` and `REDIS_URL` are set. The UI labels that memory state `MEMORY · EPHEMERAL`. Redis leases and revisions are single commands, not a get followed by a set. Research, performance, candidates, and arbitration cooldown are reloaded from the store when the process copy is empty.

Denied capabilities stay denied: private key access, risk override, and unauthorized live execution.

## Hosts

The core decision engine is runtime-agnostic. Hosts only schedule, start/stop, heartbeat, take the lease, load config, invoke `runKairosAutonomousCycle`, and report health.

- Local persistent runner: `npm run kairos:runner`. Interval from `KAIROS_CYCLE_INTERVAL_MS` (default 60s). Import and test do not arm the loop. Overlapping ticks are skipped. Crash backoff uses `CycleScheduler`. Graceful SIGINT/SIGTERM stop.
- Agent Studio: `runStudioKairosCycle` / `runKairosAgentCycle` with `runtimeMode: AGENT_STUDIO`.

Current submission scope is one local operating agent. Persisted ids remain `user_demo` / `agent_demo` / `policy_demo` for Redis compatibility; production names are `LOCAL_RUNTIME_USER_ID`, `DEFAULT_AGENT_ID`, and `CONFIGURED_WATCHLIST_TICKERS`.

The configured watchlist is the market universe. KAIROS does not scan the wider token market. Representations must be chain 56.

## Execution modes

`PAPER` simulates fills. `LIVE_PREVIEW` may prepare market execution and never submits to the Agentic Wallet. `LIVE` requires live gates and the wallet adapter. A request string from UI or Studio cannot select `LIVE`.
