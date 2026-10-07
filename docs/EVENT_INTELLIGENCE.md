# Event intelligence

Events are context. They are not alpha. The fusion engine records that an event was detected. It does not emit a buy or a sell because of it.

Three layers stay separate:

| Layer | What it is | Who writes it |
| --- | --- | --- |
| `EVENT_DETECTED` | Provider status and reason, unchanged. | `MarketEvent.semantics.detected` |
| `EVENT_INTERPRETED` | A fixed label for that payload. | `MarketEvent.semantics.interpreted` |
| `EVENT_HYPOTHESIS` | A model guess about later behavior. | Not written by fusion. The field is null. |

An earnings reason means the provider reported an earnings-related restriction. It does not mean the result is known, and it does not supply an earnings date or an EPS.

## Event record

`MarketEvent` carries `eventId`, `assetId`, `type`, `status`, `source`, `observedAt`, `effectiveAt`, `expiresAt`, `confidence`, `severity`, `reason`, `details`, `semantics`, `freshness`, `origin`, and `active`.

Types: `EARNINGS`, `DIVIDEND`, `STOCK_SPLIT`, `MERGER`, `ACQUISITION`, `SPINOFF`, `MAINTENANCE`, `MARKET_STATUS_CHANGE`, `TRADING_RESTRICTION`, `PRICE_DISLOCATION`, `VOLATILITY_EVENT`, `OTHER`.

`confidence` is null unless a provider supplied one. `origin` is `REAL`, `MOCK`, or `UNAVAILABLE`. A paper cycle does not invent a tokenized-security event. Its timeline says the provider did not answer.

## What is live now

`BinanceTokenizedSecurityEventProvider` reads the status already on the observation or the skill book. It does not call the network.

Reason text maps only when it is one of: `earnings`, `dividend`, `cash_dividend`, `stock_dividend`, `stock_split`, `merger`, `acquisition`, `spinoff`, `maintenance`.

Status codes `ASSET_PAUSED`, `ASSET_LIMITED`, `MARKET_CLOSED`, and `pause` are restrictions. `MARKET_CLOSED` without a corporate reason is `MARKET_STATUS_CHANGE`. A regular `TRADING` status with no reason is an answer with zero events. It is not an empty calendar invented by KAIROS, and it is not an earnings event.

`nextOpenAt`, when the payload has it, is the end of the restriction. Otherwise the event expires `DEFAULT_EVENT_TTL_MS` (24 hours) after `observedAt`. An event is active only when the cycle clock is at or after `effectiveAt` and before `expiresAt`. An expired event becomes `EVENT_EXPIRED` and leaves the active slice.

While an event is active, freshness is `FRESH` under 30 minutes, `AGING` under 6 hours, and otherwise `STALE`.

## Providers

`EventProvider`, `NewsProvider`, and `EarningsProvider` are the extension points. KAIROS context stores the normalized reads. It does not store an FMP response object.

| Provider | Now |
| --- | --- |
| `BinanceTokenizedSecurityEventProvider` | Reads a status object that was already fetched. This is the tokenized representation |
| `FmpEarningsProvider` | Reads `GET /stable/earnings` for the underlying ticker when `FMP_API_KEY` is set |
| `FmpNewsProvider` | Reads `GET /stable/news/stock` for the underlying ticker when `FMP_API_KEY` is set |
| `MockEventProvider` | Test double. Stamps `origin` `MOCK`. Not on the default path |

Without a key, both FMP slices are `UNAVAILABLE` with reason `NOT_CONFIGURED`. A provider failure uses the same unavailable status and a specific error code. It is not an empty calendar. See [FMP_INTEGRATION.md](FMP_INTEGRATION.md), [EARNINGS_INTELLIGENCE.md](EARNINGS_INTELLIGENCE.md), and [NEWS_INTELLIGENCE.md](NEWS_INTELLIGENCE.md).

A Binance earnings restriction and an FMP earnings date stay separate records. They are marked `CORROBORATED` only inside the KAIROS date window. A raw news article does not become a `MarketEvent`. A structured FMP earnings row can, while its window is not `NORMAL`.

The timeline labels `FMP`, `News`, `Binance`, and `KAIROS` separately. A position decision is a KAIROS row. It is not written as a provider fact.

## Market transitions

Transitions fire only when a prior observation exists and the value changed.

| Edge | Label |
| --- | --- |
| `OPEN` → `CLOSED` | Market closed |
| `CLOSED` → `PRE_OPEN` | Market moved to pre-open |
| `PRE_OPEN` → `OPEN` | Market opened |
| `OPEN` → `POST_CLOSE` | Market moved to post-close |
| `POST_CLOSE` → `CLOSED` | Post-close ended |

The same detector emits reference-freshness changes, regime changes, and opportunity-state changes. Strategy selection is recorded after arbitration. The first selection is stored and is not an event. A later change is `STRATEGY_SELECTION`.

The asset terminal timeline prints the clock, the label, and the origin. `REAL`, `MOCK`, and `UNAVAILABLE` stay visible. A row is not shown as a market fact when the provider did not answer.
