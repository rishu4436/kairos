# Binance skills

Binance skills provide capabilities and signals. KAIROS normalizes those inputs and decides. A skill does not replace the strategy engine, the arbitrator, or KAIROS risk. A skill cannot create a trade intent, sign, or broadcast.

This phase is intelligence and safety only. No live order was submitted.

## Inspected skills

Inspected on 2026-10-04. Hub files are the current `SKILL.md` documents on `binance/binance-skills-hub`. The local skills directory contained `binance-agentic-wallet` only. The other four skills were not installed. `npx skills add` was not run. `baw` was not upgraded.

`baw --version` printed `1.9.0`. `node --version` printed `v24.18.0`.

| Skill | Version | Required CLI | Installed CLI | Installed here | Compatibility | Transport |
| --- | --- | --- | --- | --- | --- | --- |
| binance-agentic-wallet | 1.11.0 | 1.9.0 | 1.9.0 | Yes, local skill | COMPATIBLE | LOCAL CLI |
| binance-trading-signal | 3.5 | 1.9.1 | 1.9.0 | No | SKILL_BLOCKED_BY_VERSION | SKILL |
| query-token-audit | 1.4 | none | 1.9.0 | No | COMPATIBLE | DIRECT API |
| binance-tokenized-securities-info | 1.1 | none | 1.9.0 | No | COMPATIBLE, ONDO_ONLY | DIRECT API |
| binance-wallet-tracker | 1.3 | 1.9.1 | 1.9.0 | No | SKILL_BLOCKED_BY_VERSION | LOCAL CLI |

`skill-check` from the earlier wallet pass reported agentic-wallet 1.12.0 available. That update was not installed.

## Classification

| Capability | Class | What happened in this phase |
| --- | --- | --- |
| Agentic wallet status | LOCAL CLI | The command center still calls the existing `wallet status` path for `user_demo`. This phase did not start sign-in, verify, or a swap. |
| Trading-signal `baw signal` commands | LOCAL CLI | Blocked. Installed CLI 1.9.0 is older than required 1.9.1. Not invoked. |
| Smart Money | SKILL, then UNAVAILABLE | The skill says Smart Money does not require `baw` and is `node <skill-dir>/scripts/cli.mjs smart-money`. The skill directory is not installed. `references/cli.md` documents fields and does not publish a URL. KAIROS does not guess an endpoint. |
| Token audit | DIRECT API | Request builder only. No POST was sent. |
| Tokenized securities info | DIRECT API | Normalizer only. Ondo `type=1`. No GET was sent. The existing RWA resolver stays authoritative for representation discovery. |
| Wallet tracker | LOCAL CLI | Blocked. Interface and discovery only. `baw tracker` was not called. |
| Paper and research fixtures | MOCK | Unchanged sample books. External signals are not turned into candles. |

There is no MOCK Binance skill. Missing live reads stay unavailable. They are not replaced with a fabricated signal.

## Permissions

Declared capabilities do not grow because a skill is installed.

| Skill | May | May not |
| --- | --- | --- |
| binance-trading-signal | `READ_SIGNAL`, `READ_SIGNAL_HISTORY`, `READ_BACKTEST_RESULT` | `CREATE_TRADE_INTENT`, `EXECUTE_TRADE`, `SIGN`, `BROADCAST` |
| query-token-audit | `READ_TOKEN_SECURITY` | Anything else |
| binance-tokenized-securities-info | `READ_TOKENIZED_SECURITY` | Execution |
| binance-wallet-tracker | `READ_WALLET_INTELLIGENCE`, and it cannot run while blocked | Execution, and it is not an active strategy |
| binance-agentic-wallet | Isolated execution boundary already implemented in `wallet/agentic` | The intelligence registry grants no sign or broadcast capability |

A blocked skill stays blocked. `canInvoke` is false for trading-signal and wallet-tracker.

## External signal

`ExternalSignal` keeps provider fields and leaves the rest null. Confidence and strength stay null unless the payload actually contains those keys. `smartMoneyCount` is a count, not a strength score. `maxGain` stays the provider's decimal fraction (`"0.25"` means 25 percent in the skill text).

Freshness uses the signal timestamp:

| Age or provider status | Freshness |
| --- | --- |
| `status: "timeout"` | `EXPIRED` |
| Missing timestamp | `UNKNOWN` |
| Up to 15 minutes | `FRESH` |
| Up to 60 minutes | `AGING` |
| Up to 24 hours | `STALE` |
| Older | `EXPIRED` |

`outDecline` and `exitRate` are not treated as current. Only `FRESH` can confirm or conflict. A stale row is `NO_SIGNAL` from `SmartMoneyConfirmation` and `STALE` on the arbitrator, so it is not treated as current.

Deduping uses `provider + signalId` when the id exists, otherwise `provider + contractAddress + triggerTime + direction`.

Asset attachment requires `chainId` and `contractAddress` against one canonical representation. A ticker match is `SIGNAL_UNRELATED` when the contract does not verify. Two representations of NVDA do not share a signal.

## Token security

Direct API, not called in this phase:

`POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit`

Headers from the skill: `Content-Type: application/json`, `Accept-Encoding: identity`, `User-Agent: binance-web3/1.4 (Skill)`, `source: agent`.

Body: `binanceChainId`, `contractAddress`, `requestId`. No API key is documented.

