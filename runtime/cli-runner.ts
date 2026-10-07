import { existsSync } from "node:fs";
import { asAgentId, asUserId } from "@/domain/ids";
import { PRODUCTION_CHAIN_ID } from "@/domain/network";
import { issueLiveExecutionContext } from "@/domain/execution-authority";
import { resolveScopedWallet } from "@/domain/wallet-scope";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { observeLiveMarket } from "@/observation/live";
import { localPaperSession } from "@/paper/session";
import { createLocalKairosRunner } from "@/runtime/local-host";
import { BinanceWeb3Client } from "@/services/binance/client";
import { readBinanceConfig } from "@/services/binance/config";
import { BinanceQuoteGateway } from "@/services/binance/trading/gateway";
import { BinanceSimulationGateway } from "@/services/binance/transaction/gateway";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const session = localPaperSession();
if (!session) {
  throw new Error("LOCAL_SESSION_UNAVAILABLE");
}

const wallet = resolveScopedWallet(LOCAL_RUNTIME_USER_ID);

function liveAdapters(nowMs: number) {
  const client = new BinanceWeb3Client({ config: readBinanceConfig() });
  return {
    capability: issueLiveExecutionContext({
      userId: asUserId(LOCAL_RUNTIME_USER_ID),
      agentId: asAgentId(DEFAULT_AGENT_ID),
      nowMs,
    }),
    quote: new BinanceQuoteGateway(client),
    simulation: new BinanceSimulationGateway(client),
    walletAddress: wallet.ok ? wallet.wallet.address : null,
    chainId: PRODUCTION_CHAIN_ID,
  };
}

const runner = createLocalKairosRunner({
  executionMode: process.env.KAIROS_DATA_MODE === "live" ? "LIVE_PREVIEW" : undefined,
  observeMarket: process.env.KAIROS_DATA_MODE === "live" ? observeLiveMarket : undefined,
  riskPolicy: process.env.KAIROS_DATA_MODE === "live" ? session.policy : undefined,
  livePreparation: process.env.KAIROS_DATA_MODE === "live" ? liveAdapters : undefined,
  onCycle: (outcome) => {
    const summary = {
      cycleId: outcome.cycleId,
      status: outcome.status,
      executionMode: outcome.executionMode,
      liveGate: outcome.liveGate,
      signed: outcome.signed,
      broadcast: outcome.broadcast,
      walletSubmitted: outcome.walletSubmitted,
      walletOrderId: outcome.walletOrderId,
      marketBlocked: outcome.marketBlocked,
      liveBlocked: outcome.liveBlocked,
      createdIntentIds: outcome.createdIntentIds,
      assetResults: outcome.assetResults,
      errors: outcome.errors,
      warnings: outcome.warnings,
      preparations: outcome.preparations.map((item) => ({
        state: item.state,
        reason: item.reason,
        quoteId: item.quote?.quoteId ?? null,
      })),
      nextSuggestedRunAt: outcome.nextSuggestedRunAt,
      startedAt: outcome.startedAt,
      completedAt: outcome.completedAt,
    };
    console.log(`[kairos.cycle] ${JSON.stringify(summary)}`);
  },
});

function shutdown(): void {
  runner.stop();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runner.runLoop().catch((error: unknown) => {
  console.error("[kairos.runner]", error instanceof Error ? error.message : "runner failed");
  process.exitCode = 1;
  runner.stop();
});
