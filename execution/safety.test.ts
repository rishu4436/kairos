import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueLiveExecutionContext, issuePaperExecutionContext, resetExecutionAuthority } from "@/domain/execution-authority";
import { parseDecimal } from "@/domain/money";
import { resolveScopedWallet } from "@/domain/wallet-scope";
import { normalizeExecutionError } from "@/execution/errors";
import { prepareLiveExecution, refuseLiveSigning } from "@/execution/live-preparation";
import { emptyLivePreview, executionReadiness, previewFromPreparation } from "@/execution/preview";
import { mapQuoteRoute, mapSwapBuild, quoteExpired } from "@/services/binance/trading/mapper";
import { mapSimulation, refuseBroadcast } from "@/services/binance/transaction/gateway";
import { KairosApiError } from "@/services/binance/errors";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { ids } from "@/test/fixtures";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const WALLET = "0x1111111111111111111111111111111111111111";

describe("execution safety", () => {
  beforeEach(() => {
    resetExecutionAuthority();
  });

  it("maps a quote, rejects expiry and excess slippage, and keeps missing fees null", () => {
    const quote = mapQuoteRoute(
      {
        quoteId: "abc",
        vendorName: "Lifi",
        fromTokenAmount: "1000000",
        toTokenAmount: "10",
        tradeFee: null,
        priceImpactPercent: "0.24",
        executionMode: "RFQ",
      },
      { inputAsset: "usdt", outputAsset: "stock", createdAtMs: NOW, responseTimestamp: null },
    );
    expect(quote?.fees).toBeNull();
    expect(quote?.executionPrice).toBeNull();
    expect(quote?.slippage).toBeNull();
    expect(quoteExpired(quote!.expiresAt, NOW + 30_000)).toBe(true);
    expect(quoteExpired(quote!.expiresAt, NOW + 29_000)).toBe(false);
    const build = mapSwapBuild({ tx: { from: WALLET, to: "0x3333333333333333333333333333333333333333", data: "0x", value: "0" }, executionMode: "RFQ" }, "abc", "56");
    expect(build.requestId).toBeNull();
    expect(build.gasPrice).toBeNull();
    expect(mapSimulation({ status: "SUCCESS", failReason: null }, null).outcome).toBe("PASS");
    expect(mapSimulation({ status: "FAILED", failReason: "reverted" }, null).outcome).toBe("FAIL");
    expect(mapSimulation({ status: "PENDING" }, null).outcome).toBe("UNKNOWN");
  });

  it("keeps wallets user-scoped and normalizes provider failures", () => {
    expect(resolveScopedWallet("user_b", { KAIROS_WALLET_ADDRESS: WALLET }).ok).toBe(false);
    expect(resolveScopedWallet(DEMO_USER_ID, {}).ok).toBe(false);
    expect(resolveScopedWallet(DEMO_USER_ID, { KAIROS_WALLET_ADDRESS: WALLET }).ok).toBe(true);
    expect(resolveScopedWallet(DEMO_USER_ID, { KAIROS_WALLET_ADDRESS: "not-an-address" }).ok).toBe(false);
    const limited = new KairosApiError({
      category: "RATE_LIMITED",
      safeMessage: "Binance rate limit reached. KAIROS will retry.",
      technicalMessage: "secret-key",
    });
    expect(normalizeExecutionError(limited)).toBe("RATE_LIMITED");
    expect(normalizeExecutionError(limited)).not.toBe("secret-key");
  });

  it("refuses another user's wallet, a failed simulation, signing, and broadcast", async () => {
    const quote = vi.fn();
    const foreign = await prepareLiveExecution({
      capability: issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
      userId: ids.userId,
      agentId: ids.agentId,
      accountUserId: "user_b",
      chainId: "56",
      nowMs: NOW,
      riskPassed: true,
      side: "BUY",
      amount: parseDecimal("1"),
      stockContract: "0x2222222222222222222222222222222222222222",
      stockDecimals: 18,
      usdtDecimals: 6,
      walletAddress: WALLET,
      maxSlippageBps: 50,
      quote: { quote, build: vi.fn() },
      simulation: { simulate: vi.fn() },
    });
    expect(foreign.reason).toBe("USER_WALLET_MISMATCH");
    expect(quote).not.toHaveBeenCalled();
    expect(issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }).kind).toBe("paper_execution");
    expect(refuseLiveSigning().broadcast).toBe(false);
    expect(refuseBroadcast().signature).toBeNull();
    const preview = emptyLivePreview();
    expect(preview.status).toBe("NOT READY");
    expect(preview.signing).toBe("SIGNING DISABLED IN CURRENT BUILD");
    expect(preview.broadcast).toBe(false);
    expect(executionReadiness({
      strategy: "No live strategy selected yet",
      riskPass: true,
      quotePass: true,
      simulationPass: false,
      walletConfigured: true,
    }).final).toBe("NOT READY");
    const ready = previewFromPreparation({
      state: "TRANSACTION_SIMULATED",
      reason: null,
      quote: {
        status: "VALID",
        quoteId: "q",
        route: null,
        inputAsset: null,
        outputAsset: null,
        inputAmount: null,
        expectedOutput: null,
        executionPrice: null,
        priceImpact: "0.24",
        slippage: null,
        fees: null,
        expiresAt: new Date(NOW).toISOString(),
        source: "Lifi",
        timestamp: null,
        createdAt: new Date(NOW).toISOString(),
        reason: null,
      },
      build: {
        chainId: "56",
        from: WALLET,
        to: "0x3333333333333333333333333333333333333333",
        data: "0x",
        value: "0",
        gas: null,
        gasPrice: null,
        maxPriorityFeePerGas: null,
        minReceiveAmount: null,
        slippagePercent: null,
        executionMode: null,
        quoteId: "q",
        requestId: null,
      },
      simulation: {
        outcome: "PASS",
        simulationId: null,
        timestamp: null,
        gas: null,
        failureReason: null,
        status: "SUCCESS",
        errorCategory: null,
      },
      broadcast: false,
      signature: null,
    }, "NVDA", "BUY", "1.00");
    expect(ready.status).toBe("READY FOR WALLET");
    expect(ready.expectedPrice).toBeNull();
    expect(ready.broadcast).toBe(false);
  });

  it("keeps paper execution away from live quote code and the preview away from confirmation claims", () => {
    const paper = readdirSync(join(process.cwd(), "paper"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(process.cwd(), "paper", file), "utf8"))
      .join("\n");
    expect(paper).not.toMatch(/live-preparation|aggregator\/quote|pre-transaction\/simulate|broadcast-transaction/);
    const preview = readFileSync(join(process.cwd(), "components", "command", "live-preview.tsx"), "utf8");
    const readiness = readFileSync(join(process.cwd(), "components", "command", "execution-readiness.tsx"), "utf8");
    expect(`${preview}\n${readiness}`).not.toMatch(/EXECUTED|CONFIRMED|ON BSC/);
    const transaction = readFileSync(join(process.cwd(), "services", "binance", "transaction", "gateway.ts"), "utf8");
    expect(transaction).not.toMatch(/broadcast-transaction/);
  });
});
