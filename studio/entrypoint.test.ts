import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AgentCycleResult } from "@/paper/cycle";
import { InMemoryKairosStateStore } from "@/runtime/store";
import { LocalRuntimeProvider } from "@/studio/runtime";
import { emptyOperatingWallet, tradingWallet, useOperatingCapitalForTrade } from "@/studio/wallets";
import { runStudioKairosCycle, trustedStudioMode } from "@/studio/entrypoint";

const idle = (): AgentCycleResult => ({
  ran: true,
  reason: "paper",
  events: [],
  view: null,
  createdIntentIds: [],
  executionMode: "PAPER",
  authorityCode: null,
  executionContextId: null,
  loopState: "MONITORING_POSITION",
  transitions: [],
});

describe("studio paper entrypoint", () => {
  it("calls the canonical cycle in PAPER and ignores a LIVE payload", async () => {
    expect(trustedStudioMode(undefined, "LIVE")).toBe("PAPER");
    expect(trustedStudioMode("LIVE_PREVIEW", "LIVE")).toBe("LIVE_PREVIEW");
    const store = new InMemoryKairosStateStore();
    let calls = 0;
    const paper = await runStudioKairosCycle({
      userId: "user_studio",
      agentId: "agent_studio",
      nowMs: 1_700_000_000_000,
      requestedMode: "LIVE",
      store,
      runPaper: () => {
        calls += 1;
        return idle();
      },
    });
    expect(paper.executionMode).toBe("PAPER");
    expect(calls).toBe(1);
    expect(paper.signed).toBe(false);
    expect(paper.broadcast).toBe(false);
    expect(paper.operatingWallet.role).toBe("OPERATING");
    expect(paper.tradingWallet.role).toBe("TRADING");
    expect(paper.operatingCapitalUsedForTrade).toBe(false);
    expect(useOperatingCapitalForTrade().ok).toBe(false);

    let previewCalls = 0;
    const preview = await runStudioKairosCycle({
      userId: "user_studio",
      agentId: "agent_studio_preview",
      nowMs: 1_700_000_100_000,
      serverMode: "LIVE_PREVIEW",
      requestedMode: "LIVE",
      store,
      runPaper: () => {
        previewCalls += 1;
        return idle();
      },
    });
    expect(preview.executionMode).toBe("LIVE_PREVIEW");
    expect(previewCalls).toBe(0);
    expect(preview.signed).toBe(false);
    expect(preview.broadcast).toBe(false);
  });

  it("refuses an operating wallet that matches the trading wallet and does not retry a failed paper call", async () => {
    const operating = { ...emptyOperatingWallet(), address: "0xabc", configured: true };
    const trading = tradingWallet({ userId: "user_studio", address: "0xABC", connectionStatus: "CONNECTED" });
    await expect(runStudioKairosCycle({
      userId: "user_studio",
      agentId: "agent_alias",
      nowMs: 1_700_000_200_000,
      operatingWallet: operating,
      tradingWallet: trading,
      store: new InMemoryKairosStateStore(),
    })).rejects.toThrow(/OPERATING_WALLET_ALIASED_TO_TRADING_WALLET/);

    const store = new InMemoryKairosStateStore();
    let calls = 0;
    const failed = await runStudioKairosCycle({
      userId: "user_studio",
      agentId: "agent_fail",
      nowMs: 1_700_000_300_000,
      store,
      runPaper: () => {
        calls += 1;
        throw new Error("paper failed once");
      },
    });
    expect(calls).toBe(1);
    expect(failed.cycleStatus).toBe("FAILED");
    expect(failed.signed).toBe(false);
    expect(failed.broadcast).toBe(false);
  });

  it("keeps the local runtime provider and does not sign from the studio source", () => {
    const local = new LocalRuntimeProvider({
      userId: "user_a",
      kairosAgentId: "agent_demo",
      dependencies: {
        marketAvailable: true,
        researchAvailable: false,
        externalIntelligence: "OK",
        tradingWalletConnected: false,
        liveRequested: false,
        runPaper: () => idle(),
      },
    });
    expect(local.start(1)).toBe("RUNNING");
    const source = readFileSync(new URL("./entrypoint.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.sign\(|broadcast\(/);
    expect(source).toMatch(/runKairosAutonomousCycle/);
  });
});
