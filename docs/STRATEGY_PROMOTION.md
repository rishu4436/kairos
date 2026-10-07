# Strategy promotion

`reviewPromotion` returns `PROMOTION_PASS`, `PROMOTION_FAIL`, or `INSUFFICIENT_EVIDENCE`. It writes an audit with the candidate id, strategy version, policy version `1.0`, time, reasons, metrics, and warnings. It does not change the candidate state, register a strategy, or create a trade.

Pass requires all of the following:

- at least 30 experiment trades
- at least 8 out-of-sample trades
- a positive expectancy
- drawdown at or under the configured limit
- a positive difference versus the baseline
- no high overfitting warning

A missing sample or expectancy is `INSUFFICIENT_EVIDENCE`. Anything else that fails a check is `PROMOTION_FAIL`.

`promoteResearchCandidate()` still returns `promoted: false`. Live activation is a separate explicit action and is not enabled.

The LLM cannot call this policy, change a threshold, or mark a candidate healthy. Deterministic code records the audit.
