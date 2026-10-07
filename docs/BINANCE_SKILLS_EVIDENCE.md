# Binance Skills evidence

Recorded 2026-10-07 from the current [Binance Skills Hub](https://github.com/binance/binance-skills-hub) `main` tree and from one public read. The in-process adapter registry is older and is not this evidence.

## Hub metadata

| Skill | Hub version | Required `baw` | Public read without a wallet |
| --- | --- | --- | --- |
| binance-agentic-wallet | 1.12.0 | 1.10.0 | No |
| binance-trading-signal | 3.5 | 1.9.1 | No. Smart Money is a skill script. |
| query-token-audit | 1.4 | none | Yes. POST, no API key. |
| binance-tokenized-securities-info | 1.1 | none | Yes. GET, no API key. |
| binance-wallet-tracker | 1.3 | 1.9.1 | No |

`baw --version` printed `1.9.0`. The wallet skill now requires `1.10.0`. That upgrade is `PHASE_17_UPDATE_REQUIRED`. It was not performed.

## Levels

### IMPLEMENTED ADAPTER

KAIROS still has the Phase 9 registry and normalization boundary. Those interfaces do not create a `TradeIntent`, sign, or broadcast. An interface is not use.

### SKILL INSTALLED

No. `bag skills install` on the installed CLI copies skills into Claude Code and Cursor. That changes user tooling, so it was not run. `npx skills add` was not run for the same reason: it writes agent skill directories outside this phase's approval. No project-local skill package was added.

### SKILL ACTUALLY INVOKED

One public read, using the request documented by `binance-tokenized-securities-info` 1.1. The skill runtime was not launched. The HTTP call was.

- Skill: `binance-tokenized-securities-info`
- Version: `1.1`
- When: `2026-10-07T01:17:28.533Z`
- Request: `GET https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=1`
- Header: `User-Agent: binance-web3/1.1 (Skill)`
- Input ticker already used by KAIROS: `TSLA`
- Latency: 769 ms
- HTTP status: 200
- Body: `success: true`, `code: "000000"`, 1366 rows

### LIVE RESPONSE OBSERVED

Yes, for that one GET.

Normalized KAIROS result:

| Ticker | Symbol | Chain | Contract |
| --- | --- | --- | --- |
| TSLA | TSLAon | 56 (BSC) | `0x2494b603319d4d9f9715c9f4496d9e0364b59d93` |
| TSLA | TSLAon | 1 (Ethereum) | `0xf6b1117ec07684d3958cad8beb1b302bfd21103f` |
| TSLA | TSLAon | CT_501 (Solana) | `KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo` |

`tradeIntent` is null. Nothing was signed. Nothing was broadcast. No wallet was connected. `query-token-audit` was not called.

The command-center badge stays `NOT INSTALLED`. One observed public read is not an installed, continuous skill.
