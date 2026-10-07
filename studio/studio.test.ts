import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentCycleResult } from "@/paper/cycle";
import { selectSkillSource } from "@/skills/source";
import { accessPrivateKey, kairosCapabilityManifest, overrideRisk } from "@/studio/manifest";
import { AgentStudioIdentityProvider, LocalIdentityProvider } from "@/studio/identity";
import { requestX402Payment, x402Capability } from "@/studio/payments";
import { buildAgentStudioPrecheck } from "@/studio/precheck";
import { AgentStudioRuntimeProvider, LocalRuntimeProvider, readRuntimeBook } from "@/studio/runtime";
import { resetCycleSequence, runKairosAgentCycle } from "@/studio/cycle";
import { createExternalAgentInterface, refuseExternalSign } from "@/studio/external";
import { resetRuntimeStore } from "@/studio/store";
import { tradingWallet, useOperatingCapitalForTrade, useTradingCapitalForOperatingExpense, walletsAreDistinct, emptyOperatingWallet } from "@/studio/wallets";
import { inspectedProbe } from "@/studio/view";

afterEach(() => {
  resetRuntimeStore();
  resetCycleSequence();
});

function paperResult(ran: boolean): AgentCycleResult {
  return {
    ran,
    reason: ran ? "Paper cycle." : "No intent.",
    events: [],
    view: null,
    createdIntentIds: ran ? ["intent_1"] : [],
    executionMode: ran ? "PAPER" : null,
    authorityCode: null,
    executionContextId: null,
    loopState: ran ? "MONITORING_POSITION" : "WAITING_FOR_RISK",
    transitions: [],
  };
}

function deps(runPaper: (userId: string, now: Date) => AgentCycleResult, extra: { marketAvailable?: boolean; liveRequested?: boolean; researchAvailable?: boolean; tradingWalletConnected?: boolean } = {}) {
  return {
    kairosAgentId: "agent_demo",
    userId: "user_a",
    dependencies: {
      marketAvailable: extra.marketAvailable ?? true,
      researchAvailable: extra.researchAvailable ?? true,
      externalIntelligence: "OK" as const,
      tradingWalletConnected: extra.tradingWalletConnected ?? false,
      liveRequested: extra.liveRequested ?? false,
      runPaper,
    },
  };
}

