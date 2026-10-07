import type { AgentCycleResult } from "@/paper/cycle";
import { runKairosAutonomousCycle } from "@/runtime/cycle";
import type { KairosStateStore } from "@/runtime/store";
import type { AutonomousExecutionMode } from "@/runtime/types";
import { clampStudioExecutionMode } from "@/studio/deployment";
import { emptyOperatingWallet, tradingWallet, walletsAreDistinct } from "@/studio/wallets";
import type { OperatingWallet, TradingWalletRef } from "@/studio/types";

export interface StudioInvocation {
  userId: string;
  agentId: string;
  nowMs: number;
  /** Untrusted request text. It cannot select LIVE or LIVE_PREVIEW. */
  requestedMode?: string | null;
  /** Explicit server setting. Anything other than LIVE_PREVIEW stays PAPER. */
  serverMode?: "PAPER" | "LIVE_PREVIEW";
  marketAvailable?: boolean;
  researchAvailable?: boolean;
  runPaper?: (userId: string, now: Date) => AgentCycleResult;
  store?: KairosStateStore;
  operatingWallet?: OperatingWallet;
  tradingWallet?: TradingWalletRef;
}

/** Server mode wins. A caller-supplied mode string is ignored. */
export function trustedStudioMode(serverMode: "PAPER" | "LIVE_PREVIEW" | undefined, requestedMode: string | null | undefined): "PAPER" | "LIVE_PREVIEW" {
  void requestedMode;
  const server: AutonomousExecutionMode = serverMode === "LIVE_PREVIEW" ? "LIVE_PREVIEW" : "PAPER";
  return clampStudioExecutionMode(server);
}

export async function runStudioKairosCycle(input: StudioInvocation): Promise<{
  executionMode: "PAPER" | "LIVE_PREVIEW";
  signed: false;
  broadcast: false;
  operatingWallet: OperatingWallet;
  tradingWallet: TradingWalletRef;
  operatingCapitalUsedForTrade: false;
  cycleStatus: string;
  cycleId: string;
}> {
  const executionMode = trustedStudioMode(input.serverMode, input.requestedMode);
  const operating = input.operatingWallet ?? emptyOperatingWallet();
  const trading = input.tradingWallet ?? tradingWallet({ userId: input.userId, address: null, connectionStatus: "UNCONNECTED" });
  if (!walletsAreDistinct(operating, trading)) {
    throw new Error("OPERATING_WALLET_ALIASED_TO_TRADING_WALLET");
  }
  const cycle = await runKairosAutonomousCycle({
    userId: input.userId,
    agentId: input.agentId,
    runtimeMode: "AGENT_STUDIO",
    executionMode,
    cycleTrigger: "AGENT_STUDIO",
    startedAtMs: input.nowMs,
    ownerId: `studio:${input.userId}:${input.agentId}:${input.nowMs}`,
    marketAvailable: input.marketAvailable ?? true,
    researchAvailable: input.researchAvailable ?? false,
    runPaper: executionMode === "PAPER" ? input.runPaper : undefined,
    store: input.store,
  });
  return {
    executionMode,
    signed: false,
    broadcast: false,
    operatingWallet: operating,
    tradingWallet: trading,
    operatingCapitalUsedForTrade: false,
    cycleStatus: cycle.status,
    cycleId: cycle.cycleId,
  };
}
