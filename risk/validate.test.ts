import { describe, expect, it } from "vitest";
import { asUserId } from "@/domain/ids";
import { validateIntentShape } from "@/domain/intent";
import { parseDecimal } from "@/domain/money";
import { validateRiskPolicy } from "@/risk/validate";
import { accountState, ids, intent, lossTrade, policy } from "@/test/fixtures";

describe("trade intent shape", () => {
  it("accepts a complete paper intent", () => {
    expect(validateIntentShape(intent()).ok).toBe(true);
  });

  it("rejects non-positive size, a missing asset, and an impossible confidence", () => {
    expect(validateIntentShape(intent({ quantity: 0n })).errors).toContain("Quantity must be positive.");
    expect(validateIntentShape(intent({ assetSymbol: " " })).errors).toContain("Asset is required.");
    expect(validateIntentShape(intent({ confidence: 1.4 })).ok).toBe(false);
    expect(validateIntentShape(intent({ slippageBps: 10_001 })).ok).toBe(false);
  });
});

describe("risk policy", () => {
  it("accepts a paper order inside the user limits", () => {
    expect(validateRiskPolicy(intent(), policy(), accountState()).ok).toBe(true);
  });

  it("rejects an oversized order even when confidence is high", () => {
    const decision = validateRiskPolicy(
      intent({ quantity: parseDecimal("30"), confidence: 0.99 }),
      policy(),
      accountState(),
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violations.map((item) => item.code)).toContain("position_limit");
    }
  });

  it("rejects assets, slippage, allocation, and a disabled live switch", () => {
    const state = accountState();
    const rules = policy();

    const asset = validateRiskPolicy(intent({ assetSymbol: "TSLA" }), rules, state);
    const slippage = validateRiskPolicy(intent({ slippageBps: 80 }), rules, state);
    const allocation = validateRiskPolicy(
      intent({ quantity: parseDecimal("20") }),
      policy({ maxAllocationBps: 1000 }),
      state,
    );
    const live = validateRiskPolicy(intent({ venue: "live" }), rules, state);

    expect(codes(asset)).toContain("asset_not_allowed");
    expect(codes(slippage)).toContain("slippage_limit");
    expect(codes(allocation)).toContain("allocation_limit");
    expect(codes(live)).toContain("live_trading_disabled");
  });

  it("blocks a new buy once the daily loss limit is reached and still allows a sell", () => {
    const state = accountState({
      trades: [lossTrade(parseDecimal("-500"), "2026-10-02T18:00:00.000Z")],
    });
    const buy = validateRiskPolicy(intent(), policy(), state);
    const sell = validateRiskPolicy(intent({ side: "sell" }), policy(), state);
    expect(codes(buy)).toContain("daily_loss_limit");
    expect(sell.ok).toBe(true);
  });

  it("rejects an intent for a different user", () => {
    const decision = validateRiskPolicy(intent({ userId: asUserId("user_b") }), policy(), accountState());
    expect(codes(decision)).toContain("user_mismatch");
  });

  it("rejects paper orders when the user has disabled paper trading", () => {
    const decision = validateRiskPolicy(intent(), policy({ paperTradingEnabled: false }), accountState());
    expect(codes(decision)).toContain("paper_trading_disabled");
  });

  it("applies entry caps to INCREASE_RISK and not to REDUCE_RISK", () => {
    const state = accountState({
      trades: [lossTrade(parseDecimal("-500"), "2026-10-02T18:00:00.000Z")],
      positions: [
        {
          id: "pos_nvda",
          accountId: ids.accountId,
          userId: ids.userId,
          assetSymbol: "NVDA",
          quantity: parseDecimal("20"),
          entryPrice: parseDecimal("100"),
          currentPrice: parseDecimal("100"),
          strategyId: "momentum",
        },
      ],
    });
    const sell = intent({ side: "sell", quantity: parseDecimal("20") });
    const increase = validateRiskPolicy(sell, policy(), state, "INCREASE_RISK");
    const reduce = validateRiskPolicy(sell, policy(), state, "REDUCE_RISK");
    expect(codes(increase)).toContain("daily_loss_limit");
    expect(codes(increase)).toContain("position_limit");
    expect(reduce.ok).toBe(true);
    const close = validateRiskPolicy(sell, policy(), state, "CLOSE_RISK");
    expect(close.ok).toBe(true);
    const buyClose = validateRiskPolicy(intent({ side: "buy" }), policy(), accountState(), "CLOSE_RISK");
    const buyReduce = validateRiskPolicy(intent({ side: "buy" }), policy(), accountState(), "REDUCE_RISK");
    expect(codes(buyClose)).toContain("exposure_increase");
    expect(codes(buyReduce)).toContain("exposure_increase");
    expect(codes(validateRiskPolicy(intent({ quantity: parseDecimal("30") }), policy(), accountState(), "INCREASE_RISK"))).toContain(
      "position_limit",
    );
  });
});

function codes(decision: ReturnType<typeof validateRiskPolicy>): string[] {
  return decision.ok ? [] : decision.violations.map((item) => item.code);
}
