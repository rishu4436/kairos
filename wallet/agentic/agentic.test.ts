import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asAgentId, asUserId } from "@/domain/ids";
import { issueLiveExecutionContext, issuePaperExecutionContext, resetExecutionAuthority } from "@/domain/execution-authority";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { assessWalletPolicy } from "@/wallet/agentic/policy";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { executeThroughAgenticWallet, type AgenticExecutionRequest } from "@/wallet/agentic/execute";
import type { AgenticWalletGateway } from "@/wallet/agentic/gateway";
import { ids } from "@/test/fixtures";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const WALLET = "0x1111111111111111111111111111111111111111";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const STOCK = "0x2222222222222222222222222222222222222222";

describe("agentic wallet boundary", () => {
  beforeEach(() => {
    resetExecutionAuthority();
  });

  it("blocks a trade that exceeds the wallet quota and does not call the wallet", async () => {
    const decision = assessWalletPolicy({
      notionalUsd: 100,
      policy: policy({ quotaLeft: 50, tradeAllTokens: true, highRiskHandling: "AutoReject" }),
    });
    expect(decision.reason).toBe("BLOCKED BY WALLET LIMIT");
    const swap = vi.fn();
    const blocked = await executeThroughAgenticWallet(base({ notionalUsd: 100, policy: policy({ quotaLeft: 50, tradeAllTokens: true, highRiskHandling: "AutoReject" }) }), gateway(swap), true);
    expect(blocked.phase).toBe("WALLET_POLICY_BLOCKED");
    expect(blocked.paperFill).toBe(false);
    expect(swap).not.toHaveBeenCalled();
  });

  it("stops when the token is not tradable, the user does not match, or execution is disabled", async () => {
    const swap = vi.fn();
    const halted = await executeThroughAgenticWallet(base({ tradable: false }), gateway(swap), true);
    expect(halted.reason).toBe("TOKEN_NOT_TRADABLE");
    expect(swap).not.toHaveBeenCalled();
    const paper = await executeThroughAgenticWallet({
      ...base({}),
      capability: issuePaperExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
    }, gateway(swap), true);
    expect(paper.reason).toBe("EXECUTION_CAPABILITY_MISMATCH");
    const held = await executeThroughAgenticWallet(base({}), gateway(swap), false);
    expect(held.phase).toBe("READY_FOR_WALLET");
    expect(held.reason).toBe("EXECUTION_NOT_ENABLED");
    expect(swap).not.toHaveBeenCalled();
  });

  it("submits only a validated swap and does not treat the order id as confirmation", async () => {
    const calls: string[][] = [];
    const cli = new CliAgenticWalletGateway(async (args) => {
      calls.push([...args]);
      if (args[0] === "market-order" && args[1] === "swap") {
        return JSON.stringify({ success: true, data: { orderId: "order-1" } });
      }
      return JSON.stringify({ success: true, data: { list: [{ orderId: "order-1", status: "PENDING", txHash: null, chain: "56" }] } });
    });
    const outcome = await executeThroughAgenticWallet(demoRequest(), cli, true);
    expect(outcome.phase).toBe("VERIFICATION_FAILED");
    expect(outcome.result?.status).toBe("SUBMITTED");
    expect(outcome.result?.transactionHash).toBeNull();
    expect(calls.some((args) => args.includes("broadcast"))).toBe(false);
    const finished = new CliAgenticWalletGateway(async (args) => {
      if (args[1] === "swap") {
        return JSON.stringify({ success: true, data: { orderId: "order-2" } });
      }
      return JSON.stringify({ success: true, data: { list: [{ orderId: "order-2", status: "FINISHED", txHash: "0xabc", chain: "56", updatedTime: "2026-10-04T15:00:00+00:00" }] } });
    });
    const confirmed = await executeThroughAgenticWallet(demoRequest(), finished, true);
    expect(confirmed.phase).toBe("CONFIRMED");
    expect(confirmed.result?.transactionHash).toBe("0xabc");
    expect(confirmed.events.some((item) => item.type === "TRANSACTION_CONFIRMED" && item.correlationId === "corr-1" && item.intentId === "intent-1")).toBe(true);
  });

  it("keeps another user off the CLI session and rejects a mismatched wallet", async () => {
    const calls: string[][] = [];
    const cli = new CliAgenticWalletGateway(async (args) => {
      calls.push([...args]);
      return JSON.stringify({ success: true, data: { status: "CONNECTED" } });
    });
    const other = await cli.getStatus("user_b", "agent_b");
    expect(other.connectionStatus).toBe("UNCONNECTED");
    expect(other.walletAddress).toBeNull();
    expect(calls).toHaveLength(0);
    const mismatch = await executeThroughAgenticWallet(base({ walletAddress: "0x3333333333333333333333333333333333333333" }), cli, true);
    expect(mismatch.reason).toBe("WALLET_MISMATCH");
  });

  it("does not store signing material and does not let paper code import the wallet adapter", () => {
    const source = ["cli.ts", "execute.ts", "gateway.ts", "parse.ts", "policy.ts"]
      .map((file) => readFileSync(join(process.cwd(), "wallet", "agentic", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/private key|seed phrase|BEGIN PRIVATE/i);
    const paper = readdirSync(join(process.cwd(), "paper"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(join(process.cwd(), "paper", file), "utf8"))
      .join("\n");
    expect(paper).not.toMatch(/agentic\/cli|market-order swap/);
  });
});

function policy(input: { quotaLeft: number; tradeAllTokens: boolean; highRiskHandling: "AutoReject" | "NeedConfirmation" }) {
  return {
    dailyLimit: 100,
    quotaUsed: 0,
    quotaLeft: input.quotaLeft,
    quotaDate: "2026-10-04",
    tradeAllTokens: input.tradeAllTokens,
    highRiskHandling: input.highRiskHandling,
  };
}

function gateway(swap: ReturnType<typeof vi.fn>): AgenticWalletGateway {
  return {
    getStatus: vi.fn(),
    getSecurityPolicy: vi.fn(),
    getBalances: vi.fn(),
    executeSwap: swap,
    getOrderStatus: vi.fn(),
  };
}

function demoRequest(): AgenticExecutionRequest {
  return base({
    userId: DEMO_USER_ID,
    agentId: "agent_demo",
    capability: issueLiveExecutionContext({ userId: asUserId(DEMO_USER_ID), agentId: asAgentId("agent_demo"), nowMs: NOW }),
  });
}

function base(overrides: Partial<AgenticExecutionRequest>): AgenticExecutionRequest {
  return {
    capability: issueLiveExecutionContext({ userId: ids.userId, agentId: ids.agentId, nowMs: NOW }),
    userId: ids.userId,
    agentId: ids.agentId,
    assetId: "paper:NVDA",
    action: "BUY",
    notionalUsd: 25,
    fromToken: USDT,
    toToken: STOCK,
    fromTokenQty: "25",
    slippagePercent: "0.5",
    chainId: "56",
    correlationId: "corr-1",
    intentId: "intent-1",
    nowMs: NOW,
    riskPassed: true,
    quoteValid: true,
    quoteExpired: false,
    slippageWithinPolicy: true,
    buildPassed: true,
    simulationPassed: true,
    tradable: true,
    policy: policy({ quotaLeft: 50, tradeAllTokens: true, highRiskHandling: "AutoReject" }),
    walletConnected: true,
    walletAddress: WALLET,
    expectedWalletAddress: WALLET,
    humanConfirmation: "operator-confirmed-live-test",
    expectedConfirmation: "operator-confirmed-live-test",
    ...overrides,
  };
}
