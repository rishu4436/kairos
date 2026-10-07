# Agentic Wallet

KAIROS decides. Binance Agentic Wallet authorizes. KAIROS does not store a private key, seed phrase, or signing session.

The local skill file is `binance-agentic-wallet` version `1.11.0`. Its required CLI version is `1.9.0`. On this machine `baw cli-check --required-version 1.9.0 --json` returned `currentCliVersion` `1.9.0` and `needUpdateCli` false. `baw skill-check` returned `needUpdateSkill` true and `latestSkillVersion` `1.12.0`. The skill says to ask before installing that update, so it was not installed. The CLI was not upgraded.

`baw wallet status --json` returned `UNCONNECTED` before sign-in. `baw auth signin --json` then succeeded. The returned `urlForWeb` was shown to the operator and was not stored. `auth verify` was not started. No address or balance was read.

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

`wallet settings` is read-only. High-risk handling is `AutoReject` or `NeedConfirmation`. `quotaLeft` is the remaining daily amount. `tradeAllTokens` false does not include the allow list in the response, so KAIROS blocks with `TOKEN_SCOPE_UNVERIFIED` instead of guessing.

A swap response with an `orderId` is `SUBMITTED`. It is `CONFIRMED` only after `market-order list` reports `FINISHED`. `FAILED` stays rejected. `PENDING` is not confirmation.

## Two gates

KAIROS risk runs first. The wallet quota and token scope run second. A $100 KAIROS limit does not override a $50 wallet remainder. The preview says `BLOCKED BY WALLET LIMIT` and does not call `market-order swap`.

Execution also requires a live capability, a BUY or SELL, a valid unexpired quote, slippage inside policy, a built transaction, a passing simulation, a tradable token, a connected wallet, and matching user, agent, and address. Paper capability is rejected. The call is still refused unless `KAIROS_AGENTIC_WALLET_EXECUTE=1`. Ordinary tests never set that flag.

The stock contract comes from the existing KAIROS RWA record. The wallet skill is not a second token catalog. A halted token is `TOKEN_NOT_TRADABLE` and no swap is sent.

The sample portfolio of 47,217.90 USDT is not the live wallet.
