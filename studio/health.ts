import type { RuntimeHealthReport } from "@/studio/types";

export function buildRuntimeHealth(input: {
  processUp: boolean;
  studioProjectPresent: boolean;
  market: "PAPER_SAMPLE" | "LIVE_OK" | "UNAVAILABLE";
  researchLabel: string;
  strategiesReady: boolean;
  executionPrepared: boolean;
  tradingWalletConnected: boolean;
}): RuntimeHealthReport {
  const checks: RuntimeHealthReport["checks"] = [
    {
      id: "agent-studio",
      label: "Agent Studio",
      status: input.studioProjectPresent ? "DEGRADED" : "UNAVAILABLE",
      detail: input.studioProjectPresent ? "A studio project exists. It has not been deployed from KAIROS." : "No studio.toml project. The bag CLI may still be installed.",
    },
    {
      id: "process",
      label: "KAIROS process",
      status: input.processUp ? "HEALTHY" : "UNAVAILABLE",
      detail: input.processUp ? "The process is up. Overall health still requires the other checks." : "The process is not running.",
    },
    {
      id: "market",
      label: "Market data",
      status: input.market === "LIVE_OK" ? "HEALTHY" : input.market === "PAPER_SAMPLE" ? "DEGRADED" : "UNAVAILABLE",
      detail: input.market === "LIVE_OK" ? "Live market data is connected." : input.market === "PAPER_SAMPLE" ? "Paper sample. Binance was not called." : "Market data is unavailable. Trading decisions are blocked.",
    },
    {
      id: "research",
      label: "Research",
      status: input.researchLabel === "CONNECTED" ? "HEALTHY" : "UNAVAILABLE",
      detail: input.researchLabel,
    },
    {
      id: "strategies",
      label: "Strategy engine",
      status: input.strategiesReady ? "HEALTHY" : "UNAVAILABLE",
      detail: input.strategiesReady ? "The deterministic catalog is loaded." : "The strategy catalog is unavailable.",
    },
    {
      id: "execution",
      label: "Execution preparation",
      status: input.executionPrepared && input.tradingWalletConnected ? "DEGRADED" : "BLOCKED",
      detail: input.tradingWalletConnected ? "Trading wallet is connected. The runtime still does not sign." : "Wallet not connected.",
    },
  ];
  const blocked = !input.processUp || input.market === "UNAVAILABLE" || !input.strategiesReady;
  const overall = !input.processUp ? "OFFLINE" : blocked || !input.tradingWalletConnected || !input.studioProjectPresent || input.researchLabel !== "CONNECTED" ? "DEGRADED" : "HEALTHY";
  return { overall, checks };
}
