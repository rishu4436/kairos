# Transaction simulation

Simulation runs only after a valid, unexpired quote and a successful unsigned build.

Build: `GET /api/v1/dex/aggregator/swap` with the same chain, tokens, amount, wallet, `quoteId`, and `slippagePercent`. The body that comes back under `data.tx` is unsigned. `from`, `to`, `data`, and `value` are required before simulation. Gas fields stay null when the payload omits them.

Simulate: `POST /api/v1/dex/pre-transaction/simulate` with `binanceChainId` and `evmTx`. `status` `SUCCESS` is PASS. `FAILED` is FAIL. Anything else is UNKNOWN. A FAIL blocks wallet authorization. The simulate payload has no simulation id, so that field stays null.

Broadcast is not requested. Signing returns `EXECUTION_NOT_AVAILABLE` with `broadcast: false` and `signature: null`.

The live mission track is INTENT, RISK, QUOTE, BUILD, SIMULATION, READY FOR WALLET. The paper track stays INTENT, RISK, SIMULATION, PAPER FILL, POSITION. Paper code does not call the quote or simulate endpoints.

No credentialed simulation was run from this workspace, so no gas figure or revert string from Binance is recorded here.
