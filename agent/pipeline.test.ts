import { describe, expect, it } from "vitest";
import { runDecisionPipeline } from "@/agent/pipeline";
import { asUserId } from "@/domain/ids";
import { parseDecimal } from "@/domain/money";
import { accountState, intent, policy, quote, wallet } from "@/test/fixtures";

describe("decision pipeline", () => {
  it("stops a violating order at risk, before a plan exists", () => {
    const state = accountState();
    const result = runDecisionPipeline({
      proposal: intent({ quantity: parseDecimal("40"), confidence: 0.99 }),
      policy: policy(),
      account: wallet(),
      state,
      quote: quote(),
    });

    expect(result.stage).toBe("risk_rejected");
    expect(result.plan).toBeNull();
    expect(result.simulation).toBeNull();
    expect(result.submittedToChain).toBe(false);
    expect(state.cash).toBe(parseDecimal("10000"));
    expect(result.violations.some((item) => item.code === "position_limit")).toBe(true);
  });

  it("does not let a malformed intent reach risk execution", () => {
    const result = runDecisionPipeline({
      proposal: intent({ quantity: 0n }),
      policy: policy(),
      account: wallet(),
      state: accountState(),
      quote: quote(),
    });
    expect(result.stage).toBe("intent_invalid");
    expect(result.submittedToChain).toBe(false);
  });

  it("prepares a paper plan without applying a fill or signing", () => {
    const result = runDecisionPipeline({
      proposal: intent(),
      policy: policy(),
      account: wallet(),
      state: accountState(),
      quote: quote(),
    });
    expect(result.stage).toBe("paper_ready");
    expect(result.execution?.status).toBe("not_submitted");
    expect(result.execution?.chainTransactionId).toBeNull();
    expect(result.simulation?.broadcast).toBe(false);
    expect(result.authorization?.granted).toBe(true);
    expect(result.authorization?.signature).toBeNull();
    expect(result.submittedToChain).toBe(false);
  });

  it("blocks live venue even when the user switch is on", () => {
    const result = runDecisionPipeline({
      proposal: intent({ venue: "live" }),
      policy: policy({ liveTradingEnabled: true }),
      account: wallet(),
      state: accountState(),
      quote: quote(),
    });
    expect(result.stage).toBe("blocked_chain_not_implemented");
    expect(result.submittedToChain).toBe(false);
    expect(result.simulation?.broadcast).toBe(false);
    expect(result.authorization?.signature).toBeNull();
    expect(result.execution?.chainTransactionId).toBeNull();
  });

  it("rejects a live order at the policy when live trading is disabled", () => {
    const result = runDecisionPipeline({
      proposal: intent({ venue: "live" }),
      policy: policy(),
      account: wallet(),
      state: accountState(),
      quote: quote(),
    });
    expect(result.stage).toBe("risk_rejected");
    expect(result.plan).toBeNull();
  });

  it("returns no trade when the proposer declines", () => {
    const result = runDecisionPipeline({
      proposal: null,
      policy: policy(),
      account: wallet(),
      state: accountState(),
      quote: null,
    });
    expect(result.stage).toBe("no_trade");
    expect(result.submittedToChain).toBe(false);
  });

  it("does not authorize another user's account", () => {
    const result = runDecisionPipeline({
      proposal: intent({ userId: asUserId("user_b") }),
      policy: policy(),
      account: wallet(),
      state: accountState(),
      quote: quote(),
    });
    expect(result.stage).toBe("risk_rejected");
    expect(result.authorization).toBeNull();
  });
});
