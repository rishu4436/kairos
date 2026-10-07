# KAIROS real provider evidence

## Phase 17I — 2026-10-07

This is **RECORDED REAL PROVIDER EVIDENCE**, not a live response when replayed.
Binance authenticated market data and Redis context replay succeeded. Qwen's
single authorized request failed authentication; the complete intelligence
chain is therefore **NOT VERIFIED**.

| Proof | Result | Record |
| --- | --- | --- |
| Signed Binance TSLA discovery | HTTP 200; credentials/signature accepted; 820 ms | [Authentication](evidence/phase-17i-auth.json) |
| Binance RWA price and candles | HTTP 200; real prices; 100 ascending 15-minute candles | [Market context](evidence/phase-17i-market.json) |
| Deterministic features / built-in strategies / arbitration | GOOD data; RANGE_BOUND; HOLD / HOLD / NO_SIGNAL; NO_OPPORTUNITY | Same market record |
| Public tokenized-securities information | HTTP 200; TSLAon on BSC; 591 ms | [Skills](evidence/phase-17i-skills.json) |
| Token audit on that exact chain and contract | HTTP 200; provider returned UNSUPPORTED; 726 ms; risk fields null | Same skills record |
| Real Redis context persistence / reconnect replay | PASS; complete context and research projection match | Same market record |
| Qwen research | HTTP 401; AUTHENTICATION_ERROR; 840 ms; no thesis | [Qwen](evidence/phase-17i-qwen.json) |

Asset: underlying **TSLA**, representation **TSLAon**, Ondo Finance, BSC **56**,
contract `0x2494b603319d4d9f9715c9f4496d9e0364b59d93`. It was resolved from the
provider, not supplied manually. The authenticated discovery also returned
other representations; this proof uses exactly the Ondo BSC identity.

Capture: `2026-10-07T07:52:48.058Z` (13:22:48 IST).
Cycle: `cycle:user_phase17i:2026-10-07T07:52:48.058Z`.
Context: `ctx:user_phase17i:56:0x2494b603319d4d9f9715c9f4496d9e0364b59d93:cycle:user_phase17i:2026-10-07T07:52:48.058Z`.

Token price and Binance per-share conversion were both `378.63715` at
`2026-10-07T07:52:43.905Z`; deviation 0%. The reference is not an official
traditional-exchange stock quote. Candles end at `2026-10-07T07:45:00.000Z`.
Source timestamps, OHLC values, features, confidence, rejection reasons,
candidate scores, and safe endpoint latencies are in the market record.

Market session was UNKNOWN. Momentum HOLD (0.42); Mean Reversion HOLD (0.40);
Weekend/off-hours NO_SIGNAL (0, INSUFFICIENT_DATA). No strategy was eligible.
Selected strategy and score are null. External signals are unavailable, security
is unavailable after the unsupported audit, and opportunity state is BLOCKED.
FMP news and earnings are UNAVAILABLE / NOT_CONFIGURED, not absent events.

Qwen requested `qwen3.8-max`, prompt 1.1, at `2026-10-07T07:54:13.483Z`.
No response model or output was returned. Schema validity is false and semantic
validation did not pass because authentication failed. No proposal, experiment,
or promotion occurred. Another request requires explicit authorization.

The evidence user is separate from demo/paper trading state. Only the sanitized
context/projection was persisted under a dedicated `kairos:v1:evidence:phase17i:`
record. A new Redis connection reloaded it without rebuilding inputs.

No quote, swap build, transaction simulation, wallet connection, signing of a
wallet transaction, broadcast, real trade, Studio deployment, wallet funding,
registration, commerce publication, or x402 spend occurred. HTTP API
authentication uses the existing HMAC client; it is not wallet signing.
