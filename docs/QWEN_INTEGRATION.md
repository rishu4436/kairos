# Qwen integration

## User-authorized retry — 2026-10-07

At `2026-10-07T09:06:17.388Z` (14:36:17 IST), one additional request used the
current private configuration, the same Redis context, model `qwen3.8-max`, and
prompt 1.1. It returned no HTTP response within the 60-second client limit
(60,022 ms). No output, thesis, proposal, experiment, or promotion was produced.
Authentication success cannot be inferred from a request that did not respond.

The first HTTP 401 record is preserved as
[attempt 1](evidence/phase-17i-qwen-attempt-1.json); the
[latest record](evidence/phase-17i-qwen.json) retains the provider's actual
UPSTREAM_ERROR result. That category arose when the existing internal retry was
blocked by the one-request wrapper. The adapter now supports an explicit
single-attempt mode, used by this evidence harness, so future timeouts keep
their TIMEOUT category without initiating another fetch. Normal callers retain
the original two-attempt policy. A local regression test verifies this change;
no third real request was made. The UI shows NO RESPONSE, not HTTP null.

## Phase 17I actual provider attempt

Configured locally with private credentials; this alone does not mean connected.
At `2026-10-07T07:54:13.483Z`, the existing QwenReasoningProvider sent exactly one
strict JSON Schema thesis request on the bounded research projection reloaded
from the real Binance TSLA context in Redis. Requested model: `qwen3.8-max`;
prompt version: 1.1; latency: 840 ms; HTTP 401 / AUTHENTICATION_ERROR.
No response model, thesis, or proposal was returned. Real Qwen intelligence is
NOT VERIFIED. FMP news/earnings remained UNAVAILABLE in the supplied context.

The single-request guard prevents an accidental retry or second proposal call.
KAIROS's existing pipeline ordinarily calls generateThesis and then
generateStrategyProposal separately. The thesis schema has no proposal field.
This phase therefore did not run a proposal/experiment or promote a strategy.
Another network request requires explicit user authorization. The endpoint/model
was not silently changed. No tools, search, wallet, or execution was provided.

Record: [actual Qwen result](evidence/phase-17i-qwen.json).
Gate: `QWEN_LIVE_TEST=1` with the dedicated context-evidence integration test.
The pre-existing KAIROS_LLM_LIVE_TEST gates are separate and were not run.

Qwen is one `ReasoningProvider`. It does not replace xAI, and the research pipeline does not read Qwen response objects. The research brain cannot directly execute trades.

## Official references

These pages were read before the adapter was written:

- [qwen3.8-max model card](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max)
- [OpenAI-compatible Responses API](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-api-via-openai-responses)
- [Structured output](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-structured-output)

Model ID: `qwen3.8-max`. Structured output is supported for the Qwen3.8-Max series. The model card also lists a snapshot, `qwen3.8-max-0902`. KAIROS does not hard-code that snapshot.

## Endpoint

The structured-output document shows JSON Schema mode on the OpenAI-compatible Chat Completions API. The Responses API lists `qwen3.8-max`, and its request body does not document a JSON Schema field. KAIROS therefore calls Chat Completions for Qwen and leaves xAI on `POST https://api.x.ai/v1/responses`.

The documented HTTP request is:

```text
POST https://{WorkspaceId}.{region-host}.maas.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <Model Studio API key>
Content-Type: application/json
```

Region hosts named in the current docs:

| Region | Host |
| --- | --- |
| Singapore | `{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com` |
| China (Beijing) | `{WorkspaceId}.cn-beijing.maas.aliyuncs.com` |
| US (Virginia) | `{WorkspaceId}.us-east-1.maas.aliyuncs.com` |
| Germany (Frankfurt) | `{WorkspaceId}.eu-central-1.maas.aliyuncs.com` |
| Hong Kong | `{WorkspaceId}.cn-hongkong.maas.aliyuncs.com` |
| Japan (Tokyo) | `{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com` |

`{WorkspaceId}` comes from the workspace details page in the Model Studio console. KAIROS does not guess it. Set the compatible-mode base, without a trailing slash:

