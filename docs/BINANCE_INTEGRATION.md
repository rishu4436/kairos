# Binance Web3 integration

KAIROS reads tokenized-equity market data from the official Binance Web3 API. Market observation does not quote, sign, or broadcast.

API references:

- https://web3.binance.com/en/dev-docs/introduction
- https://web3.binance.com/en/dev-docs/authentication
- https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api
- https://web3.binance.com/en/dev-docs/llms.txt
- https://web3.binance.com/en/dev-docs/products/market-api/introduction
- https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data

The RWA field names below match that catalog and the OpenAPI models generated into the official `binance/binance-web3-connector-js` repository. Two timestamp names were missing from the rendered HTML and were taken from those generated models. Source timestamps are mapped from dataUpdateTime and timestamp; receive time is kept separately.

## Endpoints in use

Base URL: `https://web3.binance.com/build`

Every call is a signed `GET`. The signed path includes the `/build` prefix.

| Purpose | Method and path |
| --- | --- |
| Issuance platforms | `GET /api/v1/dex/market/rwa/platforms` |
| Resolve a ticker to representations | `GET /api/v1/dex/market/rwa/search?keyword=` |
| Status, volume, and token metadata for one chain | `GET /api/v1/dex/market/rwa/tokens?binanceChainId=` |
| On-chain price, reference price, and price time | `GET /api/v1/dex/market/rwa/price?binanceChainId=&tokenContractAddresses=` |

`tokenContractAddresses` is comma-separated, at most 100 addresses per call.

Separate execution adapters:

- `GET /api/v1/dex/market/rwa/underlying-profile`
- `GET /api/v1/dex/market/rwa/underlying-market`
- `POST /api/v1/dex/market/price` and the other general token routes
- Aggregator quote, swap, simulate, and broadcast
- Market WebSocket (`wss://web3-stream.binance.com/w3w/stream`)

Search is unfiltered. The documented `platformId` filter is only `ondo` or `bstock`. Leaving it off keeps every representation the search returns, including a platform id that is not in that enum. KAIROS does not assume a ticker has an Ondo, bStocks, or xStock token, and it does not hard-code contract addresses.

Chain id `56` is BNB Smart Chain, `1` is Ethereum, and `CT_501` is Solana, as documented. Other chain ids are kept as returned. Rows on BNB Smart Chain are shown first.

## Authentication

From the authentication guide:

- Header `X-OC-APIKEY`: API key from the Binance Web3 developer portal.
- Header `X-OC-TIMESTAMP`: UTC ISO 8601 with milliseconds.
- Header `X-OC-SIGN`: Base64 HMAC-SHA256 of `timestamp + METHOD + requestPath + body`.
- Header `X-OC-NONCE`: a random id. The guide says the signature is the fallback when this is omitted.
- Header `X-OC-RECV-WINDOW`: milliseconds, default 5000, maximum 60000.

`requestPath` is the raw path and query, starting with `/build`. The body of a GET is empty. Query values use `encodeURIComponent` so a space is `%20`.

KAIROS signs on the server with Node `crypto`. The browser never receives the key or secret.

## Response mapping

Transport types live in `services/binance/types.ts`. Domain records live in `domain/observation.ts`.

| Source | Domain |
| --- | --- |
| Search `ticker`, `companyName` | Underlying ticker and name |
| Search `assets[]` | One tokenized representation each |
| `platformId` | Stored as returned. `ondo` displays as Ondo Finance. `bstock` displays as bStocks. |
| `binanceChainId` | `chainId`, with a display label only for the three documented ids |
| `tokenContractAddress`, `tokenSymbol` | Contract and token symbol |
| `assetType` 1, 2, 3 | `stock`, `pre_ipo`, `etf`. Anything else is `unknown`. |
| Price `tokenPrice` | Token price, decimal string |
| Price `referencePrice` | Reference price, decimal string |
| Price `tokenPriceUpdatedAt` | Freshness source time |
| Token `statusInfo.marketStatus` | `OPEN`, `PRE_OPEN`, `POST_CLOSE`, `CLOSED`, or `UNKNOWN` |
| `openState`, `reasonCode`, `reasonMsg` | Kept on the observation |
| `statusInfo.nextOpenTime`, `nextCloseTime` | ISO timestamps when the value parses |
| Token `volume24H`, `marketCap` | Liquidity snapshot, USD strings |
| Envelope `timestamp` | Logged as response time. It is not the price time. |

