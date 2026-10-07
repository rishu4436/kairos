# Strategy DSL

A strategy proposal is data, not a program. The model may not emit JavaScript, TypeScript, or Python. A condition is `feature`, `operator`, and `threshold`.

Features:

`return_15m`, `return_1h`, `return_4h`, `volatility_20`, `price_vs_sma20`, `market_session`, `regime`, `reference_deviation_bps`, `momentum_1h`.

Operators:

`GT`, `GTE`, `LT`, `LTE`, `EQ`, `NEQ`, `IN`, `CROSS_ABOVE`, `CROSS_BELOW`.

Numeric thresholds are basis points. `market_session` uses `OPEN`, `CLOSED`, `PRE_OPEN`, `POST_CLOSE`, `UNKNOWN`, or `ANY`. `regime` uses the regime enum or `ANY`. `price_vs_sma20` uses `ABOVE`, `BELOW`, or `EQUAL` for equality, and basis points for numeric comparisons.

Actions are `BUY`, `SELL`, or `OBSERVE`.

`StrategyProposalValidator` rejects an unknown feature, an unknown operator, a non-finite threshold, an unknown session or regime, more than 8 conditions, a holding period outside 1 to 96 bars, an unsupported asset, missing invalidation, and any executable-code pattern.

Structured output from the model is checked again by `StrategyProposalValidator`. A schema match is not semantic acceptance. A proposal status moves `LLM_GENERATED` to `VALIDATING`, `READY_FOR_EXPERIMENT`, `PAPER_TESTING`, and `RESULT` or `REJECTED`. It is never inserted into the executable strategy registry. The research brain cannot directly execute trades.

## REAL MODEL EXECUTION

The Responses API schema names the same features, operators, sessions, regimes, and actions. `additionalProperties` is false. After extraction, `StrategyProposalValidator` still rejects unknown names, code-like text (JavaScript, TypeScript, Python, SQL, and shell), and any proposal that would need an executable expression. A model failure does not become a mock proposal. Acceptance does not promote the proposal into the strategy registry and does not create a trade intent.
