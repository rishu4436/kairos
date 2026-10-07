import { describe, expect, it } from "vitest";
import { assertProductionChain, KAIROS_TRADING_NETWORK, PRODUCTION_CHAIN_ID } from "@/domain/network";

describe("production trading network", () => {
  it("is BSC mainnet chain 56 and fails closed on the wrong chain", () => {
    expect(KAIROS_TRADING_NETWORK.chainId).toBe("56");
    expect(PRODUCTION_CHAIN_ID).toBe("56");
    expect(assertProductionChain("56")).toBeNull();
    expect(assertProductionChain("97")).toBe("WRONG_CHAIN");
    expect(assertProductionChain("")).toBe("CHAIN_REQUIRED");
  });
});
