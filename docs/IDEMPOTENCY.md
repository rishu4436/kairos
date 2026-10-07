# Idempotency

Invocation may happen more than once. The effect of a paper intent happens once.

`applyPaperFillOnce` and `rememberPaperFill` key completion by `intentId`. The paper cycle checks that record before it writes the ledger again. A second pass returns the first execution id and does not change cash.

`correlationId` is unchanged. `cycleId` is shared by every asset in one invocation. The chain is still cycle, correlation, decision, intent, execution.

A future live order must verify `intentId`, `quoteId`, `orderId`, and `transactionHash` before any submit. Submission requires its separate live execution gate. A retry must not create a second order. The same claim record is the boundary those ids will use.

`RISK_REDUCTION_ONLY` and live modes never create an opening fill. A live or live-preview failure does not fall through into paper.
