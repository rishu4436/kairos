# News intelligence

Company news is observed context for the underlying ticker. A headline is not a trade signal, a sentiment score, or an order.

## Freshness

Thresholds are KAIROS policy and can be overridden with `FMP_NEWS_FRESH_MS`, `FMP_NEWS_RECENT_MS`, and `FMP_NEWS_AGING_MS`.

| Age | State |
| --- | --- |
| Under 2 hours | `FRESH` |
| 2 to 12 hours | `RECENT` |
| 12 to 48 hours | `AGING` |
| Older than 48 hours | `STALE` |

Stale articles stay in the process archive. They leave the current context, so they do not influence the cycle. The archive is not a promise that the article still exists at the publisher.

## Limits

The current context keeps the latest 10 non-stale items per underlying (`FMP_NEWS_CONTEXT_LIMIT`). Research receives at most 5 (`FMP_RESEARCH_NEWS_LIMIT`). The same article is kept once. The id is the provider id when FMP sends one, otherwise a hash of the URL or of the normalized headline, time, and ticker.

## Research

`OBSERVED_NEWS` must cite a news id that is in the context. `OBSERVED_EARNINGS` must cite the earnings event id, and a date, EPS, or revenue in that statement must be one of the provider figures. Unavailable news may be described as unavailable. It may not be described as "no relevant news."

Qwen does not become the source of record for an earnings date, EPS, revenue, publisher, article time, or corporate-action status. Prompt version stays `1.1`.

## Scope

The server fetches FMP only for watchlist tickers and open paper symbols. The cache is keyed by ticker because the payload is public. It stores no user id and no position. Each user's `KAIROSContext` is still built separately, and two tokenized representations are not merged because they share an underlying ticker.