describe("agent studio runtime", () => {
  it("runs the same cycle from the local and studio providers", async () => {
    let calls = 0;
    const runPaper = () => {
      calls += 1;
      return paperResult(false);
    };
    const local = new LocalRuntimeProvider(deps(runPaper));
    local.start(1_000);
    const first = await local.runCycle(1_000);
    const studio = new AgentStudioRuntimeProvider({ ...deps(runPaper), userId: "user_a", studioProjectPresent: true, configurationValid: true });
    studio.start(2_000);
    const second = await studio.runCycle(2_000);
    expect(calls).toBe(2);
    expect(first.signed).toBe(false);
    expect(second.broadcast).toBe(false);
    expect(first.riskOverridden).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it("does not run a cycle before it is due", async () => {
    let calls = 0;
    const runtime = new LocalRuntimeProvider(deps(() => {
      calls += 1;
      return paperResult(false);
    }));
    runtime.start(0);
    runtime.scheduleCycle(5_000, 0);
    expect(await runtime.pump(4_999)).toBeNull();
    expect(calls).toBe(0);
    expect((await runtime.pump(5_000))?.cycleId).toBeTruthy();
    expect(calls).toBe(1);
  });

  it("backs off after a cycle failure and does not create a trade", async () => {
    let calls = 0;
    const runtime = new LocalRuntimeProvider(
      deps(() => {
        calls += 1;
        throw new Error("observation failed");
      }),
    );
    runtime.start(0);
    runtime.scheduleCycle(1_000, 0);
    const failed = await runtime.pump(1_000);
    expect(failed?.createdIntent).toBe(false);
    expect(failed?.error).toMatch(/observation failed/);
    expect(await runtime.pump(2_999)).toBeNull();
    expect((await runtime.pump(3_000))?.cycleId).not.toBe(failed?.cycleId);
    expect(calls).toBe(2);
  });

  it("keeps the last cycle when the runtime restarts", async () => {
    const runtime = new LocalRuntimeProvider(deps(() => paperResult(false)));
    runtime.start(0);
    const cycle = await runtime.runCycle(10);
    runtime.stop(20);
    expect(runtime.status()).toBe("PAUSED");
    runtime.start(50);
    expect(runtime.heartbeatView(50).uptimeMs).toBe(0);
    expect(readRuntimeBook(runtime, "agent_demo").lastCycle?.cycleId).toBe(cycle.cycleId);
  });

  it("blocks trading when market data is down and continues when research is down", async () => {
    let calls = 0;
    const blocked = await runKairosAgentCycle(
      { userId: "user_a", kairosAgentId: "agent_demo", marketAvailable: false, researchAvailable: true, externalIntelligence: "OK", tradingWalletConnected: false, liveRequested: false, runPaper: () => {
        calls += 1;
        return paperResult(true);
      } },
      10,
    );
    expect(calls).toBe(0);
    expect(blocked.createdIntent).toBe(false);
    expect(blocked.steps.find((step) => step.name === "OBSERVE")?.status).toBe("BLOCKED");
    const researchDown = await runKairosAgentCycle(
      { userId: "user_a", kairosAgentId: "agent_demo", marketAvailable: true, researchAvailable: false, externalIntelligence: "DEGRADED", tradingWalletConnected: false, liveRequested: false, runPaper: () => paperResult(false) },
      20,
    );
    expect(researchDown.steps.find((step) => step.name === "RESEARCH_CONTEXT")?.status).toBe("DEGRADED");
    expect(researchDown.steps.find((step) => step.name === "STRATEGY_EVALUATION")?.status).toBe("OK");
  });

  it("does not fall from a live request into paper and does not sign", async () => {
    let calls = 0;
    const report = await runKairosAgentCycle(
      {
        userId: "user_a",
        kairosAgentId: "agent_demo",
        marketAvailable: true,
        researchAvailable: true,
        externalIntelligence: "OK",
        tradingWalletConnected: false,
        liveRequested: true,
        runPaper: () => {
          calls += 1;
          return paperResult(true);
        },
      },
      30,
    );
    expect(calls).toBe(0);
    expect(report.createdIntent).toBe(false);
    expect(report.steps.find((step) => step.name === "EXECUTION")?.status).toBe("BLOCKED");
    expect(report.signed).toBe(false);
  });

  it("reports studio unavailable and invalid configuration without deploying", async () => {
    const missing = new AgentStudioRuntimeProvider({ ...deps(() => paperResult(true)), kairosAgentId: "agent_missing" });
    expect(missing.start(1)).toBe("OFFLINE");
    expect((await missing.runCycle(1)).createdIntent).toBe(false);
    const invalid = new AgentStudioRuntimeProvider({ ...deps(() => paperResult(true)), kairosAgentId: "agent_invalid", studioProjectPresent: true, configurationValid: false });
    expect(invalid.start(2)).toBe("ERROR");
    const book = readRuntimeBook(invalid, "agent_invalid");
    expect(book.events.some((event) => event.detail === "AGENT_STUDIO_CONFIGURATION_INVALID")).toBe(true);
    expect(book.events.some((event) => event.detail === "AGENT_STUDIO_PROJECT_NOT_FOUND")).toBe(false);
  });

  it("isolates cycles by user and keeps runtime events free of secrets", async () => {
    const runPaper = () => paperResult(false);
    const first = new LocalRuntimeProvider(deps(runPaper));
    const second = new LocalRuntimeProvider({ ...deps(runPaper), userId: "user_b" });
    first.start(1);
    second.start(1);
    await first.runCycle(2);
    await second.runCycle(3);
    const cycles = readRuntimeBook(first, "agent_demo").cycles;
    expect(cycles.filter((cycle) => cycle.userId === "user_a")).toHaveLength(1);
    expect(cycles.filter((cycle) => cycle.userId === "user_b")).toHaveLength(1);
    expect(JSON.stringify(readRuntimeBook(first, "agent_demo").events)).not.toMatch(/WALLET_PASSWORD|PRIVATE KEY|seed/i);
  });
});

describe("agent studio boundaries", () => {
  it("separates operating capital from trading capital", () => {
    const operating = emptyOperatingWallet();
    const trading = tradingWallet({ userId: "user_a", address: null, connectionStatus: "NOT_CONFIGURED" });
    expect(walletsAreDistinct(operating, trading)).toBe(true);
    expect(walletsAreDistinct({ ...operating, address: "0xabc" }, { ...trading, address: "0xABC" })).toBe(false);
    expect(useOperatingCapitalForTrade().ok).toBe(false);
    expect(useTradingCapitalForOperatingExpense().ok).toBe(false);
    expect(requestX402Payment()).toEqual({ ok: false, paid: false, reason: "X402_PAYMENT_NOT_AUTHORIZED" });
    expect(x402Capability().canSpend).toBe(false);
  });

  it("keeps identity unregistered until Studio returns a record", () => {
    expect(new LocalIdentityProvider().readIdentity().agentId).toBeNull();
    expect(new LocalIdentityProvider().readIdentity().registrationStatus).toBe("NOT_REGISTERED");
    const registered = new AgentStudioIdentityProvider({
      agentId: "8004-1",
      identityStandard: "ERC-8004",
      network: "bsc-testnet",
      registrationStatus: "REGISTERED",
      walletAddress: null,
      runtimeId: null,
      deploymentId: null,
    });
    expect(registered.readIdentity().identityStandard).toBe("ERC-8004");
  });

  it("denies signing, risk override, and private key access", () => {
    const manifest = kairosCapabilityManifest();
    expect(manifest.riskOverride).toBe(false);
    expect(manifest.privateKeyAccess).toBe(false);
    expect(manifest.walletSigning).toBe("delegated");
    expect(manifest.capabilities).not.toContain("SIGN_ANY_TRANSACTION");
    expect(overrideRisk().ok).toBe(false);
    expect(accessPrivateKey().ok).toBe(false);
    expect(refuseExternalSign().signed).toBe(false);
    const external = createExternalAgentInterface();
    expect(external.getApprovedTradeState("user_b").approved).toBe(false);
    expect(external.getMarketContext("user_b").tickers).toEqual([]);
  });

  it("selects one skill source and prefers the direct adapter", () => {
    const chosen = selectSkillSource([
      { id: "skill", transport: "SKILL", available: true },
      { id: "direct", transport: "DIRECT_API", available: true },
      { id: "plugin", transport: "PLUGIN", available: true },
    ]);
    expect(chosen.selected?.id).toBe("direct");
    expect(chosen.suppressed).toEqual(["skill", "plugin"]);
    expect(selectSkillSource([{ id: "missing", transport: "SKILL", available: false }]).selected).toBeNull();
  });

  it("reports the inspected CLI without calling the deployment ready", () => {
    const report = buildAgentStudioPrecheck(inspectedProbe());
    expect(report.lines.find((line) => line.label === "CLI")?.value).toBe("0.0.5");
    expect(report.lines.find((line) => line.label === "Identity")?.value).toBe("NOT REGISTERED");
    expect(report.lines.find((line) => line.label === "Operating wallet")?.value).toBe("NOT CREATED");
    expect(report.lines.find((line) => line.label === "Deployment")?.value).toBe("NOT READY");
    expect(buildAgentStudioPrecheck({ ...inspectedProbe(), cliInstalled: false, cliVersion: null }).lines[0]?.value).toBe("AGENT_STUDIO_CLI_NOT_INSTALLED");
  });

  it("keeps the runtime source off signing and deployment commands", () => {
    const source = readdirSync(join(process.cwd(), "studio"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(process.cwd(), "studio", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/x402 buy|erc8004 register|bag deploy|signTransaction|private key|market-order/);
    expect(source).not.toMatch(/from "@\/wallet\//);
  });
});
