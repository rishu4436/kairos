# Quote engine

A quote runs only after risk has passed and the wallet belongs to that user. The research brain and the strategy evaluator do not call it. A failed quote does not start a paper fill.

`GET /api/v1/dex/aggregator/quote` on `https://web3.binance.com/build`.

KAIROS sends `binanceChainId`, `fromTokenAddress`, `toTokenAddress`, `amount`, and `userWalletAddress`. BSC is chain `56`. A buy sells the documented BSC USDT contract. A sell sells the stock token. `amount` is a smallest-unit integer. Decimals come from the token listing. A missing decimal stops the request.

The first route is kept. `quoteId`, vendor, input amount, output amount, `tradeFee`, `priceImpactPercent`, and `executionMode` are copied when present. Missing values stay null. The response has no execution price and no expiry field. The documented TTL is 30 seconds from the time KAIROS received the route. After that the quote is `QUOTE_EXPIRED` and is not built or simulated.

`priceImpactPercent` above the user's maximum slippage is `SLIPPAGE_LIMIT_EXCEEDED`. A null impact is not treated as zero.

The public address is `KAIROS_WALLET_ADDRESS`. It is accepted only for the demo user, only as a `0x` plus 40 hex characters, and only on BSC. Another user does not receive that address. A client-supplied address is not the source of ownership.
