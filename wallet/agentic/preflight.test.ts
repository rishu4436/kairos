import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueLiveExecutionContext, resetExecutionAuthority } from "@/domain/execution-authority";
import { asAgentId, asUserId } from "@/domain/ids";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { executeThroughAgenticWallet } from "@/wallet/agentic/execute";
import { acceptHumanConfirmation, liveExecutionEnabled, liveTestCeilingUsd, notionalWithinCeiling, reconcileObservedPosition } from "@/wallet/agentic/live-test";
import { runAgenticWalletPreflight, type ToolingMetadata } from "@/wallet/agentic/preflight";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");

describe("agentic wallet readiness", () => {
  beforeEach(() => {
    resetExecutionAuthority();
  });

  it("blocks an unconnected wallet and an unknown token state", () => {
    const blocked = runAgenticWalletPreflight({
      userId: DEMO_USER_ID,
      expectedUserId: DEMO_USER_ID,
      agentId: "agent_demo",
      expectedAgentId: "agent_demo",
      connectionStatus: "UNCONNECTED",
      bscSupported: false,
      walletAddress: null,
      policy: null,
      tokenAllowed: true,
      tokenTradable: null,
      tooling: tooling(),
    });
    expect(blocked.result).toBe("BLOCKED");
    expect(blocked.reasons).toEqual(expect.arrayContaining([
      "WALLET_UNAVAILABLE",
      "BSC_UNSUPPORTED",
      "WALLET_ADDRESS_UNAVAILABLE",
      "WALLET_POLICY_UNAVAILABLE",
      "TOKEN_TRADABILITY_UNKNOWN",
    ]));
  });

  it("rejects a halted token, a generic confirmation, and a notional above the ceiling", () => {
    const halted = runAgenticWalletPreflight({
      ...passingInput(),
      tokenTradable: false,
    });
    expect(halted.reasons).toContain("TOKEN_NOT_TRADABLE");
    expect(acceptHumanConfirmation("yes", "yes")).toBe(false);
    expect(acceptHumanConfirmation("operator-confirmed-live-test", null)).toBe(false);
    expect(acceptHumanConfirmation("operator-confirmed-live-test", "operator-confirmed-live-test")).toBe(true);
    expect(notionalWithinCeiling(100, liveTestCeilingUsd({} as NodeJS.ProcessEnv))).toBe(false);
    expect(notionalWithinCeiling(1, 5)).toBe(true);
    expect(liveExecutionEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(reconcileObservedPosition({ verified: false, expectedAmount: "1", observedAmount: "1" }).updated).toBe(false);
    expect(reconcileObservedPosition({ verified: true, expectedAmount: "1", observedAmount: "0" }).reconciliation).toBe("POSITION_RECONCILIATION_REQUIRED");
  });

  it("does not confirm, fill paper, or emit a confirmation event when a gate fails", async () => {
    const swap = vi.fn();
    const cases = [
      { quoteValid: false },
      { quoteExpired: true },
      { slippageWithinPolicy: false },
      { tradable: false },
      { walletConnected: false },
      { simulationPassed: false },
      { buildPassed: false },
      { riskPassed: false },
    ];
    for (const item of cases) {
      const outcome = await executeThroughAgenticWallet(request(item), { executeSwap: swap, getStatus: vi.fn(), getSecurityPolicy: vi.fn(), getBalances: vi.fn(), getOrderStatus: vi.fn() }, true);
      expect(outcome.phase === "CONFIRMED").toBe(false);
      expect(outcome.paperFill).toBe(false);
      expect(outcome.events.some((event) => event.type === "TRANSACTION_CONFIRMED")).toBe(false);
    }
    expect(swap).not.toHaveBeenCalled();
    const unconfirmed = await executeThroughAgenticWallet(request({ humanConfirmation: "yes", expectedConfirmation: "yes" }), {
      executeSwap: swap,
      getStatus: vi.fn(),
      getSecurityPolicy: vi.fn(),
      getBalances: vi.fn(),
      getOrderStatus: vi.fn(),
    }, true);
    expect(unconfirmed.reason).toBe("CONFIRMATION_REQUIRED");
    expect(swap).not.toHaveBeenCalled();
  });
});

function tooling(): ToolingMetadata {
  return {
    nodeVersion: "v24.18.0",
    cliVersion: "1.10.0",
    requiredCliVersion: "1.10.0",
    installedSkillVersion: "1.12.0",
    latestSkillVersion: "1.12.0",
    cliCompatible: true,
  };
}

function passingInput() {
  return {
    userId: DEMO_USER_ID,
    expectedUserId: DEMO_USER_ID,
    agentId: "agent_demo",
    expectedAgentId: "agent_demo",
    connectionStatus: "CONNECTED" as const,
    bscSupported: true,
    walletAddress: "0x1111111111111111111111111111111111111111",
    policy: {
      dailyLimit: 50,
      quotaUsed: 0,
      quotaLeft: 50,
      quotaDate: "2026-10-04",
      tradeAllTokens: true,
      highRiskHandling: "AutoReject" as const,
    },
    tokenAllowed: true,
    tokenTradable: true,
    tooling: tooling(),
  };
}

function request(overrides: Record<string, unknown>) {
  return {
    capability: issueLiveExecutionContext({ userId: asUserId(DEMO_USER_ID), agentId: asAgentId("agent_demo"), nowMs: NOW }),
    userId: DEMO_USER_ID,
    agentId: "agent_demo",
    assetId: "paper:TSLA",
    action: "BUY" as const,
    notionalUsd: 1,
    fromToken: "0x55d398326f99059fF775485246999027B3197955",
    toToken: "0x2222222222222222222222222222222222222222",
    fromTokenQty: "1",
    slippagePercent: "0.5",
    chainId: "56",
    correlationId: "corr-tsla",
    intentId: "intent-tsla",
    nowMs: NOW,
    riskPassed: true,
    quoteValid: true,
    quoteExpired: false,
    slippageWithinPolicy: true,
    buildPassed: true,
    simulationPassed: true,
    tradable: true,
    policy: passingInput().policy,
    walletConnected: true,
    walletAddress: "0x1111111111111111111111111111111111111111",
    expectedWalletAddress: "0x1111111111111111111111111111111111111111",
    humanConfirmation: "operator-confirmed-live-test",
    expectedConfirmation: "operator-confirmed-live-test",
    ...overrides,
  };
}
