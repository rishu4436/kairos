# Developer experience notes

Observations from the KAIROS Binance Web3 integration on 2026-10-03. These are notes from this build. Latency and rate-limit behavior were not measured, because this workspace had no API key and no credentialed call was made.

## What was straightforward

- The authentication page states the header names, the pre-hash formula, and that the signed path must include `/build`. It names `40102` as the failure when that prefix is omitted. The Node sample uses `crypto.createHmac("sha256", secret).update(preHash, "utf8").digest("base64")`.
- `llms.txt` lists the six RWA routes and separates them from aggregator quote and swap. That made the read-only surface clear.
- The RWA search route takes a keyword and returns ticker, company name, and assets with platform, chain, contract, and token symbol. That is enough to avoid hard-coding contracts.
- The price route returns `tokenPrice`, `referencePrice`, and `tokenPriceUpdatedAt` as a batch of up to 100 contracts on one chain.
- The token list returns `statusInfo` (`openState`, `marketStatus`, `reasonCode`, `reasonMsg`) plus `volume24H` and `marketCap` on the same object as the token identity.
- Gateway errors on the authentication page are a small table: 40001, 40101, 40102, 40103, 40104, 42900, 50000, 50001.

## Friction

- `curl` against `https://web3.binance.com/en/dev-docs/llms.txt`, the introduction, and the authentication page returned HTTP 202, an empty body, and `x-amzn-waf-action: challenge`. The pages were readable through the documentation browser, not through that client.
- A fetch of `llms-full.txt` returned a short index. A search of that body did not contain `statusInfo` or the RWA field tables.
- The rendered RWA reference shows two `int64 | null` fields, "Expected next market open time" and "Expected next market close time", between `reasonMsg` and the next object. The JSON property names are not in that HTML. The same names are present on the OpenAPI models in `binance/binance-web3-connector-js`: `nextOpenTime` and `nextCloseTime`. The generated file comment matches the rendered description.
- `referencePrice` is easy to read as an official underlying quote. The field description says it is a per-share conversion of the on-chain token price, not an official traditional-market quote. Deviation against it is not a stock-market basis.
- The RWA `platformId` filter documents only `ondo` and `bstock`. The Trading API introduction separately describes xStock as equity type 2. The RWA pages inspected here do not say whether an unfiltered search returns xStock. KAIROS does not filter, and it displays an unknown platform id as the string that comes back.
- No 24-hour percent field appears on the RWA price object or the RWA token object. `volume24H` is USD volume. A dashboard cannot show a real 24h change from these routes.
- The Market API error-codes page failed to load. Gateway codes came from the authentication page only.
- Example environment variable names are not one scheme. The Python connector page uses `BINANCE_API_KEY` and `BINANCE_API_SECRET`. The wire headers are `X-OC-APIKEY` and an HMAC secret. Those names are easy to confuse with Binance spot API keys. KAIROS uses `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY`.
- The official JavaScript connector README requires Node.js 22.12.0 or later. This app is typed for Node 20. The package also covers quote, swap, and broadcast, which this phase must not call. Signing stayed in application code with Node `crypto`. No SDK was added.
- Setup time for a developer-portal project was not measured. No key was available in this workspace, so only the missing-credential path was exercised locally.

## Limits we designed around, without measuring them

The authentication page says 1200 requests per 60 seconds per IP and per key, 6000 per user, and a default of 5 requests per second per endpoint. A watchlist snapshot here is one platforms call, one search per ticker, one token list per chain that search returned, and one price batch per chain. The command center polls no faster than every 5 seconds, default 15. That budget is from the published limits, not from a 429 seen in this repo.

## Market candle route, inspected 2026-10-03

A later pass of the Market API introduction and the general-data reference named `GET /api/v1/dex/market/candles`. The same signed headers apply. Query fields in that reference are `binanceChainId`, `tokenContractAddress`, `bar`, `after`, `before`, and `limit`. `after` is an exclusive end time. `before` is an exclusive start time. `bar` defaults to `1m` and includes `15m`. `limit` defaults to 100. The reference does not state a maximum limit, so KAIROS sends 100.

