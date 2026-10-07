# Agent Studio

Agent Studio supplies runtime/orchestration around KAIROS. KAIROS retains observation, strategies, arbitration, research, deterministic risk, and execution policy.

## Workspace and configuration

The workspace is `studio/bnb`, with `app/agent/studio.toml`. It pins `pnpm@10.24.0`; use Node.js 22 or newer. The configuration targets the `@bnbagent/studio-cli` 0.0.14 schema. The agent package's build performs TypeScript checking without emitting files.

Set `KAIROS_BAG_BIN` privately if PATH resolves an unrelated `bag` program. Inspect the selected CLI's help and schema before operating it. Do not commit machine-specific executable paths.

The configured network is BSC testnet. The local operating wallet's public address lives in TOML; encrypted keystores and `WALLET_PASSWORD` stay under ignored workspace configuration. This is agent operating capital, separate from the user's Binance Agentic Wallet trading capital. Models hold neither signing authority.

## External intelligence work

`app/agent/src/unifiedMain.ts` exports `runIntelligenceWork`, a RunWork-compatible read-only JSON hook implemented through `studio/intelligence.ts`. It does not bootstrap a seller transport or signer, and does not export the trading/paper-cycle entrypoint.

The service is KAIROS Market Intelligence Brief, also available through `POST /api/intelligence`. Input contains `requestId`, `ticker`, `requestedReportType=MARKET_INTELLIGENCE_BRIEF`, and an ISO `timestamp`.

Fulfillment reads bounded, fresh public market snapshots already published by observation. It returns representation, price/reference context, freshness, session, regime, standard strategy signals, provenance, and unavailable markers. An external job cannot fetch private account state, trigger market polling, run a trading cycle, or obtain execution authority.

ERC-8183 is enabled for this intelligence rail. Canonical seller pricing is `price_usd = "0"`, quote TTL is 900 seconds, and automatic settlement is disabled. b402 selling and operating budget automation remain disabled. Configuration is not a running or published seller.

IPFS stores Studio deliverables; `STORAGE_API_KEY` and `STORAGE_API_URL` are private configuration when required by the deployment target. They do not replace Redis for KAIROS runtime state.

## Runtime and boundaries

`studio/entrypoint.ts` wraps the autonomous cycle with paper as default and a server-controlled live-preview boundary. Local and Studio runtime adapters call the same orchestration. Scheduling stores a due time; importing the app or building it does not arm a timer. Runtime state and trading lifecycle state are separate.

Identity remains NOT_REGISTERED; deployment remains NOT_DEPLOYED. The external MCP transport remains unimplemented, and operating-payment requests return `paid: false`. No deployment, registration, signing, settlement, or funding follows from configuration readiness.

Skill inputs use one selected source with precedence DIRECT_API, SKILL, PLUGIN, CLI/LOCAL_CLI, then MOCK. A direct adapter suppresses duplicate skill/plugin reads. See [Binance skills](BINANCE_SKILLS.md), [Agentic Wallet](AGENTIC_WALLET.md), and [State persistence](STATE_PERSISTENCE.md).
