# Paper experiments

A paper experiment is a separate book. It does not call `applyPaperFill` and it does not change the user's paper account. Each experiment records `dataSource` (`LIVE_BINANCE_HISTORY` or `MOCK_FIXTURE`) and `thesisSource` (`LLM` or `MOCK`). Those labels are not combined into one claim. This is simulated execution and does not broadcast blockchain transactions. The research brain cannot directly execute trades.

`StrategyExperimentEngine` walks bars in time order. At index `i` the condition check receives only `bars[0..i]`. Features, regime, session, and reference deviation come from that prefix. A later bar cannot change an earlier decision.

The dataset must contain at least 30 bars. A shorter series is `INVALID` with reason `INSUFFICIENT_HISTORY`. No candle is invented to fill a gap. A missing feature stays insufficient and the condition does not match.

Windows are slices of the same series:

- research: the first half
- validation: the next quarter
- out of sample: the last quarter

`outOfSampleClaim` is true only when the out-of-sample slice has at least 8 bars. Otherwise the result says out-of-sample validity is not claimed.

Metrics are number of trades, win rate, gross PnL, net PnL, average trade return, max drawdown, profit factor, average holding period, largest win, and largest loss. Net PnL subtracts the paper fee assumption (10 bps each side) on one unit. The baseline is `BUY_AND_HOLD` over the full series. A higher strategy PnL is a difference, not a promotion.

Warnings for many conditions, a tiny sample, an extreme threshold, a one-bar hold, a single asset, and a large research-versus-validation gap are recorded. They do not reject the experiment by themselves.

## REAL MODEL EXECUTION

An experiment started from a validated model proposal uses the candles the server loaded. Live Binance history stays labeled `LIVE BINANCE HISTORY`. The paper series and the explicit mock fixture stay labeled `MOCK FIXTURE`. The thesis source is a separate label, `LLM` or `MOCK`. A short live series is `INVALID` / `INSUFFICIENT_HISTORY`. KAIROS does not pad it with synthetic bars and does not switch the label to the mock fixture. The experiment does not broadcast a transaction and does not promote the proposal.

`promoteResearchCandidate()` is unimplemented. Future acceptance is a separate policy: enough trades, a usable validation window, a drawdown limit, positive net expectancy, and no critical warnings.
