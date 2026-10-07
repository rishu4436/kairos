# Agentic Wallet

KAIROS decides. Binance Agentic Wallet authorizes. KAIROS does not store a private key, seed phrase, or signing session.

## Documented commands KAIROS may run

The argument list is fixed. KAIROS does not build a shell string.

- `baw wallet status --json`
- `baw wallet address --json`
- `baw wallet chains --json`
- `baw wallet balance --binanceChainId 56 --json`
- `baw wallet settings --json`
- `baw market-order swap` with validated token addresses, a human-readable quantity, chain `56`, and an explicit slippage
- `baw market-order list --orderId <id> --json`

Sign-in, when a person starts it, is `baw auth signin --json`, then the returned `urlForWeb` unchanged, then `baw auth verify --qrCodeId <qrCodeId> --json`. Connection is true only after `wallet status` says `CONNECTED`. The App screen is not enough.

`wallet settings` is read-only. High-risk handling is `AutoReject` or `NeedConfirmation`. `quotaLeft` is the remaining daily amount. `tradeAllTokens` false does not include the allow list in the CLI response. KAIROS does not guess that list. Live admission requires `tradeAllTokens` false plus an operator-attested `KAIROS_AGENTIC_ALLOWED_TOKENS` set of `chain:contract` pairs. Provenance is `OPERATOR_ATTESTED`. A missing or malformed list is `TOKEN_SCOPE_UNVERIFIED`. A contract outside the list is `TOKEN_NOT_ALLOWED`. Tickers are never authorization.

A swap response with an `orderId` is `SUBMITTED`. It is `CONFIRMED` only after `market-order list` reports `FINISHED`. `FAILED` stays rejected. `PENDING` is not confirmation.

## Two gates

KAIROS risk runs first. The wallet quota and token scope run second. A $100 KAIROS limit does not override a $50 wallet remainder. The preview says `BLOCKED BY WALLET LIMIT` and does not call `market-order swap`.

Execution also requires a live capability, a BUY or SELL, a valid unexpired quote, slippage inside policy, a built transaction, a passing simulation, a tradable token, a connected wallet, and matching user, agent, and address. Paper capability is rejected. The call is still refused unless `KAIROS_AGENTIC_WALLET_EXECUTE=1`. Ordinary tests never set that flag.

The stock contract comes from the existing KAIROS RWA record. The wallet skill is not a second token catalog. A halted token is `TOKEN_NOT_TRADABLE` and no swap is sent.

## Multi-user boundary

The supported local CLI session has no profile or user argument. KAIROS scopes this boundary to `LOCAL_RUNTIME_USER_ID` (literal `user_demo` for persisted state); another user receives UNCONNECTED without a CLI call. AgenticWalletGateway retains a userId parameter, but production multi-user session orchestration is unfinished. KAIROS does not invent a second credential store or a global wallet.

Paper portfolio values are simulated state and do not establish a live wallet balance.
