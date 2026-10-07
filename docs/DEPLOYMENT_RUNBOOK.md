# Deployment runbook

## Local validation

Use Node.js 22 or newer, root npm dependencies, and the separately pinned pnpm 10.24.0 Studio workspace. Run root lint, typecheck, tests, and build; run the Studio agent build from `studio/bnb/app/agent`. A successful build does not deploy the system.

Keep credentials in ignored root `.env.local` or the applicable ignored Studio environment file. `.env.example` contains variable names only. Never prefix credentials with NEXT_PUBLIC.

## Service configuration

- Market: KAIROS_DATA_MODE, BINANCE_WEB3_API_KEY, BINANCE_WEB3_SECRET_KEY.
- Research: KAIROS_LLM_PROVIDER (qwen, gemini, xai, or explicit mock), KAIROS_LLM_API_KEY, KAIROS_LLM_MODEL, KAIROS_LLM_TIMEOUT_MS; Qwen also requires KAIROS_QWEN_BASE_URL.
- Events: FMP_API_KEY.
- Runtime: KAIROS_STATE_BACKEND, REDIS_URL, KAIROS_CYCLE_INTERVAL_MS, KAIROS_RESEARCH_INTERVAL_MS.
- Studio: KAIROS_BAG_BIN, WALLET_PASSWORD, and deliverable-storage configuration when required.

Select Redis before treating runtime storage as production durable. REDIS_URL must be a read/write redis:// or rediss:// TCP connection URL. Upstash's HTTPS REST endpoint is unsupported; TCP authentication is embedded in the URL, so no separate token variable is needed. Connectivity loss fails closed rather than reverting to memory.

## Readiness

`npm run kairos:preflight` reports status without printing credentials. It probes configured services, including Redis, and can make network/CLI reads; run it separately from offline validation. Presence-only provider readiness is not a successful model call.

Select the official npm Studio CLI through KAIROS_BAG_BIN when needed. From `studio/bnb`, CLI doctor/readiness commands use `--project-root app/agent`. Consult the selected binary's help before invoking deployment commands. The checked-in project already exists; do not create another scaffold.

## Deployment boundary

Studio's read-only intelligence hook and free ERC-8183 rail are configured. The seller transport/signing bootstrap remains uninstantiated. Deployment, commerce publication, and ERC-8004 registration remain inactive. Studio IPFS deliverables and KAIROS Redis state are independent.

Keep live execution gates unset or zero during paper/read-only operation. Deployment, wallet connection, funding, registration, and real execution are separate operator actions. Do not infer permission to spend from passing readiness checks.

For an authorized deployment, confirm the target and current CLI schema, require durable state and recovery validation, then use that CLI's prepare/deploy/verify commands. Verify endpoint, heartbeat, runtime health, paper cycles, state persistence, and explicit live-readiness status. Record public registration identifiers only if a registration actually exists.

See [Agent Studio](AGENT_STUDIO.md), [Agentic Wallet](AGENTIC_WALLET.md), [State persistence](STATE_PERSISTENCE.md), and provider guides for optional gated integration tests.
