import type { OperatorConfig } from "@/operator/config";

/** Normal operator runs never select paper. Paper remains a research-only caller choice. */
export function operatorExecutionMode(config: OperatorConfig): "LIVE_PREVIEW" | "LIVE" {
  if (config.runtime.executionMode === "LIVE" && config.risk.liveTradingEnabled === true) {
    return "LIVE";
  }
  return "LIVE_PREVIEW";
}
