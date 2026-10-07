# FMP integration

Financial Modeling Prep is the underlying-equity event provider. It is not a trading venue and it does not see token contracts.

Official stable base: `https://financialmodelingprep.com/stable/`

This workspace checked the current FMP docs pages for the Earnings Report API and the Search Stock News API on 2026-10-06. The static pages name these endpoints:

```text
GET /stable/earnings?symbol={ticker}
GET /stable/news/stock?symbols={ticker}
```

Authentication in the current FMP examples is the `apikey` query parameter. KAIROS reads that value from server env `FMP_API_KEY`. The key is not prefixed with `NEXT_PUBLIC_`. It is not written into context snapshots, research records, logs, or rendered HTML.

No real FMP request was sent while this phase was built. Response fields below are the ones the mapper accepts. A field that is absent stays null.

## Earnings fields

| FMP field | Normalized field | When missing |
| --- | --- | --- |
| `symbol` | `underlyingTicker` | Row is dropped when it is not the requested ticker |
| `date` | `reportedDate` | null, and the state is `UNKNOWN` unless actuals exist |
| `time` | `reportTime` | `UNKNOWN`. `bmo` is `BEFORE_OPEN`. `amc` is `AFTER_CLOSE`. Any other token stays `UNKNOWN` |
| `epsEstimated` | `epsEstimated` | null |
| `epsActual` | `epsActual` | null |
| `revenueEstimated` | `revenueEstimated` | null |
| `revenueActual` | `revenueActual` | null |
| `lastUpdated` | `sourceUpdatedAt` | null |

KAIROS calculates `epsSurprise`, `epsSurprisePct`, `revenueSurprise`, and `revenueSurprisePct` only when both sides are present. A zero estimate keeps the absolute surprise and sets the percent to null. Quarter is not manufactured.

Status is `TODAY` when the reported calendar date is the cycle's UTC date, `REPORTED` when an actual EPS or revenue is present on another date, `UPCOMING` when the date is in the future and no actual is present, and `UNKNOWN` otherwise. A past date without actuals is not treated as reported.

## News fields

| FMP field | Normalized field | When missing |
| --- | --- | --- |
| `symbol` | `underlyingTicker` | Row is dropped when the symbol is present and is not the requested ticker |
| `title` | `headline` | Row is dropped |
| `text` | `snippet` | null. Stored text is capped at 280 characters. The rest is not kept |
| `publisher` or `site` | `publisher` | null |
| `publishedDate` | `publishedAt` | Row is dropped |
| `url` | `url` | null |
| `image` | `imageUrl` | null |
| `id` | part of `newsId` | A hash of the URL, or of headline + time + ticker, is used |

A headline is `OBSERVED_NEWS`. It is not a buy or a sell.

## Errors

`NOT_CONFIGURED`, `AUTHENTICATION_ERROR`, `RATE_LIMITED`, `TIMEOUT`, `UPSTREAM_ERROR`, `INVALID_RESPONSE`, and `UNKNOWN_ERROR`.

A failure leaves `newsItems` and the earnings event null. It is not stored as "no news" or "no earnings". An HTTP 200 array that is empty is an answer with an empty list.

The server warms the watchlist, plus open paper symbols, once per page or observation request. Each ticker then uses the process cache: news for 5 minutes and earnings for 45 minutes by default. `cachedAt` is the cache time. It is not `publishedAt` or `lastUpdated`. A 429 sets a backoff and does not replace a fresh cache entry. A cold cache is `EVENT_CACHE_COLD`, which is still a provider failure.

`FMP_LIVE_TEST=1` together with `FMP_API_KEY` enables `events/fmp-live.integration.test.ts`. The default suite does not call FMP.
