# Gemini research integration

Gemini is an explicit `ReasoningProvider` for bounded thesis and declarative strategy generation. Qwen, xAI, and Gemini are supported adapters; mock is for explicit tests. No provider automatically falls back to another.

The implementation uses one direct REST POST to Google's current [Interactions API](https://ai.google.dev/api/interactions-api) per operation. This follows the [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output) without adding a dependency: KAIROS already uses injectable fetch adapters, server credentials, timeouts, and normalized errors. No deprecated SDK or third-party wrapper is used. The default is [gemini-3.8-flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), configurable through the existing provider-neutral model variable.

## Private configuration

Edit the existing ignored root `.env.local` privately:

```dotenv
KAIROS_LLM_PROVIDER=gemini
KAIROS_LLM_MODEL=gemini-3.8-flash
KAIROS_LLM_API_KEY=<your private Gemini API key>
KAIROS_LLM_TIMEOUT_MS=15000
```

Replace the existing generic credential with a Gemini key when selecting Gemini. A saved Qwen key does not configure Gemini. Preserve the Binance, Redis, and Studio settings. No `NEXT_PUBLIC` credential, Gemini base URL setting, or duplicate Gemini credential variable is needed. Restart the running server after changing private settings.

Preflight reports GEMINI READY only when Gemini is selected and the key is present; this is configuration presence, not authentication proof. The existing research UI displays Gemini, the configured model, and NOT VERIFIED until that exact provider/model has a successful request. Failures show ERROR or TIMEOUT. Previous Qwen results cannot confer Gemini CONNECTED status.

## Schemas, context, and safety

The adapter receives the same bounded `ResearchContext` as the existing pipeline. It sends `application/json` with the unchanged canonical thesis/proposal JSON Schemas. Their keywords (`type`, nullable type arrays, `properties`, `required`, `additionalProperties`, `items`, `enum`, `anyOf`, `minimum`, `maximum`) are supported by Google's documented subset. No schema projection or relaxation is needed.

Responses must pass a local exact check of those schema keywords, then the existing draft parsing, semantic evidence checks, and Strategy DSL validation. Supporting/contradicting evidence, numeric falsifiability, context citations, unavailable news/earnings, and bounded feature declarations remain required. Shared semantic validation also rejects wallet, transaction execution, and risk override instructions across narrative fields. Prompt version 1.1 and the existing research philosophy are reused.

`store:false`, `stream:false`, and `background:false` make the call stateless and synchronous. No tools, grounding, Google Search, code execution, file search, wallet capability, Binance capability, execution gateway, or promotion authority are provided. The normal configured timeout defaults to 15 seconds. There is no retry. Research failure stays non-blocking for the deterministic strategy engine.

Authentication, rate limits, timeout, model unavailability, malformed response, structured-output violation, invalid request, and upstream failure use existing error categories. Raw response headers, error bodies, and network error messages are not returned or logged. Provenance records `gemini` (the existing lowercase convention), model, prompt version, context ID, context timestamp/data version, request start/end and latency, and source `LLM`.

## One authorized live request

Implementation alone does not authorize a live request. After private configuration, the user must confirm `READY — Gemini configured`, as requested in section 21 of the supplied task.

The integration gate requires `GEMINI_LIVE_TEST=1`, selected Gemini, and a nonempty key. Default tests skip it. Once authorized, run only this test with private env loaded:

```powershell
$env:GEMINI_LIVE_TEST = '1'
node --env-file=.env.local node_modules/vitest/vitest.mjs run research/gemini-live.integration.test.ts
Remove-Item Env:GEMINI_LIVE_TEST
```

It first reads the exact previously verified TSLAon Binance context from Redis when configured and available, with equality against the recorded file. If the key is absent from an available store, it uses that same recorded file. A Redis transport failure aborts before a Gemini request. The context's timestamp remains October 7, 2026, 07:52:48.058 UTC; this proves reasoning on recorded observations, not current market freshness. No new Binance request is made.

Exactly one thesis request is allowed, with no retries, continuation, or second model. `docs/evidence/gemini.json` records HTTP status, provider/model, timestamps, context source/ID, latency, schema result, semantic result, and thesis status after the existing redaction guard. An existing evidence file blocks accidental reruns. No model narrative is printed to logs.

The strict thesis schema contains no strategy proposal. Proposal generation needs a separate authorized request, so this first proof records proposal NOT REQUESTED and experiment NOT RUN; no fabricated metrics. Ordinary fixture tests exercise both adapter operations through the existing pipeline and deterministic paper experiment. Nothing automatically promotes to LIVE or creates a TradeIntent. Update the evidence index only after a successful real call; existing Qwen 401 and no-response evidence remain unchanged.

## Implementation status

Gemini implemented and privately selected; both separately user-authorized live attempts on October 7, 2026 timed out. Configuration presence and mocked successes do not establish real model connectivity.

The first request started at `2026-10-07T09:43:38.646Z` and ended at `2026-10-07T09:43:53.664Z`, latency 15,018 ms, category TIMEOUT. No HTTP response was received, so authentication and model availability remain unverified. Exactly one request used the exact recorded TSLAon context reloaded from Redis; no Binance market data was fetched again. See [unchanged first attempt](evidence/gemini-attempt-1.json).

The user separately authorized one retry with a 60-second request timeout. It started at `2026-10-07T09:48:04.404Z` and ended at `2026-10-07T09:49:04.416Z`, latency 60,012 ms, category TIMEOUT, again without an HTTP response. See [latest attempt](evidence/gemini.json). The override applied only to that test process; private settings and the default 15-second policy were not changed. The exact same recorded context was read from Redis again. Increasing the limit did not resolve the failure. DNS and TLS connection checks succeeded separately, but do not prove HTTP API or generation connectivity.

No model output was available for schema or semantic validation in either attempt. Each record therefore reports schemaValid false and semanticValidation FAIL due to TIMEOUT, rather than a rejected model thesis. No thesis, proposal, experiment, wallet operation, trade, or promotion occurred. Each authorized run made one request without internal retries or another provider. Existing Qwen evidence is unchanged; the evidence index has no successful Gemini proof to add. A further live request requires separate user authorization.