`data` is a list of positional rows: open, high, low, close, volume, timestamp in milliseconds, tradeCount. The REST text says "volume" and does not name the unit. The candlestick WebSocket schema calls volume USD. KAIROS stores the REST number and does not relabel it. The reference also does not say whether rows arrive oldest-first. The history store sorts by timestamp.

The market error-code table, which did not load in the earlier pass, was readable on this pass. Candles are listed with 40001, 40411, 50000, and 50001. No candle request was sent from this workspace, so those codes were not observed on the wire. Latency was not measured.

Phase 4 arbitration is local policy on signals the app already computed. No additional Binance endpoint was called, and no new latency or rate observation was collected.

Phase 12 context fusion reads those same observation and skill stores once per asset per cycle. It does not add a Binance call, a news vendor, or an earnings vendor. No new latency was measured. A missing skill result stays `UNAVAILABLE`. A paper sample stays on the local series.

Phase 6 research does not call Binance by itself. A thesis generation in live mode uses the existing candle history path. No credentialed xAI or Qwen call was made from this workspace, so no model latency was measured. A mock latency of 0 is the provider's fixed value, not a measured round trip. xAI targets `https://api.x.ai/v1/responses` when `KAIROS_LLM_PROVIDER` is `xai`. Qwen targets the workspace Chat Completions URL when the provider is `qwen` and `KAIROS_QWEN_BASE_URL` is set. Set `KAIROS_LLM_LIVE_TEST=1` together with a key to run an optional credentialed test. The Qwen live test also requires `KAIROS_LLM_PROVIDER=qwen` and the base URL. The default suite does not call either provider. The key is not written into client code. A failed model call stays `MODEL_ERROR` and is not replaced by the mock lab or by the other provider.

The Qwen Responses API documents `qwen3.8-max`, but the structured-output page puts JSON Schema on Chat Completions and does not list that field on the Responses body. The adapter follows the structured-output page. No rate-limit response was observed.

## REAL MODEL EXECUTION

The adapter records request id, start, completion, latency, provider, model, and status for the last attempt. A thesis record keeps the same fields plus prompt version `1.1`, context timestamp, context data version, and source type. It does not keep the API key or the raw provider body. Live history that is missing or shorter than 30 bars fails closed. The Research Lab shows `LLM NOT CONFIGURED` until a successful request, and each thesis shows its own `MOCK` or `LLM` source. There is no automatic strategy promotion and no execution authority on this path.

Phase 7 execution preparation was written from the 2026-10-01 Trading, Transaction, and Wallet catalogs. No credentialed quote, swap, simulation, or balance call was made, so latency, rate-limit headers, and simulation revert text were not observed.

Onboarding still uses the existing signed Web3 client. The new fact that slowed the mapping is that `/quote` does not return `expiresAt` or an execution price, while the prose says the `quoteId` lasts about 30 seconds. `amount` is a smallest-unit integer, and equity routes require `userWalletAddress` even though KAIROS must not sign. `/swap` returns an unsigned `tx`, and the simulate call is a separate POST. Its `status` is `SUCCESS` or `FAILED`, with `failReason` only on failure, and it does not return an id. RFQ and SWAP are different later signing paths. This phase stops before both. Wallet balance rows are human-readable `balance` strings, not smallest units, and the mapped call does not return a portfolio USD total.

Phase 8.1 re-checked the installed tooling on 2026-10-04. Node was `v24.18.0`. The installed skill was still `1.11.0` with required CLI `1.9.0`. `cli-check` said the installed `baw` `1.9.0` did not need an update. `skill-check` again offered `1.12.0` and that update was left uninstalled. `wallet status` was `UNCONNECTED`. `auth signin` succeeded and returned a pairing URL, a pairing code, a QR id, and an expiry. Those values were not stored. `auth verify` was not run, so no App confirmation time, address, balance, policy, quote, simulation, or order status was observed. The market API key was absent, so TSLA was not resolved from the RWA endpoint. The CLI still has no documented multi-user session flag. `wallet settings` still does not return the allow-list when `tradeAllTokens` is false.

Phase 5 paper execution is also local. It reuses the observation, the strategies, the arbitrator, the existing risk function, and the existing paper ledger. It does not call a new Binance route, a wallet, or a chain client. No new latency or rate observation was collected.

