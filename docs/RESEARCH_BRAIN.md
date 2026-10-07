# Research brain

The research brain cannot directly execute trades.

It inspects structured market evidence, writes a falsifiable thesis, and proposes a declarative strategy. Deterministic KAIROS code validates the proposal and runs a paper experiment. The model does not create a trade intent, call the arbitrator, change a risk policy, or touch a wallet.

```text
Market context
  → LLM thesis
    → Strategy proposal
      → Validation
        → Paper experiment
          → Evaluation
            → Research candidate
```

A research candidate is not an implemented strategy. `promoteResearchCandidate()` records the future contract and does not register anything.

## Provider

`ReasoningProvider` has `generateThesis` and `generateStrategyProposal`. `selectReasoningProvider` chooses one adapter from `KAIROS_LLM_PROVIDER`: `qwen`, `xai`, or `mock`. An unknown name is `MODEL_PROVIDER_UNSUPPORTED` and does not fall through to another adapter. `MockReasoningProvider` runs only for explicit mock mode or `KAIROS_LLM_PROVIDER=mock`. `HttpReasoningProvider` posts to `https://api.x.ai/v1/responses` only when the provider is `xai`. `QwenReasoningProvider` posts to the configured Qwen Chat Completions URL only when the provider is `qwen`. See [QWEN_INTEGRATION.md](QWEN_INTEGRATION.md). The model id comes from `KAIROS_LLM_MODEL` (`qwen3.8-max` for Qwen, `grok-4.7` for xAI). The timeout comes from `KAIROS_LLM_TIMEOUT_MS`. Neither request sends tools. The key stays on the server. A client bundle must not contain it.

## REAL MODEL EXECUTION

xAI posts to `https://api.x.ai/v1/responses`. Structured output uses `text.format` with `type: json_schema`, `strict: true`, and the `research_thesis` or `strategy_proposal` schema. `store` is false. No tools are sent. The response text is the `output_text` part of an `output` message.

Qwen posts to `{KAIROS_QWEN_BASE_URL}/chat/completions`. That base is the documented workspace host plus `/compatible-mode/v1`. Structured output uses `response_format.type` `json_schema` with the same two KAIROS schemas. The text is `choices[0].message.content`. A Qwen failure stays on Qwen. It does not call xAI or the mock provider.

Configuration stays server-side: `KAIROS_LLM_PROVIDER`, `KAIROS_LLM_API_KEY`, `KAIROS_LLM_MODEL` (`qwen3.8-max` or `grok-4.7`), `KAIROS_LLM_TIMEOUT_MS`, and `KAIROS_QWEN_BASE_URL` for Qwen. The key and the base URL are not returned to the browser. `CONNECTED` means a request to that provider succeeded. It does not mean the thesis on screen came from that request.

`generateResearchThesis` accepts a user and an asset. The server resolves that user's watchlist and builds `ResearchContext` from the observation row. When that row has a `KAIROSContext`, the brain projects it: price, features, regime, session, strategy signals, strategy health, external intelligence, events, position, and previous research, and only the slices that are actually available. It does not build a second interpretation of the market. Candles still come from the history the strategy engine already stored. News stays `UNAVAILABLE` with `items: null`. Earnings stay `UNAVAILABLE`, including `expectedEarningsDate: null`. An earnings restriction does not fill either slice. Paper performance from another book is not copied. The browser cannot submit features, candles, or a context object.

Validation order is model output, structure parse, semantic thesis and proposal checks, DSL checks, then `READY_FOR_EXPERIMENT`. An observed fact must cite a feature id, `observation`, `regime`, or `market_session` that was supplied. A prediction, and a claim about news, earnings, or filings, is rejected when those sources were not in the context. JavaScript, TypeScript, Python, SQL, and shell text are rejected. KAIROS assigns user, agent, and asset identity after the response. Model identity fields are ignored.

A missing key returns `NOT_CONFIGURED` and stores nothing. A provider error, parse failure, or timeout is stored as `MODEL_ERROR` with `errorCategory` `HTTP`, `PARSE`, `PROVIDER`, or `TIMEOUT`. The mock provider is not substituted. The mock lab runs only when the caller selects mock mode, or when a test constructs it. Live mode with no usable board returns `LIVE_MARKET_DATA_NOT_CONFIGURED` and does not insert the paper series. Fewer than 30 real candles produce experiment `INVALID` / `INSUFFICIENT_HISTORY`.

Each thesis stores `sourceType` (`MOCK` or `LLM`), provider, model, prompt version `1.1`, context timestamp, context data version, request id, start, completion, latency, and status. The linked experiment stores `experimentId`, `dataSource` (`LIVE_BINANCE_HISTORY` or `MOCK_FIXTURE`), and `thesisSource` (`LLM` or `MOCK`). Validation is the thesis status plus `rejectionReasons`. The API key and the raw provider body are not stored. Nothing in this path promotes a strategy, creates a `TradeIntent`, or reaches a wallet. The research brain cannot directly execute trades.

The model receives a read-only `ResearchContext` projected from the same `KAIROSContext` the arbitrator saw. Prompt version is `1.1`. The prompt separates `OBSERVED_FACT`, `OBSERVED_EVENT`, `OBSERVED_NEWS`, `OBSERVED_EARNINGS`, `OBSERVED_EXTERNAL_SIGNAL`, `MODEL_INFERENCE`, and `HYPOTHESIS`. An `OBSERVED_EVENT` cites an event id in the context and is not a model inference. `OBSERVED_NEWS` cites a news id. `OBSERVED_EARNINGS` cites the earnings event id and cannot introduce an EPS, revenue, or date that the provider did not supply. A trading restriction is not an earnings result, an EPS, or a date. `UNAVAILABLE` news is not "no news". An observed external signal must cite an id that is in the context. The validator rejects "whales are buying" unless a fresh Smart Money buy is in that context. Token security is eligibility context and is not a reason to raise confidence. There is no tool calling. The research lab lists which of market, health, Smart Money, earnings, and news were actually present. The autonomous cycle does not call the model on every poll. A research failure is non-blocking. See [RECOVERY.md](RECOVERY.md).

The same context may include `strategyHealth`, `strategyPerformance`, and `candidatePerformance` for that user. An `OBSERVED_HISTORICAL_RESULT` must cite one of those strategy ids. A statement that past performance guarantees a future return is rejected. The model cannot promote a candidate or change its lifecycle.

Paper experiments copy those signal ids into `externalContext`. Experiment results are also recorded in the strategy memory as dataset `EXPERIMENT`, separate from paper fills. `usedAsCandles` is false. The experiment does not invent historical Smart Money events.

## Safety invariants

- The LLM cannot execute.
- The LLM cannot create a `TradeIntent`.
- The LLM cannot access a wallet.
- The LLM cannot modify user risk.
- The LLM cannot register a strategy.
- The LLM cannot submit executable code. The DSL rejects it.
- An invalid proposal cannot enter an experiment.
- An experiment does not move the user's paper or live book.
- A decision at bar `i` cannot see bar `i + 1`.
- A generated proposal cannot become `implemented` on its own.
- Model inference is stored as `MODEL_INFERENCE`, not as an observed fact.
- Missing history yields `INSUFFICIENT_HISTORY`. Missing values stay null.
