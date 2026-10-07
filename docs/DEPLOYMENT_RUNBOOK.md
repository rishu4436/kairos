# Deployment runbook

## Phase 17H Redis configuration

Set `KAIROS_STATE_BACKEND=redis` and `REDIS_URL` privately in Git-ignored
`D:\kairos\.env.local`. For Upstash use Connect → TCP, the read/write `rediss://`
connection URL; the HTTPS REST endpoint is unsupported by the RESP adapter.
The URL includes authentication, so no separate Redis token variable is used.
Do not copy credentials into `.env.example`, TOML, documentation, or chat.

Run the gated real suite described in STATE_PERSISTENCE.md, then
`npm run kairos:preflight` with the existing local modern KAIROS_BAG_BIN override.
The preflight reads `.env.local` without printing values and reports REDIS /
DURABLE only after PING succeeds. Unreachable Redis reports unverified and does
not fall back to memory. The normal test suite skips remote Redis.

Real remote persistence was verified on 2026-10-07. Studio deployment remains
NOT_DEPLOYED and the operating wallet UNFUNDED. No funding, registration, commerce
publication, provider-credential setup, signing, broadcasting, or x402 is authorized.

## Phase 17G completed readiness scope

The throwaway BSC-testnet operating wallet is configured. The free ERC-8183
KAIROS Market Intelligence Brief rail is configured and its BNB readiness sweep
returns ready_to_deploy true with no critical blockers and three funding warnings.
This result is a configuration check, not deployment authorization or proof of
a running seller. The work hook exports read-only JSON fulfillment; official
commercial transport/signing bootstrap remains uninstantiated.

Use `C:\nvm4w\nodejs\bag.cmd doctor --project-root app/agent` and
`C:\nvm4w\nodejs\bag.cmd deploy prepare --provider bnb --json --project-root app/agent`
from `studio/bnb` for read-only readiness. Do not run `bag dev`, negotiate,
publish, buy, submit, settle, deploy, or register in this phase.
No quote was signed, job funded, faucet used, or transaction broadcast.

IPFS remains selected. The managed platform reports injected upload credentials;
do not add local storage credentials for this readiness phase.
ERC-8183 is only external intelligence commerce. Stock execution remains KAIROS →
deterministic risk → Binance quote/build/simulation → Agentic Wallet.
On-chain commerce NOT_PUBLISHED; deployment NOT_DEPLOYED; ERC-8004 NOT_REGISTERED;
trading wallet NOT_CONNECTED. Earlier gate descriptions below are historical.

Paper and read-only only. This runbook does not connect the Agentic Wallet, sign, broadcast, or spend x402. Secret values are names, never literals.

Phase 16 stopped before a real Agent Studio deploy. Plain `bag` on this machine is still Python 0.0.5. The npm CLI is 0.0.14 at `bag.cmd`. Set `KAIROS_BAG_BIN` to that binary for preflight. Do not commit the path.

The Studio workspace at `studio/bnb` pins `pnpm@10.24.0`. From that directory, `corepack pnpm` uses the pin. Do not change global pnpm.

Studio deliverables use `[storage].kind = "ipfs"` with `STORAGE_API_KEY` and `STORAGE_API_URL`. KAIROS cycle state still needs `KAIROS_STATE_BACKEND=redis` and `REDIS_URL`. IPFS does not replace Redis.

Do not run `bag wallet new` until the operating-wallet gate is approved. Do not run `bag deploy --provider` in the readiness phase. `bag deploy prepare` is the readiness sweep only.

## 1. Dependencies

- Node.js 22 or newer. This machine had v24.18.0.
- npm. This machine had 12.0.0.
- Corepack. This machine had 0.35.0.
- pnpm. Current Studio docs ask for pnpm 10. This machine had pnpm 11.10.0. Do not downgrade it silently.
- Bun 1.3 or newer where the current deploy path requires it. This machine had 1.4.2.
- Agent Studio CLI, only after an explicit global upgrade:

```text
npm install --global @bnbagent/studio-cli
```

Confirm `bag --help` and `bag <group> --help` before using any command from the website.

## 2. Environment names