Phase 11 adds in-memory strategy performance. No new database, news API, or live activation was added. Expectancy is net PnL divided by completed trades. Sample thresholds are 10, 30, and 100. A paper fill records its existing strategy, intent, execution, and correlation ids. Experiment rows use a separate dataset. No latency was measured.

Phase 13 position management stays inside the paper cycle. It adds no Binance route, no wallet call, and no second execution path. Paper security that was not evaluated is labeled `PAPER_ONLY` / `SECURITY_UNVERIFIED` and can continue in simulation. The same unknown security on live fidelity still blocks the opportunity. A skill failure is `SOURCE_ERROR` or `SOURCE_UNAVAILABLE`. It is not stored as `NO_SIGNAL`. Position memory is process-local. No latency was measured.

Phase 15 adds one autonomous cycle, an in-memory state store, and a Redis-compatible adapter. No Redis server was required. `KAIROS_STATE_BACKEND=redis` without `REDIS_URL` fails closed. The default backend is ephemeral memory. No background loop starts during tests or build.

Phase 14 adds Financial Modeling Prep for underlying earnings and company news. The stable endpoints are `GET /stable/earnings?symbol=` and `GET /stable/news/stock?symbols=`, with the `apikey` query parameter. No credentialed FMP call was made from this workspace while the phase was written, so latency and rate-limit headers were not measured. A missing `FMP_API_KEY` stays `NOT_CONFIGURED`. The optional live test is `FMP_LIVE_TEST=1`.

Phase 10 checked Agent Studio on 2026-10-04. `bnbagent` is not a command. The current docs install `@bnbagent/studio-cli` and invoke `bag`. `bag --version` printed `bag 0.0.5`. `npm ls -g` showed `@bnbagent/studio-cli@0.0.14`. Node was `v24.18.0`. Python was `3.14.6`. `pip show bnbagent` showed `0.4.6`. `@bnbagent/sdk` was not added to this app. `bag doctor` failed with `no studio.toml found in cwd or any parent directory.` No wallet was created, no ERC-8004 register ran, no deploy ran, and no x402 payment ran. The docs describe deploy targets `bnb`, `aws`, and `azure`, and the v4 blog adds NodeOps. This CLI's `bag deploy --help` defaults to AgentCore and does not list NodeOps. Its top-level help also does not list `mcp`, which the current docs describe as `bag mcp serve`. Those gaps were not timed. The CLI was not upgraded.

Phase 9 read the current Skills Hub documents on 2026-10-04 and did not install them. `baw --version` was `1.9.0`. Local skills contained `binance-agentic-wallet` 1.11.0 and did not contain trading-signal, query-token-audit, tokenized-securities-info, or wallet-tracker. Hub versions were trading-signal 3.5 (`requiredCliVersion` 1.9.1), query-token-audit 1.4 (no CLI requirement), tokenized-securities-info 1.1 (no CLI requirement, Ondo type 1), and wallet-tracker 1.3 (`requiredCliVersion` 1.9.1). The CLI was not upgraded.

Smart Money's current reference says to run `node <skill-dir>/scripts/cli.mjs smart-money` and describes the JSON fields. It does not publish an HTTP URL. The script is absent, so the live read is unavailable. No guessed host was called. Token audit is documented as `POST https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit` with `User-Agent: binance-web3/1.4 (Skill)` and header `source: agent`. Tokenized status is documented as public GETs under `https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/` with `User-Agent: binance-web3/1.1 (Skill)`. Neither request was sent, so latency, rate limits, and error bodies were not measured. Authentication for those two public routes is not an API key in the skill text. Wallet tracker commands were not run. No trade was signed or broadcast.

Phase 16, 2026-10-07. The current Studio docs and the installed CLI still disagree. `bag --version` is `0.0.5`. `npm view @bnbagent/studio-cli version` is `0.0.14`, published 2026-09-20, with bin `dist/bag.js`. Installed `bag deploy --help` is AgentCore (`prepare`, `agent`, `verify`, `status`, `info`, `destroy`, `logs`, `fix-gitignore`, `provision-cognito`). It does not show `--provider bnb`. `bag mcp --help` is an invalid choice. `bag doctor` still says no `studio.toml`. No `studio.toml` was invented, and the global CLI was not upgraded. The official command left for an explicit approval is `npm install --global @bnbagent/studio-cli`.

