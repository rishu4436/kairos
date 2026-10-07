# Earnings intelligence

Earnings context describes the underlying public company. It does not describe the tokenized representation and it does not create an order.

## Two sources

| Source | What it is |
| --- | --- |
| Binance tokenized-security status | A trading restriction or market status on one chain and contract. An earnings reason is the provider's restriction text. It is not an EPS and not a date |
| FMP earnings | A scheduled or reported underlying earnings row: date, timing, estimates, and actuals when FMP sent them |

They can corroborate. `CorrelatedMarketEvent` is `CORROBORATED` only when a Binance earnings restriction and an FMP date fall inside the KAIROS window around the Binance effective time. Otherwise the records stay `INDEPENDENT`. KAIROS does not invent a match.

## Window

These defaults are KAIROS policy, version `1.0`. They are not exchange rules.

| Window | Rule |
| --- | --- |
| `PRE_EVENT` | 1 to 3 UTC calendar days before the reported date |
| `EVENT_DAY` | The same UTC date |
| `POST_EVENT` | The first 2 UTC calendar days after the reported date |
| `NORMAL` | Every other day, or a missing date |

`EVENT_PRE_DAYS` and `EVENT_POST_DAYS` override the counts. A date alone does not imply before-open or after-close timing.

## What the position manager does

An elevated window (`PRE_EVENT`, `EVENT_DAY`, `POST_EVENT`) adds `EVENT_UNCERTAINTY` to a hold. It does not exit.

`EVENT_REDUCTION_ENABLED=1` is paper-only. On a `PRE_EVENT` window it can produce one partial `REDUCE` through the existing 2,500 bps rule, and that intent still passes risk. Live fidelity leaves the flag off. A news headline cannot exit. A model hypothesis cannot exit. A Binance `TRADING_RESTRICTION` still follows the existing security and tradability rules.

## Opportunity

A tokenized-security restriction can mark the opportunity `BLOCKED`. An earnings window can add an uncertainty sentence to a `QUALIFIED` opportunity. News does not block the opportunity. The arbitrator may see `eventWindow`. It does not add score points.
