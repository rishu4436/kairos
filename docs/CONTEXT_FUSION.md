# Context fusion

KAIROS builds one `KAIROSContext` for each user, tokenized representation, and observation cycle. Strategy evaluation, arbitration, research, and the terminals read that object. They do not each assemble a private copy of the market.

```text
Raw sources
  → validation
  → normalization
  → timestamp alignment
  → fuseContext
  → KAIROSContext
  → strategy engine, arbitrator, research brain, future position manager
```

`fuseContext` is pure. The same input, including the prior snapshot, produces the same context. `ContextFusionService` (`buildObservationContext`) reads the stores that the observation loop already filled: skill book, strategy health, research theses, candidates, and the paper ledger. It does not call Binance again, and it does not open a wallet.

Live execution stays closed. `walletAccess` and `createsOrders` are the literal `false`.

## Identity and scope

The context keeps the underlying ticker separate from one tokenized representation.

| Field | Meaning |
| --- | --- |
| `underlyingTicker` | Equity ticker, such as `NVDA`. |
| `representationId` | One token. A paper row is `paper:NVDA`. A live row is `chainId:contract`. |
| `chainId` | Chain of that representation. Null on a paper sample. |
| `contractAddress` | Contract of that representation. Null on a paper sample. |

Two contracts for the same ticker are two contexts. A signal or a position whose contract does not match is a conflict. It is not merged.

Construction is watchlist scoped. An asset outside that user's watchlist is `WATCHLIST_EXCLUDED` and does not reach arbitration. User A and user B do not share a context id or a skill book.

## Slices

Every slice is `AVAILABLE`, `UNAVAILABLE`, `STALE`, or `INSUFFICIENT`. A missing value stays null. It is not rewritten as zero.

| Slice | When it is missing |
| --- | --- |
| `market` | No price, or the price is stale. |
| `reference` | No reference price. |
| `history` | No candles. |
| `features`, `regime` | Not computed, or the regime inputs were insufficient. |
| `strategySignals` | No strategy evaluated this cycle. |
| `strategyHealth`, `strategyPerformance` | Nothing was read, or no measured sample is stored. |
| `externalSignals` | The skill read is absent or `SKILL_ERROR`. |
| `tokenSecurity` | No assessment, or the audit was not authoritative. The gate stays `NOT_EVALUATED` or `UNAVAILABLE`. |
| `eventContext` | The event provider did not answer. |
| `newsContext` | `NOT_CONFIGURED` until FMP answers. A failure is not "no news". |
| `earningsContext` | Underlying earnings from FMP. A Binance restriction does not fill a date or an EPS. |
| `researchContext` | No thesis or candidate for this user and asset. |
| `positionContext` | The ledger was not read, or the position belongs to another user or representation. A read with nothing open is `NO_POSITION` and the quantity is null. |

## Source precedence

The provenance label is the producer of that value. It is not a score.

| Value | Source |
| --- | --- |
| Live token price and reference | `BINANCE_RWA_API` |
| Paper price and reference | `PAPER_SAMPLE` |
| Live candles | `BINANCE_MARKET_CANDLES` |
| Features, regime, data-quality record | `KAIROS_FEATURE_ENGINE` |
| Live session | `KAIROS_SESSION` |
| Strategy signal | `KAIROS_STRATEGY_ENGINE` |
| Health and performance | `KAIROS_STRATEGY_HEALTH` |
| Smart Money and other external signals | `BINANCE_TRADING_SIGNAL` |
| Token audit | `BINANCE_TOKEN_AUDIT` |
| Tokenized-security status and corporate-action reason | `BINANCE_TOKENIZED_SECURITY` |
| Paper position | `KAIROS_PAPER_LEDGER` |
| Stored thesis | `QWEN` when the provider name contains `qwen`, otherwise `KAIROS_RESEARCH` |

An external signal whose chain or contract differs is kept on the slice with relevance `MISMATCH` and a `EXTERNAL_CONTRACT_MISMATCH` conflict. The arbitration view receives only `MAPPED` rows. A paper identity has no contract, so a contract-scoped signal is not attached to `paper:TICKER`.

## Freshness and quality

`freshness` on the context has `market`, `reference`, `history`, `externalSignals`, `security`, `events`, and `position`. Each is `FRESH`, `AGING`, `STALE`, or `UNKNOWN`.

| Clock | Rule |
| --- | --- |
| Market | The observation freshness. `SAMPLE` is stored as `UNKNOWN` on the slice and passed back to arbitration as `SAMPLE`. |
| Reference, history, security | `FRESH` under 30 seconds, `AGING` under 120 seconds, otherwise `STALE`. A missing time, or a time more than 5 seconds in the future, is `UNKNOWN`. |
| External signals | The provider freshness. One `STALE` or `EXPIRED` mapped signal makes the slice `STALE`. |
| Events | While active: `FRESH` under 30 minutes, `AGING` under 6 hours, otherwise `STALE`. |
| Position | `FRESH` when the ledger was read for this cycle. |

Overall quality:

| Quality | When |
| --- | --- |
| `BLOCKED` | Market is unavailable or stale, data quality is `STALE`, or a conflict is `BLOCKING`. |
| `DEGRADED` | Market is aging or unknown, data quality is `DEGRADED` or `INSUFFICIENT`, an optional slice is stale, external signals are unavailable, security is not `PASS`, or a conflict is `DEGRADE`. |
| `GOOD` | None of the above. |