Node is v24.18.0 and satisfies the docs' Node 22 requirement. Corepack is 0.35.0. pnpm is 11.10.0 while the Studio quickstart asks for pnpm 10. Bun is 1.4.2. None of those global tools were installed or downgraded by this phase.

`bag skills install` installs into Claude Code and Cursor, not into this repository. It was not run. The Skills Hub install line `npx skills add` was not run either, because it writes agent skill directories. The wallet skill on `main` is now 1.12.0 and requires `baw` 1.10.0. Installed `baw` is still 1.9.0. That upgrade is saved for Phase 17.

One public read did run: tokenized-securities list, type 1, User-Agent `binance-web3/1.1 (Skill)`, 769 ms, HTTP 200, code `000000`, 1366 rows. TSLA resolved to `TSLAon` on chain 56, chain 1, and `CT_501`. No wallet, no audit POST, no trade. `BINANCE_WEB3_API_KEY`, `FMP_API_KEY`, Qwen settings, and `REDIS_URL` were unset, so those providers stay `NOT_CONFIGURED`. The durable tests use an in-memory Redis command transport. A local RESP fake proved the worker client. No production Redis was contacted. Identity was not registered.

Phase 17C and 17D, 2026-10-07. `npm install --global @bnbagent/studio-cli` completed. The published version is still 0.0.14 and the bin is `dist/bag.js`. Windows still resolves plain `bag` to `C:\Users\rishu\AppData\Local\Programs\Python\Python314\Scripts\bag.exe`, which is pip package `bnbagent-studio` 0.0.5. The npm binary is `C:\nvm4w\nodejs\bag.cmd` and prints `0.0.14`. PATH was not edited and the Python package was not uninstalled. The npm CLI itself is not version 0.0.5.

`bag.cmd init` writes the project into the current directory. The directory name cannot contain a hyphen. `--no-onboard --no-install --no-auto-topup --llm-provider none` produced a TypeScript workspace with `packageManager: pnpm@10.24.0`, `app/agent/studio.toml`, and a seller entrypoint whose signing stays in generated `signing.ts`. That seller was not copied into KAIROS. Global pnpm stayed 11.10.0. The Studio workspace records the pnpm 10.24.0 pin and does not install dependencies.

The same npm install blocked lifecycle scripts for `esbuild@0.28.2`, `@azure/msal-node-extensions@5.5.2`, and `keytar@7.9.0`. `bag.cmd --help` still ran, so those scripts were left blocked. A later wallet or bundle step that needs `keytar` or the esbuild binary should name the exact failure before anyone enables the scripts.

`bag.cmd` has no `mcp` command. `deploy prepare` is described as a readiness sweep. Its `--backend` help says the flag selects a platform contract without deploying. No wallet, no registration, and no `bag deploy --provider` were run in the project-creation pass.

Phase 17E. The Studio workspace pins `pnpm@10.24.0`. Corepack can run that pin from `studio/bnb` while `pnpm --version` outside the workspace stays 11.10.0. The scaffold's `pnpm-workspace.yaml` sets `allowBuilds.esbuild` because the generated comment says pnpm 11 otherwise blocks the esbuild binary script. That is the scaffold setting, not a blanket approval of every package script. Global npm still blocks `esbuild`, `@azure/msal-node-extensions`, and `keytar` install scripts for the global CLI. Those were not enabled.

`KAIROS_BAG_BIN` exists because PATH order makes plain `bag` the Python 0.0.5 program. Preflight uses the explicit binary when the variable is set and does not hard-code a machine path. Studio IPFS and KAIROS Redis are different systems. A missing pinning key does not configure Redis.

Hot-token rankings and `POST /api/v1/dex/market/price-info` were not added. The ranking is market-wide, and the watchlist already has an RWA price. Adding them would spend the per-endpoint budget without serving the three strategies. Candle fetches are sequential, cached for 10 minutes, and retried no sooner than 60 seconds after a failure. That schedule is a local choice on top of the published 5 requests per second default. It is not a measured rate-limit result.
