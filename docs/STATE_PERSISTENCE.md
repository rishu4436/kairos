# State persistence

## Phase 17H: real remote Redis verification (2026-10-07)

Verification completed at 12:57 IST on 2026-10-07: all seven gated checks passed.
Code support and real-server verification are separate. The existing RESP/TLS
adapter was tested against the privately configured Upstash TCP endpoint; the
connection URL and credentials are never documented or committed. Local settings
remain in Git-ignored `.env.local`: `KAIROS_STATE_BACKEND=redis` plus `REDIS_URL`.

Real checks passed for PING, temporary write/read/delete, atomic owner-only leases,
TTL expiry, revision conflicts, and recovery of paper position/meta, research
thesis/proposal/experiment, PAPER_ACTIVE candidates, strategy performance/version,
arbitration cooldown metadata, heartbeat, control state, and decision contexts.
Duplicate fills are recognized after object/store/connection recreation. Hot
contexts remain bounded to 100 and the open position's entry context remains present.
Only `kairos:v1:test:<random-id>:` keys are used and cleaned up; the configured
application namespace is untouched by these integration tests.

The real serialization test found Lua JSON re-encoding dropping a null field.
CAS now checks the revision inside EVAL and wraps the original value JSON unchanged,
preserving arrays, nulls, scaled numeric strings, timestamps, and enums.
Persistability validation also rejects Redis connection strings and password fields.

Run the gated suite explicitly from the repository root:

```powershell
$env:KAIROS_REDIS_LIVE_TEST = '1'
node --env-file=.env.local node_modules/vitest/vitest.mjs run runtime/redis-live.integration.test.ts
Remove-Item Env:KAIROS_REDIS_LIVE_TEST
```

Default CI skips the remote suite. Ordinary tests use local memory/fake transports.
No additional Redis library was installed. Connectivity loss returns
STATE_BACKEND_ERROR, never a memory fallback. Preflight and rendered labels probe
the real RESP worker before reporting REDIS / DURABLE; an unreachable configured
endpoint reports unavailable/unverified. This verifies state persistence, not
provider backup policy, failover, or an Agent Studio deployment.

`KairosStateStore` is the runtime repository. Domain modules do not speak Redis. A repository method is not durability. Durability is whatever that store actually keeps after its objects are destroyed.

## Persistence matrix

| State | Memory backend | Redis backend | Required durable for deployment |
| --- | --- | --- | --- |
| Runtime lease | Process map. Lost on exit. | One `EVAL` (`SET` owner `PX` ttl, refuse a different owner). | Yes, before more than one process runs. |
| Revision / CAS | In-process compare. Stale write returns `STALE_REVISION`. | One `EVAL`. Stale write returns `STATE_REVISION_CONFLICT`. | Yes for position, paper snapshot, candidate lifecycle, runtime control, and strategy lifecycle. |
| Paper ledger and position meta | Written into the store at the end of a cycle. The process copy dies with the process. | Same snapshot on `kairos:v1:...:paper`. | Yes. |
| Research thesis, proposal, experiment | Process `ResearchStore`. | Domain snapshot. | Yes. |
| Candidate registration, lifecycle, promotion audits | Process registries. | Domain snapshot. A research version is not restored as `LIVE_ACTIVE`. | Yes. `PAPER_ACTIVE` stays `PAPER_ACTIVE`. |
| Strategy performance and health inputs | Process map, including context slices. | Domain snapshot. | Yes. Momentum must not return to sample size zero when the snapshot has trades. |
| Strategy versions | Process list, reseeded from built-ins. | Domain snapshot. | Yes for research versions. |
| Arbitration cooldown | Process map of the prior selection. | User, asset, strategy, score, selection time, cooldown end, policy version. | Yes. Losing it can change the next decision. |
| Decision context snapshots | Last 100, secrets stripped. | Same record. | Yes for decision-bearing context. |
| Heartbeat, control, cycle list, audit | Store records. | Store records. | Yes. |

The memory backend remains the test and local default. It is not production durable. `KAIROS_STATE_BACKEND=redis` without `REDIS_URL` throws `STATE_BACKEND_NOT_CONFIGURED` and does not fall back to memory.

Agent Studio IPFS is a different store. `[storage].kind = "ipfs"` in `studio/bnb/app/agent/studio.toml` is for Studio deliverables. The pinning endpoint and key are `STORAGE_API_URL` and `STORAGE_API_KEY`. They are not written into the repository. IPFS does not persist KAIROS positions, research, performance, leases, or cycles. Those stay on the KAIROS state backend. Local Redis configuration and real-server verification are recorded in Phase 17H above.

## Redis transport

No Redis npm package was added. `ioredis` and `node-redis` are asynchronous, and this store is synchronous. Pulling either into the Next.js server graph would add a large client for `GET`, `SET NX PX`, `DEL`, `PTTL`, and `EVAL`.

The application never does get-then-set for a lease or a revision. Each of those operations is one command:

- Acquire: `EVAL` equivalent to `SET key owner NX PX ttl`. The same owner may refresh. A different owner is refused.
- Renew: `EVAL` extends the TTL only when the stored owner is the caller.
- Release: `EVAL` deletes only when the value equals the caller. A stale runtime cannot delete a newer lease.
- CAS: `EVAL` writes the next revision or returns nil. The caller maps nil to `STATE_REVISION_CONFLICT`.

`MemoryRedisTransport` applies those commands in one call. Tests use it, including two store objects on one transport. `REDIS_LUA` is the same logic as text for a real server.

`LazyRedisTransport` is the live client. It expands a script name to `REDIS_LUA`, then sends one RESP command on a worker thread. The main thread waits on that result. The socket is not opened until the first command. A URL with no server fails closed as `STATE_BACKEND_ERROR`. This is not a general Redis library.

At the earlier Phase 16 check on 2026-10-07, no `REDIS_URL` was configured. No production Redis server was contacted. A local RESP fake process proved `PING`, `SET NX`, and `GET`. Deployment with the memory backend stays **not production durable**.

## What is not stored

API keys, authorization headers, wallet credentials, pairing URLs, and private keys are rejected with `STATE_INVALID` or removed before a domain snapshot is written. `cachedAt` and provider secrets are not context fields.

Keys look like `kairos:v1:{userId}:{agentId}:...`. Records carry `schemaVersion` `1`. Cycle history keeps the latest 100 cycles. Decision context keeps the latest 100 snapshots.

A reload hydrates the paper book and the domain snapshot only when that process copy is empty. A later in-process edit is not overwritten by the previous snapshot. The next successful cycle writes the new snapshot.
