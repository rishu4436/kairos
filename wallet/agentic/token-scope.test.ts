import { describe, expect, it } from "vitest";
import { assessWalletPolicy } from "@/wallet/agentic/policy";
import { runAgenticWalletPreflight } from "@/wallet/agentic/preflight";
import { admitOperatorTokenPair, readOperatorTokenScope } from "@/wallet/agentic/token-scope";
import { DEMO_USER_ID } from "@/domain/watchlist";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const TSLAB = "0x5b1910eaad6450e50f816082aa078c41f10c292f";
const OTHER = "0x1111111111111111111111111111111111111111";

const scope = {
  chainId: "56" as const,
  contracts: [USDT.toLowerCase(), TSLAB.toLowerCase()],
  provenance: "OPERATOR_ATTESTED" as const,
};

describe("operator-attested token scope", () => {
  it("admits configured USDT and TSLAB and blocks an unlisted contract", () => {
    expect(readOperatorTokenScope({ KAIROS_AGENTIC_ALLOWED_TOKENS: `56:${USDT},56:${TSLAB}` })).toEqual(scope);
    expect(readOperatorTokenScope({ KAIROS_AGENTIC_ALLOWED_TOKENS: "TSLA" })).toBeNull();
    expect(admitOperatorTokenPair({ chainId: "56", tokens: [USDT, TSLAB], scope })).toBe("OPERATOR_ATTESTED");
    expect(admitOperatorTokenPair({ chainId: "56", tokens: [USDT], scope })).toBe("OPERATOR_ATTESTED");
    expect(admitOperatorTokenPair({ chainId: "56", tokens: [TSLAB], scope })).toBe("OPERATOR_ATTESTED");
    expect(admitOperatorTokenPair({ chainId: "56", tokens: [USDT, OTHER], scope })).toBe("TOKEN_NOT_ALLOWED");
    expect(admitOperatorTokenPair({ chainId: "56", tokens: [USDT, TSLAB], scope: null })).toBe("TOKEN_SCOPE_UNVERIFIED");
    expect(admitOperatorTokenPair({ chainId: "56", tokens: ["TSLAB"], scope })).toBe("TOKEN_SCOPE_UNVERIFIED");
  });

  it("requires tradeAllTokens false, quota, and operator-attested contracts before wallet admission", () => {
    const policy = {
      dailyLimit: 50000,
      quotaUsed: 0,
      quotaLeft: 50000,
      quotaDate: "2026-10-07",
      tradeAllTokens: false,
      highRiskHandling: "NeedConfirmation" as const,
    };
    expect(
      assessWalletPolicy({ notionalUsd: 1, policy, chainId: "56", tokens: [USDT, TSLAB], operatorScope: scope }).reason,
    ).toBe("REQUIRES APP CONFIRMATION");
    expect(
      assessWalletPolicy({
        notionalUsd: 1,
        policy: { ...policy, tradeAllTokens: true },
        chainId: "56",
        tokens: [USDT, TSLAB],
        operatorScope: scope,
      }).reason,
    ).toBe("TOKEN_SCOPE_UNVERIFIED");
    expect(assessWalletPolicy({ notionalUsd: 1, policy, chainId: "56", tokens: [USDT, OTHER], operatorScope: scope }).reason).toBe(
      "TOKEN_NOT_ALLOWED",
    );
    expect(assessWalletPolicy({ notionalUsd: 1, policy, chainId: "56", tokens: [USDT, TSLAB], operatorScope: null }).reason).toBe(
      "TOKEN_SCOPE_UNVERIFIED",
    );
  });

  it("preflights the operator-attested pair without claiming CLI proof", () => {
    const tooling = {
      nodeVersion: "v24.18.0",
      cliVersion: "1.10.0",
      requiredCliVersion: "1.10.0",
      installedSkillVersion: "1.12.0",
      latestSkillVersion: "1.12.0",
      cliCompatible: true,
    };
    const base = {
      userId: DEMO_USER_ID,
      expectedUserId: DEMO_USER_ID,
      agentId: "agent_demo",
      expectedAgentId: "agent_demo",
      connectionStatus: "CONNECTED" as const,
      bscSupported: true,
      walletAddress: "0xc44edDcFfA4227d38bc92a7cA5990953AA7Ff0cF",
      policy: {
        dailyLimit: 50000,
        quotaUsed: 0,
        quotaLeft: 50000,
        quotaDate: "2026-10-07",
        tradeAllTokens: false,
        highRiskHandling: "NeedConfirmation" as const,
      },
      tokenAllowed: false,
      tokenTradable: true,
      tooling,
      operatorScope: scope,
    };
    const admitted = runAgenticWalletPreflight({
      ...base,
      swapTokens: { chainId: "56", from: USDT, to: TSLAB },
    });
    expect(admitted.result).toBe("PASS");
    expect(admitted.reasons).toEqual([]);
    const blocked = runAgenticWalletPreflight({
      ...base,
      swapTokens: { chainId: "56", from: USDT, to: OTHER },
    });
    expect(blocked.reasons).toContain("TOKEN_NOT_ALLOWED");
    const unverified = runAgenticWalletPreflight({
      ...base,
      operatorScope: null,
      swapTokens: { chainId: "56", from: USDT, to: TSLAB },
    });
    expect(unverified.reasons).toContain("TOKEN_SCOPE_UNVERIFIED");
  });
});