```text
KAIROS_QWEN_BASE_URL=https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

The adapter appends `/chat/completions` unless the value already ends with that path. Only `https` is accepted. The base URL is not returned to the browser.

## Authentication

Header: `Authorization: Bearer` plus `KAIROS_LLM_API_KEY`. The same generic secret is used for xAI. The key stays on the server. No DashScope SDK is installed.

## Structured output

Request field, as documented:

```json
{
  "model": "qwen3.8-max",
  "messages": [{ "role": "system", "content": "..." }, { "role": "user", "content": "..." }],
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "research_thesis", "strict": true, "schema": {} }
  }
}
```

`research_thesis` and `strategy_proposal` are the existing KAIROS schemas. No tools, web search, or code interpreter are sent. The payload is `choices[0].message.content`. KAIROS parses that string as JSON and then runs the existing thesis, evidence, and DSL validators. A fence, a non-object, or invalid JSON is `STRUCTURED_OUTPUT_ERROR`. The adapter does not rewrite it.

Prompt versions are `QWEN_THESIS_PROMPT_VERSION` `1.1` and `QWEN_STRATEGY_PROMPT_VERSION` `1.1`. Version 1.1 tells the model to treat an event as `OBSERVED_EVENT`, to keep a trading restriction separate from an earnings result, and to leave unavailable news as unavailable.

## Environment

| Variable | Role |
| --- | --- |
| `KAIROS_LLM_PROVIDER` | `qwen`, `xai`, or `mock`. Anything else is `MODEL_PROVIDER_UNSUPPORTED`. A key with no provider still selects `xai`. |
| `KAIROS_LLM_MODEL` | Optional. Qwen defaults to `qwen3.8-max`. xAI defaults to `grok-4.7`. |
| `KAIROS_LLM_API_KEY` | Server-side bearer token. |
| `KAIROS_LLM_TIMEOUT_MS` | Bound from 1000 to 120000. Default 15000. |
| `KAIROS_QWEN_BASE_URL` | Required only for `qwen`. |

Qwen is configured only when the provider is `qwen`, the key is set, and the base URL is a valid `https` URL. A missing piece is `NOT CONFIGURED`. The mock lab is not substituted. `KAIROS_LLM_PROVIDER=mock` is the explicit fixture mode.

## Failure handling

HTTP status maps to a normalized category. The browser receives a short sentence, not the provider body.

| Status | Category | Retried |
| --- | --- | --- |
| 401, 403 | `AUTHENTICATION_ERROR` | No |
| 429 | `RATE_LIMITED` | No |
| 400 | `INVALID_REQUEST` | No |
| 404 | `MODEL_UNAVAILABLE` | No |
| 5xx | `UPSTREAM_ERROR` | Once |
| Timeout or dropped connection | `TIMEOUT` or `UPSTREAM_ERROR` | Once |
| 200 with no text content | `MALFORMED_RESPONSE` | No |
| 200 with content that is not a JSON object | `STRUCTURED_OUTPUT_ERROR` | No |

The retry bound is two attempts. A Qwen failure does not call xAI or the mock provider.

Each attempt records request id, provider, model, start, completion, latency, status, and error category. The raw response and the API key are not stored.

## Tests

The default suite mocks HTTP. It does not need a Qwen key.

The optional live test is `research/qwen-live.integration.test.ts`. It runs only when all of these are set:

```text
KAIROS_LLM_LIVE_TEST=1
KAIROS_LLM_PROVIDER=qwen
KAIROS_LLM_API_KEY
KAIROS_QWEN_BASE_URL
```

It makes one thesis request. It does not write a fixture. No live Qwen call was made while this document was written, so no latency or rate-limit measurement is recorded here. The model card describes dynamic rate limits in Beijing and Singapore and published RPM/TPM in other regions. Those figures were not observed from this workspace.

## Limits

The adapter does not enable thinking controls, because the structured-output example for `qwen3.8-max` does not send them. If a live call rejects a schema keyword such as `anyOf`, that is a provider limitation and the local validators remain authoritative. Qwen cannot create a trade intent, change risk, reach a wallet, sign, broadcast, or promote a strategy.
