import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDecimal } from "@/domain/money";
import { issueLiveExecutionContext, resetExecutionAuthority } from "@/domain/execution-authority";
import { prepareLiveExecution, refuseLiveSigning, toSmallestUnit } from "@/execution/live-preparation";
import type { QuoteResult, TransactionBuildResult } from "@/domain/execution-prep";
import { refuseBroadcast } from "@/services/binance/transaction/gateway";
import { ids } from "@/test/fixtures";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const WALLET = "0x1111111111111111111111111111111111111111";
const STOCK = "0x2222222222222222222222222222222222222222";

describe("live execution preparation", () => {
  beforeEach(() => {
    resetExecutionAuthority();
  });

  it("quotes only after risk passes and stops at a passing simulation", async () => {
    const quote = vi.fn(async () => validQuote());
    const build = vi.fn(async () => validBuild());
    const simulate = vi.fn(async () => passSimulation());
    const blocked = await prepareLiveExecution(input({ riskPassed: false, quote, build, simulate }));
    expect(blocked.state).toBe("QUOTE_REJECTED");
    expect(quote).not.toHaveBeenCalled();

    const prepared = await prepareLiveExecution(input({ riskPassed: true, quote, build, simulate }));
    expect(prepared.state).toBe("TRANSACTION_SIMULATED");
    expect(prepared.broadcast).toBe(false);
    expect(prepared.signature).toBeNull();
    expect(prepared.simulation?.outcome).toBe("PASS");
    expect(quote).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledOnce();
    expect(simulate).toHaveBeenCalledOnce();
  });

  it("rejects slippage above the user limit and does not build", async () => {
    const quote = vi.fn(async () => validQuote("5"));
    const build = vi.fn();
    const result = await prepareLiveExecution(input({ riskPassed: true, quote, build, simulate: vi.fn() }));
    expect(result.state).toBe("QUOTE_REJECTED");
    expect(result.reason).toBe("SLIPPAGE_LIMIT_EXCEEDED");
    expect(build).not.toHaveBeenCalled();
  });

  it("does not simulate an expired quote or turn a failed simulation into a pass", async () => {
    const expired = validQuote();
    expired.expiresAt = new Date(NOW - 1).toISOString();
    const build = vi.fn();
    const expiredResult = await prepareLiveExecution(input({
      riskPassed: true,
      quote: vi.fn(async () => expired),
      build,
      simulate: vi.fn(),
    }));
    expect(expiredResult.quote?.status).toBe("EXPIRED");
    expect(build).not.toHaveBeenCalled();

    const failed = await prepareLiveExecution(input({
      riskPassed: true,
      quote: vi.fn(async () => validQuote()),
      build: vi.fn(async () => validBuild()),
      simulate: vi.fn(async () => ({
        outcome: "FAIL" as const,
        simulationId: null,
        timestamp: null,
        gas: null,
        failureReason: "execution reverted",
        status: "FAILED",
        errorCategory: "SIMULATION_FAILED",
      })),
    }));
    expect(failed.state).toBe("TRANSACTION_REJECTED");
    expect(failed.simulation?.outcome).toBe("FAIL");
    expect(failed.broadcast).toBe(false);
  });

  it("does not replace a quote failure with paper execution and refuses signing", async () => {
    const result = await prepareLiveExecution(input({
      riskPassed: true,
      quote: vi.fn(async () => {
        throw new Error("upstream");
      }),
      build: vi.fn(),
      simulate: vi.fn(),
    }));
    expect(result.state).toBe("QUOTE_REJECTED");
    expect(result.reason).toBe("QUOTE_UNAVAILABLE");
    expect(refuseLiveSigning()).toEqual({ code: "EXECUTION_NOT_AVAILABLE", broadcast: false, signature: null });
    expect(refuseBroadcast()).toEqual(refuseLiveSigning());
    expect(toSmallestUnit(parseDecimal("1"), 6)).toBe("1000000");
    expect(toSmallestUnit(parseDecimal("1"), 18)).toBe(`${10n ** 18n}`);
  });
});

function input(overrides: {
  riskPassed: boolean;
  quote: ReturnType<typeof vi.fn>;
  build: ReturnType<typeof vi.fn>;
  simulate: ReturnType<typeof vi.fn>;
}) {
  return {
    capability: issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
    userId: ids.userId,
    agentId: ids.agentId,
    nowMs: NOW,
    accountUserId: ids.userId,
    chainId: "56",
    riskPassed: overrides.riskPassed,
    side: "BUY" as const,
    amount: parseDecimal("1"),
    stockContract: STOCK,
    stockDecimals: 18,
    usdtDecimals: 6,
    walletAddress: WALLET,
    maxSlippageBps: 50,
    quote: { quote: overrides.quote, build: overrides.build },
    simulation: { simulate: overrides.simulate },
  };
}

function validQuote(priceImpact = "0.10"): QuoteResult {
  return {
    status: "VALID",
    quoteId: "quote-1",
    route: { quoteId: "quote-1", vendorName: "Lifi", executionMode: "RFQ" },
    inputAsset: "usdt",
    outputAsset: STOCK,
    inputAmount: "1000000",
    expectedOutput: "10",
    executionPrice: null,
    priceImpact,
    slippage: null,
    fees: null,
    expiresAt: new Date(NOW + 30_000).toISOString(),
    source: "Lifi",
    timestamp: null,
    createdAt: new Date(NOW).toISOString(),
    reason: null,
  };
}

function validBuild(): TransactionBuildResult {
  return {
    chainId: "56",
    from: WALLET,
    to: "0x3333333333333333333333333333333333333333",
    data: "0x12aa",
    value: "0",
    gas: "200000",
    gasPrice: null,
    maxPriorityFeePerGas: null,
    minReceiveAmount: null,
    slippagePercent: "0.5",
    executionMode: "RFQ",
    quoteId: "quote-1",
    requestId: null,
  };
}

function passSimulation() {
  return {
    outcome: "PASS" as const,
    simulationId: null,
    timestamp: new Date(NOW).toISOString(),
    gas: null,
    failureReason: null,
    status: "SUCCESS",
    errorCategory: null,
  };
}
