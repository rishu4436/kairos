# Agent Studio

The local and Agent Studio runtime providers call `runKairosAutonomousCycle`. Studio is not deployed. A live request still does not fall through into a paper fill. The scheduler runs only after `scheduleCycle`. Tests and `next build` do not arm it.

Agent Studio is the runtime and orchestration layer. KAIROS still owns observation, strategies, arbitration, research, risk, and the paper cycle. The runtime decides when a cycle runs. It does not decide what KAIROS does, and it does not sign.

```text
Agent Studio runtime
  → KAIROS agent cycle
    → observation
      → strategies
        → arbitrator
          → research context
            → trade intent
              → KAIROS risk
                → execution preparation
                  → Agentic Wallet
                    → BSC
```

Two wallets stay separate.

| Role | Owner | Use | Must not |
| --- | --- | --- | --- |
| Operating wallet | The agent, through Agent Studio | Identity, x402 service payments, operating expenses | Become the user's trading balance |
| Trading wallet | The user, through Binance Agentic Wallet | Authorized tokenized-stock trades after KAIROS risk and wallet policy | Pay arbitrary agent operating expenses |

The model does not hold either key. External MCP reads do not sign.

## What was inspected

On 2026-10-04:

| Check | Result |
| --- | --- |
| `bnbagent --version` | Command not found |
| Documented CLI | `bag`, package `@bnbagent/studio-cli` |
| `bag --version` | `bag 0.0.5` |
| Global npm package | `@bnbagent/studio-cli@0.0.14` |
| Node | `v24.18.0` |
| Python | `3.14.6` |
| Python SDK | `bnbagent 0.4.6` |
| TypeScript `@bnbagent/sdk` | Not installed in this app |
| `bag doctor` | `error: no studio.toml found in cwd or any parent directory.` |
| Identity | Not registered |
| Operating wallet | Not created |
| Deployment | Not run |

Official pages read for this pass:

- https://www.bnbchain.org/en/bnb-agent-studio
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/architecture/
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/configuration/
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/deployment/
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/security/
- https://docs.bnbchain.org/developer-kit/bnbchain-studio/cli-reference/
- https://github.com/bnb-chain/bnbagent-sdk

The product page says install with `npm install -g @bnbagent/studio-cli`, then `bag skills install`. That global install was already present. It was not upgraded. KAIROS does not depend on `@bnbagent/sdk` or `@bnbagent/studio-runtime`.

## CLI surface that is actually installed

`bag --help` on 0.0.5 says it bootstraps Python agents. The groups present are `init`, `dev`, `doctor`, `deploy`, `wallet`, `erc8004`, `erc8183`, `x402`, `config`, `env`, `skills`, `budget`, `audit`, `llm`, `agents`, `recipe`, `scan`, `bundle`, and `platform`.

`bag deploy --help` defaults to AgentCore. Its subcommands include `prepare`, `agent`, `verify`, `status`, `destroy`, `logs`, and `provision-cognito`. It does not list a NodeOps subcommand.

`bag wallet` can `new`, `show`, `list`, `sign`, `balance`, and `policy`. `show` reads the wallet configured in `studio.toml`. There is no project, so no address was read. `wallet new` and `wallet sign` were not run.

`bag erc8004` can `register`, `show`, `resolve`, and update metadata. Registration was not run. KAIROS does not implement ERC-8004. `AgentStudioIdentityProvider` only normalizes a record Studio would return. The local record is `NOT_REGISTERED`, and `agentId` is null.

`bag x402 buy` help says it pays with `$U` via EIP-3009. The v4 product page also names USDT, USDC, and USD1. No quote, trust, or buy was run.

## Docs versus this CLI

The current docs describe one deployed process, recipe axes, and three deploy targets: `bnb` (48-hour testnet trial), `aws` (Bedrock AgentCore), and `azure` (AI Foundry, A2A only). The v4 blog adds NodeOps as a no-account deploy option. The installed 0.0.5 help does not show `--provider bnb|aws|azure` or NodeOps. The docs also describe `bag mcp serve` as 15 read-only tools. That group is not in this CLI's top-level help.

Documented agent config lives in `app/agent/studio.toml` (`stack`, `wallet`, `llm`, `budget`, `payments.erc8183`, `payments.x402`, `network`, `storage`, `identity`, `deploy`). Secrets live in `app/agent/.env.local` and the keystore in `.studio/wallets/`, outside the deploy artifact. KAIROS does not read `WALLET_PASSWORD`.

Signing, in a generated project, stays in fixed code. The docs say the model gets read-only chain tools. That matches the KAIROS rule that the research brain cannot sign.

## KAIROS adapter

`LocalRuntimeProvider` and `AgentStudioRuntimeProvider` both call `runKairosAgentCycle`, which calls the existing `runAgentCycle` for paper. A live request does not fall through to paper. A missing trading wallet blocks live execution. A market-data failure does not call the paper cycle. A research failure is recorded and does not stop strategy evaluation.

The scheduler stores a next-due time and a backoff after failure. It does not start a timer. `pump` runs at most one cycle when that time has arrived. The dashboard does not start the runtime, so the shown state is `OFFLINE` and the next cycle is `NOT SCHEDULED`.

Runtime states (`LOCAL`, `DEPLOYMENT_READY`, `DEPLOYED`, `RUNNING`, `PAUSED`, `ERROR`, `OFFLINE`) are separate from the trading lifecycle (`OBSERVING`, `ARBITRATING`, `WAITING_FOR_RISK`, `MONITORING_POSITION`).

`RuntimeStateStore` is in memory. A production multi-user deployment needs durable storage. The docs describe one runtime and one signer. This build does not invent per-user Studio profiles. Trading books stay keyed by user. One user's cycle is not listed as another user's cycle.

## Deployment

Not performed. `npm run agent-studio:precheck` prints `bag --version` and `bag doctor` and does not deploy.

A later one-time deploy, after `bag init` creates a project, would follow the installed CLI: `bag deploy prepare`, then `bag deploy agent`, then `bag deploy verify`. The docs' simplest trial is the `bnb` 48-hour testnet target, using a throwaway operating wallet. The installed help instead defaults to AgentCore. Those two descriptions disagree, so no target was selected. The agent would stay in paper / read-only mode until live execution is explicitly enabled. AWS and Azure create resources in the operator's account. NodeOps is described on the v4 blog and was not available in this CLI help.

## MCP and skills

`services/external-access.ts` stays unimplemented. `KairosExternalAgentInterface` is an in-process read boundary: market context, strategy signals, arbitration, research, and an approved-trade state that is always unapproved. It has no sign method.

Skill sources, in order, are `DIRECT_API`, `SKILL`, `PLUGIN`, `CLI` / `LOCAL_CLI`, then `MOCK`. One source is selected. A direct adapter suppresses a skill or plugin for the same observation. Phase 9 Binance skills are unchanged.

## x402

`AgentOperatingBudget` lists the documented assets and keeps `balance` null. `autoTopup` is false. `requestX402Payment` returns `paid: false`. `bag budget enable` was not run.
