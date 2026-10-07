import { describe, expect, it } from "vitest";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { DEMO_USER_ID } from "@/domain/watchlist";

const statusEnabled = process.env.KAIROS_AGENTIC_WALLET_LIVE === "1";
const executeEnabled = statusEnabled && process.env.KAIROS_AGENTIC_WALLET_EXECUTE === "1";

describe.skipIf(!statusEnabled)("agentic wallet status harness", () => {
  it("reads status, address, balance, and settings without swapping", async () => {
    const gateway = new CliAgenticWalletGateway();
    const account = await gateway.getStatus(DEMO_USER_ID, "agent_demo");
    expect(["UNCONNECTED", "CREATING", "CONNECTED"]).toContain(account.connectionStatus);
    if (account.connectionStatus === "CONNECTED") {
      const balances = await gateway.getBalances(DEMO_USER_ID, "56");
      expect(Array.isArray(balances)).toBe(true);
    }
  }, 20_000);
});

describe.skipIf(!executeEnabled)("agentic wallet execution harness", () => {
  it("is present only when execution is explicitly enabled", () => {
    expect(process.env.KAIROS_AGENTIC_WALLET_EXECUTE).toBe("1");
  });
});
