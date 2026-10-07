# Binance market data

KAIROS already reads RWA identity and prices. The candle adapter supplies historical candles for representations that search already resolved. It does not quote, sign, or broadcast.

API references:

- https://web3.binance.com/en/dev-docs/products/market-api/introduction
- https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/general-data
- https://web3.binance.com/en/dev-docs/products/market-api/error-codes
- https://web3.binance.com/en/dev-docs/authentication

No candle call was made from this workspace. Field notes below are from those pages, not from a live payload.

## Endpoint in use

Base URL: `https://web3.binance.com/build`

| | |
| --- | --- |
| Method and path | `GET /api/v1/dex/market/candles` |
| Auth | Same signed headers as every Web3 route: `X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`, `X-OC-NONCE`, `X-OC-RECV-WINDOW` |
| Signed path | `/build/api/v1/dex/market/candles` plus the raw query |

Query parameters from the general-data reference:

| Name | Required | Use in KAIROS |
| --- | --- | --- |
| `binanceChainId` | Yes | Chain id from the RWA search row. Examples in the docs: `1`, `56`, `CT_501`. |
| `tokenContractAddress` | Yes | Contract from that same search row. Not hard-coded. |
| `bar` | No | `15m`. The documented default is `1m`. Allowed values include `1s`, `5s`, `30s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`. |
| `limit` | No | `100`, which is the documented default. A maximum is not stated, so a larger page is not requested. |
| `after` | No | Not sent. Documented as an exclusive end timestamp in Unix milliseconds. |
| `before` | No | Not sent. Documented as an exclusive start timestamp in Unix milliseconds. |

## Response fields used

Success envelope: `code` 0, `msg`, `data`.

`data` is an array. Each row is positional:

| Index | Domain |
| --- | --- |
| 0 open | `Candle.open` scaled to 6 decimal places |
| 1 high | `Candle.high` |
| 2 low | `Candle.low` |
| 3 close | `Candle.close` |
| 4 volume | `Candle.volume`. Null when the field is empty. The REST text does not name the unit. |
| 5 timestamp | `Candle.timestampMs` |
| 6 tradeCount | `Candle.tradeCount` when present |

Rows that are short, non-numeric, or have high below low are dropped. A payload that is not an array is `MALFORMED_RESPONSE`. The history store sorts by timestamp because the reference does not state the row order. A repeated timestamp keeps the later append.

The documented example row is `[1.0001, 1.0023, 0.9987, 1.001, 125000.5, 1748600000000, 42]`.

## What was not called

- `POST /api/v1/dex/market/price` and `POST /api/v1/dex/market/price-info`. The watchlist price already comes from the RWA price route.
- Token search, hot-token rankings, holders, and top traders. Those are market-wide or unrelated to a named equity watchlist.
- The candlestick WebSocket. Polling stays the transport. The stream is documented at `wss://web3-stream.binance.com/w3w/stream` and is not opened.

RWA routes in `docs/BINANCE_INTEGRATION.md` are unchanged.

## Rate and errors

The authentication page still states 1200 requests per 60 seconds per IP and per key, 6000 per user, and a default of 5 requests per second per endpoint. KAIROS fetches candles one representation at a time, then waits 10 minutes before the next fetch for that contract. A failure waits 60 seconds before a retry. Those intervals were chosen locally. No 429 was observed, because no credentialed candle call was made.

The market error-code page lists `GET /api/v1/dex/market/candles` with `40001`, `40411`, `50000`, and `50001`. Gateway auth codes from the authentication page still apply to the signature. Mapping into KAIROS categories is the existing table in `docs/BINANCE_INTEGRATION.md`.

## Environment

No new variables. Live mode uses `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET_KEY`, and `KAIROS_DATA_MODE=live`. Paper mode does not call this endpoint.
