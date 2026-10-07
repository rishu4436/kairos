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