A stale Smart Money row degrades the context. It does not block it, and it cannot confirm. Research and news being unavailable does not, by itself, degrade or block. A paper sample is `DEGRADED` and still arbitrates. A blocked or invalid context does not.

`snapshotTimestamp` is the cycle clock. `sourceTimestamps` keeps the latest time supplied by market, reference, history, external signals, security, events, and position.

## Conflicts

A conflict names the disagreement. Fusion does not pick a winner.

| Code | Severity | Meaning |
| --- | --- | --- |
| `WATCHLIST_EXCLUDED` | `BLOCKING` | Asset is outside this user's watchlist. |
| `CHAIN_MISMATCH` | `BLOCKING` | Security chain or contract is a different representation. |
| `POSITION_SCOPE_MISMATCH` | `BLOCKING` | Position user or agent does not match. |
| `REFERENCE_TIMESTAMP_DIVERGENCE` | `DEGRADE` | Reference time and token-price time differ by more than 15 minutes. |
| `HISTORY_TIMESTAMP_GAP` | `DEGRADE` | A candle gap is wider than two 15-minute bars. The series is not rewritten. |
| `EXTERNAL_CONTRACT_MISMATCH` | `DEGRADE` | Signal names another chain or contract. |
| `SECURITY_UNAVAILABLE` | `DEGRADE` | No authoritative audit. The label is `UNKNOWN`. |
| `POSITION_REPRESENTATION_MISMATCH` | `DEGRADE` | Open quantity belongs to another representation. |
| `EVENT_EXPIRED` | `NOTE` | The event is outside its effective window and is not active. |

`KAIROSContextValidator` also rejects an empty user, an asset id that is not the representation id, a ticker missing from the watchlist, a snapshot more than 5 seconds in the future, a slice marked available with no value or source, a stale slice marked fresh, and an unavailable slice that still carries a value. Token security may stay unavailable while retaining the `NOT_EVALUATED` or `UNAVAILABLE` gate. `walletAccess` or `createsOrders` set to anything other than false fails validation.

## Consumers

The observation loop calls `buildObservationContext` once per row, after strategies evaluate. `arbitrationViewFromContext` is the only arbitrator input from that cycle. The arbitrator does not fetch a wallet, a market, a skill, research, or news.

Measured health is included only when `sampleSize` is greater than zero and the status is not `UNKNOWN`. The 0.06 weight is unchanged. An empty history leaves the score unchanged. A healthy history does not override a security block or replace the current signal.

Security remains a gate after KAIROS risk. The order is market, strategy, arbitration, KAIROS risk, security, execution. The score is not increased by an audit or by Smart Money.

The research brain projects this context when the row has one. See [RESEARCH_BRAIN.md](RESEARCH_BRAIN.md). The human-readable summary is `summarizeContext`. It copies structured fields. A model does not write it.

`OpportunityState` is `NONE`, `WATCH`, `EMERGING`, `QUALIFIED`, `BLOCKED`, `EXPIRED`, `MONITORING`, `RISK_REDUCTION`, or `EXIT_REQUIRED`. It describes evidence maturity. A closed session can still be `QUALIFIED`. A security `BLOCK` is `BLOCKED` in both modes. An active tokenized-security restriction is also `BLOCKED`. With no open position, unknown security is `BLOCKED` on the default live fidelity and may proceed on paper fidelity with the reason suffix `PAPER_ONLY. SECURITY_UNVERIFIED.` An open position uses the previous review: `MONITORING` for a hold, `QUALIFIED` after an add, `RISK_REDUCTION` after a reduce, `EXIT_REQUIRED` after an exit, and `BLOCKED` after a blocked review. Live unknown security with an open position stays `BLOCKED` and the reason starts with `LIVE_SECURITY_UNKNOWN`. A qualified opportunity can name an earnings window. News does not block it. Opportunity is not an order.

External confirmation distinguishes `NO_SIGNAL`, `SOURCE_UNAVAILABLE`, and `SOURCE_ERROR`. An empty present signal set is `NO_SIGNAL`. An absent read is `SOURCE_UNAVAILABLE`. A provider error is `SOURCE_ERROR`. A failure is not evidence that no signal exists, and it does not change the arbitration score. `externalSignals` stay omitted when the slice is unavailable. `externalAbsence` is copied onto the arbitration view and the KAIROS context.

`PositionManager` is implemented by `DeterministicPositionManager`. `POSITION_MANAGER_IMPLEMENTED` is true. The paper cycle calls `evaluatePosition` when a paper position is open and the row has a KAIROS context. The decision is not an execution. `PositionContextDiff` compares the entry snapshot, the previous cycle, and the current cycle. See [POSITION_MANAGER.md](POSITION_MANAGER.md) and [POSITION_THESIS.md](POSITION_THESIS.md).

## Replay

`serializeContext` / `restoreContext` round-trip the context as JSON. The snapshot has no signing key and no API key. A later explanation can show the information that was available at `snapshotTimestamp`.

Transition memory is process-local and keyed by user and asset. The first observation is stored and is not an event. A later change can emit session, reference-freshness, regime, opportunity, or strategy-selection transitions. See [EVENT_INTELLIGENCE.md](EVENT_INTELLIGENCE.md).
