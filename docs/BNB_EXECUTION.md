# BNB execution preparation

KAIROS can ask Binance for a quote, an unsigned swap transaction, and an off-chain simulation. It cannot sign or broadcast. A live failure does not become a paper fill. This is simulated execution and does not broadcast blockchain transactions.

The pages used for the field names are the Binance Web3 docs dated 2026-10-01:

- Trading API catalog and introduction
- Transaction API catalog and introduction
- Wallet API catalog and introduction
- Authentication, which this repository already implements as `timestamp + METHOD + requestPath + body`

Base URL: `https://web3.binance.com/build`. The signed path includes `/build`.

## Quote

`GET /api/v1/dex/aggregator/quote`

Query fields KAIROS sends, all named by the catalog:

- `binanceChainId` (`56` for BSC)
- `fromTokenAddress`
- `toTokenAddress`
- `amount` (positive integer string in the token's smallest unit)
- `userWalletAddress` (required for RFQ equity routes)

KAIROS does not send fee or referrer fields.

The response `data` is a list of routes. KAIROS keeps the first route and reads `quoteId`, `vendorName`, `fromTokenAmount`, `toTokenAmount`, `tradeFee`, `priceImpactPercent`, and `executionMode`. A missing value stays null. The schema does not return an execution price, so that field is null. The documented quote TTL is 30 seconds. The payload does not include `expiresAt`, so KAIROS derives it from the receive time plus that documented TTL. An expired quote is not simulated.

`SWAP` means a later phase would sign `tx` and broadcast. `RFQ` means a later phase would sign `rfq.typedDataToSign` and submit an order. This phase does neither.

## Unsigned build

`GET /api/v1/dex/aggregator/swap`

Query fields: `binanceChainId`, `quoteId`, `fromTokenAddress`, `toTokenAddress`, `amount`, `userWalletAddress`, and `slippagePercent`. The user's maximum slippage is converted from basis points to the percentage string the API requires. `autoSlippage` is not sent.

The unsigned payload is `data.tx`: `from`, `to`, `data`, `value`, and when present `gas`, `gasPrice`, `maxPriorityFeePerGas`, `minReceiveAmount`, and `slippagePercent`.

## Simulation

`POST /api/v1/dex/pre-transaction/simulate`

Body: `binanceChainId` and `evmTx` with `from`, `to`, `value`, and `data`. The response `data.status` is `SUCCESS` or `FAILED`. `SUCCESS` is PASS. `FAILED` is FAIL. Any other status is UNKNOWN. `failReason` is stored only for FAIL. The response has no simulation id and no gas field in the documented simulate object, so those stay null.

`POST /api/v1/dex/pre-transaction/broadcast-transaction` is not called. A sign or broadcast request returns `EXECUTION_NOT_AVAILABLE` with `broadcast: false` and `signature: null`.

## Wallet read

`GET /api/v1/dex/balance/all-token-balances-by-address`

Query: `address` and `excludeRiskToken=true`. Each row maps `binanceChainId`, `tokenContractAddress`, `symbol`, `balance`, and `isRiskToken`. No USD total is returned by this mapping, so exposure is null. The call does not transfer tokens.

## KAIROS gate

The preparation function accepts a live capability and a risk pass. It does not quote when risk failed. Quoted `priceImpactPercent` above the user's maximum is `SLIPPAGE_LIMIT_EXCEEDED`. A missing impact is `PRICE_IMPACT_UNAVAILABLE` and is not treated as zero. The final successful state is `TRANSACTION_SIMULATED`. `SIGNED`, `BROADCAST`, and `CONFIRMED` are not states in this phase.

The public wallet address is `KAIROS_WALLET_ADDRESS`. It is not a private key. Token decimals must already be on the listing. KAIROS does not guess them. The BSC USDT contract used as the quote counter-asset is the address in the Trading API examples: `0x55d398326f99059fF775485246999027B3197955`.

The wallet address is resolved for the demo user only. See [QUOTE_ENGINE.md](QUOTE_ENGINE.md) and [TRANSACTION_SIMULATION.md](TRANSACTION_SIMULATION.md).

```text
Risk → Quote → Build → Simulate → Wallet (future) → Sign (future) → Broadcast (future) → Verify (future)
```

No credentialed quote, swap, simulation, or balance call was made from this workspace while this document was written.
