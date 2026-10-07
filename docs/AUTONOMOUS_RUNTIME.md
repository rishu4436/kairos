# Autonomous runtime

## Phase 17H durability status (2026-10-07)

Local KAIROS selects the existing Redis backend through private `.env.local`.
Real Upstash RESP/TLS tests verify leases, CAS, record serialization, restart
recovery, idempotency, interrupted cycles, and bounded decision-context retention.
This is remote backend evidence rather than merely code support.

The main and agent runtime panel uses a read-only connectivity probe for its
REDIS / DURABLE label. Memory remains MEMORY / EPHEMERAL; a configured but
unreachable Redis endpoint reports unavailable, with no fallback or URL exposure.
No background loop, Studio deployment, live trade, signing, or broadcasting was started.

One entry point runs the agent:

```text
runKairosAutonomousCycle
```

Local page loads, the observation route, and the Agent Studio runtime adapter call it. `runAgentCycle` and `runPreparedAgentCycle` remain the paper execution core. They are not a second scheduler.

The development server does not start a background loop. A cycle runs when a paper page or the observation route asks for one. `KAIROS_CYCLE_INTERVAL_MS` is the suggested gap, default 60 seconds.

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