The result is authoritative only when `hasResult` and `isSupported` are both true. Otherwise KAIROS stores `SECURITY_AUDIT_UNAVAILABLE` and does not copy `riskLevel`, `riskLevelEnum`, or `riskItems`.

`LOW` stays `LOW`. The skill says it means proceed with caution and is not a guarantee. Risk level 4 or `HIGH` blocks. Risk level 5 blocks. The block clears the selected action. The strategy score is not increased. Confidence is withheld rather than averaged with a security score.

No latency or rate limit was measured. No audit response was received.

## Tokenized securities

The installed skill text is Ondo-only (`type=1`). KAIROS records `CAPABILITY_LIMITATION: ONDO_ONLY`. The existing RWA resolver still discovers representations, including the types it already supports. This adapter does not replace it.

Documented GETs, not called here:

- `GET https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai`
- `GET https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`
- `GET https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai?chainId&contractAddress`

User-Agent from the skill: `binance-web3/1.1 (Skill)`. No API key is documented.

A `SecurityEvent` is created only when `reasonCode` or `reasonMsg` is present. `earnings`, dividends, splits, mergers, and maintenance are shown only as the provider's `reasonMsg`. An empty reason does not become an event. Kline from this skill is not a second candle pipeline.

## Wallet tracker

Required CLI 1.9.1. Status `SKILL_BLOCKED_BY_VERSION`. Discovery lists later uses: Smart Money tracking, wallet trade events, accumulation and distribution, sector rotation, anomaly activity, and first-mover or leader-follower patterns. `WalletSignal` exists as a type. The discovery returns no signals and does not call `baw tracker`. It is not on the main brain and it is not a strategy.

The skill notes that transaction `ts` is seconds. That note is unused while the skill is blocked.

## Events and health

`SkillEvent` types are `SIGNAL_RECEIVED`, `SIGNAL_UPDATED`, `SIGNAL_EXPIRED`, `SECURITY_AUDIT_RECEIVED`, `SECURITY_AUDIT_UNAVAILABLE`, `TOKEN_STATUS_RECEIVED`, `SKILL_ERROR`, and `SKILL_DISABLED`. The bus stores the event. It does not create an order.

A skill failure is `SKILL_ERROR`. It is not rewritten as `NO_SIGNAL`.

Books are process-local and keyed by user id. One user's signals are not readable as another user's asset context.

Health labels in the command center:

| Skill | Label | Why |
| --- | --- | --- |
| Trading signals | NOT AVAILABLE | CLI blocked and the Smart Money script is not installed. No successful read. |
| Token audit | NOT VERIFIED | Adapter exists. No audit call succeeded. |
| Tokenized securities | LIMITED | Ondo-only, and no status call succeeded. |
| Wallet tracker | NOT ENABLED | CLI blocked. |
| Agentic wallet | CONNECTED or NOT CONFIGURED | Taken from the existing wallet status. Unconnected stays NOT CONFIGURED. |

`READY` is not shown. `lastLatencyMs` stays null because no skill call was timed.

## Decision path

Future pre-trade order, defined and not executed:

```text
STRATEGY → ARBITRATION → KAIROS RISK → TOKEN SECURITY → QUOTE → SIMULATION → WALLET
```

Token security cannot move ahead of KAIROS risk. The arbitrator adds `externalConfirmation`, `externalConflict`, `securityGate`, and `externalFreshness`. Those fields do not change the score weights. A security block sets the decision to `DATA_BLOCKED` and clears the selected action, which cannot become a trade intent.

`SmartMoneyConfirmation` is an analysis result: `CONFIRMING_EVIDENCE`, `CONFLICTING_EVIDENCE`, or `NO_SIGNAL`. It is not registered in the strategy catalog.

Skill outputs enter the cycle once, through `KAIROSContext`. Strategies do not each call a Binance skill. A `SKILL_ERROR` stays `UNAVAILABLE` on `externalSignals`. It is not stored as a fresh empty confirmation. Token security stays a gate after KAIROS risk. Tokenized-security status becomes a `MarketEvent` only from the returned reason and status. See [CONTEXT_FUSION.md](CONTEXT_FUSION.md) and [EVENT_INTELLIGENCE.md](EVENT_INTELLIGENCE.md).

The research context can include `externalSignals`, `tokenSecurity`, `securityEvents`, and observed events from that same context. The model must separate `OBSERVED_EVENT`, `OBSERVED_EXTERNAL_SIGNAL`, `MODEL_INFERENCE`, and `HYPOTHESIS`. A claim that whales are buying is rejected unless a fresh Smart Money buy is in that context. Paper experiments record signal ids as external context with `usedAsCandles: false`. Historical signal events are not fabricated.

## Dashboard

The command center shows the path Market, Binance intelligence, Strategies, Arbitrator, Research, Risk, plus a KAIROS context panel for the cycle. Each watchlist asset shows strategy actions beside Smart Money and token security. Missing data is `UNAVAILABLE`, not zero. The asset page context map shows market, strategies, external intelligence, events, security, position, and research, each with source, timestamp, and freshness, and a timeline labeled `REAL`, `MOCK`, or `UNAVAILABLE`. The strategy page shows the current signal beside health, market, external confirmation, events, and position. Historical health does not replace the signal.