Server only. Do not prefix secrets with `NEXT_PUBLIC`.

| Name | Role |
| --- | --- |
| `KAIROS_DATA_MODE` | `paper` or `live`. Paper is the default. |
| `KAIROS_STATE_BACKEND` | `memory` or `redis`. |
| `REDIS_URL` | Required when the backend is `redis`. |
| `KAIROS_CYCLE_INTERVAL_MS` | Suggested cycle gap. |
| `KAIROS_RESEARCH_INTERVAL_MS` | Research cadence. |
| `BINANCE_WEB3_API_KEY` | Signed market-data reads. |
| `BINANCE_WEB3_SECRET_KEY` | HMAC secret for those reads. |
| `KAIROS_LLM_PROVIDER` | `qwen` when research should call Qwen. |
| `KAIROS_LLM_API_KEY` | Qwen key. |
| `KAIROS_LLM_MODEL` | `qwen3.8-max` for that provider. |
| `KAIROS_QWEN_BASE_URL` | Workspace Chat Completions base. |
| `FMP_API_KEY` | Underlying earnings and news. |
| `KAIROS_WALLET_ADDRESS` | Not used for trading in this phase. |

Leave `KAIROS_AGENTIC_WALLET_EXECUTE`, `KAIROS_AGENTIC_WALLET_LIVE`, and `KAIROS_EXECUTION_LIVE_TEST` unset or `0`.

## 3. State backend

Use Redis before calling a deployment production-durable. Without `REDIS_URL`, preflight reports `MEMORY_EPHEMERAL` and production durable `NO`.

The Redis path is lease acquire, owner renew, owner release, and revision CAS. A missing URL fails closed with `STATE_BACKEND_NOT_CONFIGURED`.

## 4. Studio setup

Do this only after the upgraded CLI's own help matches the current docs.

- Generate a Studio project with the installed CLI. Do not move the Next.js app.
- Keep KAIROS behavior behind `runKairosAutonomousCycle`.
- `studio.toml` comes from that CLI's schema. The operating wallet is not the user's Agentic Wallet.
- Execution mode is `PAPER` or `LIVE_PREVIEW`. Never `LIVE`.
- Do not register ERC-8004 by hand. If Studio does not register, identity stays `NOT REGISTERED`.
- Do not force ERC-8183 into the stock engine.
- Do not spend x402 unless a later explicit approval names a tiny test.

## 5. Preflight

```text
npm run kairos:preflight
```

The command prints statuses only.

## 6. Paper test

```text
npm test
```

Confirm one paper fill is not repeated after a reload when the durable store is in use.

## 7. Deploy

Do not deploy while preflight says `DEPLOYMENT_BLOCKED`.

When the current CLI and a valid project exist, use the deploy subcommands that `bag deploy --help` actually prints. Do not force NodeOps or an AWS-only path unless that help lists it. Successful `next build` is not a deployment.

The deployed process must keep live broadcast false and the trading wallet disconnected.

## 8. Verify

Use the verify, status, and logs commands from the installed CLI. Check deployment status, runtime health, the agent endpoint, heartbeat, two paper cycles, the state backend, paper readiness, and live readiness.

## 9. Identity and operating wallet

If Studio returns a registration, record the agent id, network, public registration reference, endpoint, and operating address. Do not record a private key. If it does not, write `NOT REGISTERED`.

Read a public balance only. Do not fund the operating wallet in this runbook. Do not use it as trading capital.

## 10. Health

The command center and `/agent` show autonomous runtime, state backend, identity, operating wallet, Binance data, Binance skills, Qwen, FMP, trading wallet, and live execution. Those labels must match preflight.

## Phase 17

After this paper path is actually deployed, or the user accepts the blocked local proof:

1. Approve the `baw` upgrade from 1.9.0 to at least 1.10.0. The wallet skill on the hub is 1.12.0.
2. Connect the Agentic Wallet as the trading identity. It stays distinct from the Studio operating wallet.
3. Run a real quote, then simulation, against a tokenized stock KAIROS already resolved.
4. A tiny execution is a separate explicit approval. It is not part of Phase 16.
