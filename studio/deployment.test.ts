import { describe, expect, it } from "vitest";
import { walletsAreDistinct, emptyOperatingWallet, tradingWallet, useOperatingCapitalForTrade, useTradingCapitalForOperatingExpense } from "@/studio/wallets";
import { clampStudioExecutionMode, currentDeployment, deploymentStatus, normalizeIdentity, STUDIO_COMPATIBILITY } from "@/studio/deployment";
import { collectReadiness } from "@/runtime/readiness";

describe("agent studio deployment boundary", () => {
  it("keeps an incompatible CLI blocked and identity unregistered", () => {
    expect(STUDIO_COMPATIBILITY).toBe("UPDATE_REQUIRED");
    expect(currentDeployment()).toBe("DEPLOYMENT_BLOCKED");
    expect(deploymentStatus({ cliCompatible: false, configValid: true, deployed: true })).toBe("DEPLOYMENT_BLOCKED");
    expect(deploymentStatus({ cliCompatible: true, configValid: false, deployed: false })).toBe("DEPLOYMENT_BLOCKED");
    expect(deploymentStatus({ cliCompatible: true, configValid: true, deployed: false })).toBe("NOT_DEPLOYED");
    expect(normalizeIdentity(null).registrationStatus).toBe("NOT_REGISTERED");
    expect(normalizeIdentity({ registrationStatus: "REGISTERED", agentId: "agent_1", network: "bsc", walletAddress: "0xabc" }).tradingAuthorized).toBe(false);
  });

  it("cannot turn paper into live or alias the wallets", () => {
    expect(clampStudioExecutionMode("PAPER")).toBe("PAPER");
    expect(clampStudioExecutionMode("LIVE")).toBe("LIVE_PREVIEW");
    expect(clampStudioExecutionMode("LIVE_PREVIEW")).toBe("LIVE_PREVIEW");
    const operating = { ...emptyOperatingWallet(), address: "0xabc", configured: true };
    const trading = tradingWallet({ userId: "user_a", address: "0xABC", connectionStatus: "CONNECTED" });
    expect(walletsAreDistinct(operating, trading)).toBe(false);
    expect(walletsAreDistinct(operating, tradingWallet({ userId: "user_a", address: "0xdef", connectionStatus: "UNCONNECTED" }))).toBe(true);
    expect(useOperatingCapitalForTrade().ok).toBe(false);
    expect(useTradingCapitalForOperatingExpense().ok).toBe(false);
  });

  it("keeps missing providers unconfigured", () => {
    const ready = collectReadiness({ NODE_ENV: "test" });
    expect(ready.binanceWeb3).toBe("NOT_CONFIGURED");
    expect(ready.qwen).toBe("NOT_CONFIGURED");
    expect(ready.fmp).toBe("NOT_CONFIGURED");
    expect(ready.stateBackend).toBe("MEMORY_EPHEMERAL");
    expect(ready.liveExecution).toBe("BLOCKED");
    expect(ready.agenticWallet).toBe("BLOCKED");
    expect(ready.productionDurable).toBe(false);
    expect(collectReadiness({ NODE_ENV: "test", KAIROS_STATE_BACKEND: "redis" }).stateBackend).toBe("NOT_CONFIGURED");
  });
});
