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

## Optional live test

The gate requires GEMINI_LIVE_TEST=1, selected Gemini, and KAIROS_LLM_API_KEY. With private configuration loaded, run only research/gemini-live.integration.test.ts. It sends one bounded thesis request against an explicit synthetic test context, validates schema and semantics, and writes no snapshots. It does not fetch Binance, connect Redis, request a proposal, run an experiment, or execute a trade. Default CI skips it. A fixture-backed live model call does not establish current market connectivity.
