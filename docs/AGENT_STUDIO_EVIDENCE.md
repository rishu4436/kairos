# Agent Studio evidence

Recorded on 2026-10-04 from this machine. Blank cells were not observed. They are not assumed.

| Item | Evidence |
| --- | --- |
| CLI command | `bag`, not `bnbagent`. `bnbagent` is not on `PATH`. |
| CLI version | `bag --version` printed `bag 0.0.5`. |
| CLI package | Global npm shows `@bnbagent/studio-cli@0.0.14`. The version string and the package version differ. Both are recorded as printed. |
| Node | `v24.18.0` |
| Python | `3.14.6` |
| Python SDK | `bnbagent 0.4.6` (`pip show`) |
| TypeScript SDK | `@bnbagent/sdk` is not a dependency of this app and was not installed. |
| Project | `bag doctor` printed `error: no studio.toml found in cwd or any parent directory.` |
| Agent identity | Not read. `bag erc8004 register` and `bag erc8004 show` were not run. No ERC-8004 agent id, agent URI, or network was returned. |
| Runtime deployment | Not deployed. `bag deploy` was not run. No runtime ARN, endpoint, or deployment id was returned. |
| Heartbeat | No cycle has been scheduled by the server. The dashboard shows `NOT AVAILABLE` and `NOT SCHEDULED`. |
| Operating wallet | Not created. `bag wallet new` and `bag wallet show` were not run. No operating address or balance was read. |
| x402 | Not used. `bag x402 quote`, `trust`, and `buy` were not run. No payment, challenge, or balance change was observed. |
| Skill plugins | `bag skills install` was not run. The Binance skill registry from Phase 9 is unchanged. `PLUGIN` is an allowed source class and was not observed as installed. |
| MCP registration | The product page says the CLI registers Studio's MCP server with Cursor or Claude Code. This session did not run `bag skills install` or `bag mcp serve`. The installed `bag --help` does not list an `mcp` group. KAIROS did not open an MCP server. |
| Persistence | Runtime state is in memory only. It was not written to disk. |
| Failure handling | Covered by unit tests: a thrown cycle is stored as a failure, creates no intent, and the next due time backs off. |
| Recovery | Covered by unit tests: stop then start keeps the last cycle and resets uptime. |
| External agents | The in-process interface refuses signing and returns no approved trade. No external client connected. |

No tokenized-stock trade was sent. User trading capital was not connected by this phase. Global tooling was not installed or upgraded.

Time to a running Studio agent was not measured, because no Studio project was created and nothing was deployed.

## Phase 16, 2026-10-07

| Layer | Result |
| --- | --- |
| CODE SUPPORT | The Studio adapter calls `runKairosAutonomousCycle`. A live request is `LIVE_PREVIEW`, not `LIVE`, and does not call the paper executor. Operating and trading wallets cannot fund each other. |
| LOCAL VERIFICATION | `bag --version` printed `bag 0.0.5`. `bag --help` has no `mcp` group. `bag deploy --help` is the AgentCore flow (`prepare`, `agent`, `verify`, `status`, `info`, `destroy`, `logs`), not `deploy --provider bnb`. `bag doctor` still reports no `studio.toml`. `npm view @bnbagent/studio-cli version` printed `0.0.14` (published 2026-09-20, bin `dist/bag.js`). |
| COMPATIBILITY | `UPDATE_REQUIRED`. Installed CLI 0.0.5. Target package `@bnbagent/studio-cli@0.0.14`. Command: `npm install --global @bnbagent/studio-cli`. The global package was not changed. |
| DEPLOYED VERIFICATION | `DEPLOYMENT_BLOCKED`. No `studio.toml` was written. Nothing was deployed. |
| ON-CHAIN VERIFICATION | Identity is `NOT REGISTERED`. No operating wallet was provisioned. No registration transaction exists. |

Node v24.18.0, npm 12.0.0, Corepack 0.35.0, pnpm 11.10.0, Bun 1.4.2. Current Studio docs ask for pnpm 10. pnpm was not downgraded.

Current docs also describe `bag mcp` and `bag deploy --provider`. The PATH CLI did not expose those commands.

## Phase 17D–17E

| Layer | Result |
| --- | --- |
| CODE SUPPORT | `studio/bnb/app/agent/studio.toml` exists. Storage kind is `ipfs`. Payments and budget are disabled. `studio/entrypoint.ts` calls `runKairosAutonomousCycle` in `PAPER` unless the server sets `LIVE_PREVIEW`. |
| LOCAL VERIFICATION | `C:\nvm4w\nodejs\bag.cmd --version` is `0.0.14`. Plain `bag` remains Python `0.0.5`. The workspace pin is `pnpm@10.24.0`, installed through Corepack. Global pnpm was not changed. |
| DEPLOYED VERIFICATION | Not deployed. `bag.cmd deploy prepare --provider bnb --json` returned `ready_to_deploy: false` with critical checks for the missing keystore, missing `WALLET_PASSWORD`, and no commerce rail. `deploy --provider` was not run. |
| ON-CHAIN VERIFICATION | Identity is `NOT REGISTERED`. No operating wallet and no `WALLET_PASSWORD`. |