`regular` maps to `OPEN`, `premarket` to `PRE_OPEN`, `postmarket` to `POST_CLOSE`, and `closed` to `CLOSED`. `overnight` and `pause` stay `UNKNOWN`, and the raw value is still shown.

Reference deviation, only when both prices parse and the reference is not zero:

```text
((tokenPrice - referencePrice) / referencePrice) * 100
```

The field is named reference deviation. The price guide says `referencePrice` is a per-share conversion of the on-chain token price, not an official stock-market quote. The RWA token and price schemas used here do not include a 24-hour percent change. The live board shows that as unavailable. `volume24H` is a USD volume, not a percent.

Freshness uses `tokenPriceUpdatedAt` against the time KAIROS received the payload. Under 30 seconds is `FRESH`, under 120 seconds is `AGING`, and older is `STALE`. A missing or future source time is `UNKNOWN`. Those thresholds are KAIROS policy, overridable with `KAIROS_FRESH_MAX_MS` and `KAIROS_AGING_MAX_MS`.

## Errors and limits

The authentication guide documents these gateway codes. The Market API error-codes page did not load during this build, so business codes beyond this table were not copied from that page.

| HTTP | Code | KAIROS category |
| --- | --- | --- |
| 400 | 40001 | `INVALID_REQUEST` |
| 401 | 40101, 40102, 40103 | `AUTHENTICATION_ERROR` |
| 403 | 40104 | `AUTHENTICATION_ERROR` |
| 429 | 42900 | `RATE_LIMITED` |
| 500 | 50000 | `UPSTREAM_ERROR` |
| 503 | 50001 | `UPSTREAM_ERROR` |

Documented limits, not measured against this account: 1200 requests per 60 seconds per IP, 1200 per API key, 6000 per user, and a default of 5 requests per second per endpoint. HTTP 429 includes `Retry-After`. KAIROS retries a rate limit, 500, 503, or timeout up to three times. It does not retry an authentication failure.

Missing `BINANCE_WEB3_API_KEY` or `BINANCE_WEB3_SECRET_KEY` throws before any request. The board says the API is offline because credentials are missing. It does not load the paper prices.

## Environment

| Variable | Required for live | Meaning |
| --- | --- | --- |
| `KAIROS_DATA_MODE` | No | `live` or `paper`. Default `paper`. `mock` means paper. |
| `BINANCE_WEB3_API_KEY` | Yes | `X-OC-APIKEY` |
| `BINANCE_WEB3_SECRET_KEY` | Yes | HMAC secret |
| `BINANCE_WEB3_BASE_URL` | No | Default `https://web3.binance.com/build` |
| `BINANCE_WEB3_RECV_WINDOW_MS` | No | Default 5000, max 60000 |
| `KAIROS_REQUEST_TIMEOUT_MS` | No | Default 10000 |
| `KAIROS_REFRESH_INTERVAL_MS` | No | Default 15000, minimum 5000 |
| `KAIROS_FRESH_MAX_MS` | No | Default 30000 |
| `KAIROS_AGING_MAX_MS` | No | Default 120000 |

`NEXT_PUBLIC_KAIROS_DATA_MODE` is still read when `KAIROS_DATA_MODE` is unset. Do not put the API key in a `NEXT_PUBLIC` variable.

## Run live mode

1. Create a key in the Binance Web3 developer portal.
2. Copy `.env.example` to `.env`.
3. Set `KAIROS_DATA_MODE=live`, `BINANCE_WEB3_API_KEY`, and `BINANCE_WEB3_SECRET_KEY`.
4. `npm run dev` and open the command center.

The local watchlist is NVDA, TSLA, AAPL, MSFT, AMD, and SPY for `user_demo`. Symbols and contracts come from search results.

`npm test` does not call Binance. `services/binance/integration.test.ts` runs only when `BINANCE_WEB3_API_KEY` is set in the environment.

The dashboard polls `GET /api/observations`. One request is in flight at a time. The interval comes from `KAIROS_REFRESH_INTERVAL_MS`. Transient failures back off up to 30 seconds. Leaving the page aborts the current request.
