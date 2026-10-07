# Agentic Wallet evidence

This file records only what was run on this machine. It is not a claim that a trade occurred.

Verified on 2026-10-04:

- Node.js `v24.18.0`.
- Installed skill `binance-agentic-wallet` `1.11.0`. Its metadata requires CLI `1.9.0`.
- `baw --version` printed `1.9.0`.
- `baw cli-check --required-version 1.9.0 --json` returned `currentCliVersion` `1.9.0` and `needUpdateCli` false. No CLI upgrade was required, and none was installed.
- `baw skill-check --skill-name binance-agentic-wallet --current-version 1.11.0 --json` returned `needUpdateSkill` true and `latestSkillVersion` `1.12.0`. The skill text requires a person to confirm that update. It was not installed.
- `baw wallet status --json` returned status `UNCONNECTED`.
- `baw auth signin --json` then returned success and the documented fields `urlForWeb`, `qrCodeId`, `expireAt`, and `pairingCode`. The URL was shown to the operator and was not written into the repository. `baw auth verify` was not started, so the foreground wait was not abandoned.
- `BINANCE_WEB3_API_KEY` was absent, so the RWA resolver was not called and no TSLA contract was taken from memory.
- `KAIROS_AGENTIC_WALLET_EXECUTE` was unset.

Not verified, and not claimed:

- No Binance App confirmation was observed.
- No wallet address, chain list, balance, or security policy was read from a signed-in session.
- No quote, unsigned build, or simulation was requested.
- No tokenized-stock swap was submitted.
- No order id or transaction hash exists.
- No position was reconciled.

The code path that would block a trade above `quotaLeft`, reject a paper capability, and refuse to mark an order confirmed before `FINISHED` is covered by unit tests with a fake CLI. Those tests do not talk to Binance.
