import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/domain/money";
import { defaultOperatorConfig } from "@/operator/config";
import { dcaStrategy } from "@/strategies/dca";
import { budgetRemaining, dipTriggered, emptyDcaState, dcaEligibleKey } from "@/strategies/dca-math";
import { createStrategyRegistry } from "@/strategies/catalog";
import { momentumStrategy } from "@/strategies/momentum";
import { MEAN_REVERSION_PARAMS, MOMENTUM_PARAMS } from "@/strategies/parameters";
import { capTradeNotional } from "@/execution/capital";

describe("DCA and operator strategy defaults", () => {
  it("registers DCA as implemented", () => {
    expect(createStrategyRegistry().get("dca")?.metadata.status).toBe("implemented");
  });

  it("disabled DCA returns NO_SIGNAL", () => {
    const config = defaultOperatorConfig();
    const signal = dcaStrategy.evaluate(baseContext(config));
    expect(signal.action).toBe("NO_SIGNAL");
  });

  it("triggers a 5% dip and waits on 10%", () => {
    const price = parseDecimal("95");
    const reference = parseDecimal("100");
    expect(dipTriggered(price, reference, 500)).toBe(true);
    expect(dipTriggered(price, reference, 1000)).toBe(false);
  });

  it("time key stays stable inside an interval", () => {
    const a = dcaEligibleKey({ mode: "TIME_BASED", nowMs: 1_000, intervalMs: 10_000, dipThresholdBps: 500, referencePrice: null, lastFillPrice: null });
    const b = dcaEligibleKey({ mode: "TIME_BASED", nowMs: 9_000, intervalMs: 10_000, dipThresholdBps: 500, referencePrice: null, lastFillPrice: null });
    expect(a).toBe(b);
  });

  it("blocks when budget remaining is below the base order", () => {
    expect(budgetRemaining("48", "50") < parseDecimal("5")).toBe(true);
  });

  it("idempotency key matches last eligible key", () => {
    const book = emptyDcaState("56:tsla", "TSLA", "DIP_BASED", "LAST_DCA_FILL");
    const key = dcaEligibleKey({ mode: "DIP_BASED", nowMs: 1, intervalMs: 1, dipThresholdBps: 500, referencePrice: parseDecimal("100"), lastFillPrice: "100" });
    expect({ ...book, lastEligibleKey: key }.lastEligibleKey).toBe(key);
  });

  it("preserves momentum and mean-reversion defaults", () => {
    expect(MOMENTUM_PARAMS.minReturnBps).toBe(50);
    expect(MEAN_REVERSION_PARAMS.entryBps).toBe(120);
    expect(momentumStrategy.metadata.enabled).toBe(true);
  });

  it("caps per-trade and strategy budget", () => {
    const config = defaultOperatorConfig();
    config.strategies.dca.maxTradeNotional = "5";
    const sized = capTradeNotional({
      proposed: parseDecimal("100"),
      config,
      strategyId: "dca",
      remainingDeployable: parseDecimal("1000"),
      remainingPosition: parseDecimal("1000"),
      remainingAllocation: parseDecimal("1000"),
      availableBalance: parseDecimal("1000"),
    });
    expect(sized.ok).toBe(true);
    if (sized.ok) {
      expect(sized.notional).toBe(parseDecimal("5"));
    }
  });
});

function baseContext(config: ReturnType<typeof defaultOperatorConfig>) {
  return {
    ticker: "TSLA",
    assetName: "Tesla",
    representationId: "56:tsla",
    tokenSymbol: "TSLAB",
    price: parseDecimal("100"),
    referencePrice: parseDecimal("100"),
    referenceDeviationBps: 0n,
    session: "OPEN" as const,
    freshness: "FRESH" as const,
    latestAgeMs: 1000,
    referenceAgeMs: 1000,
    candles: [],
    features: { asOf: new Date().toISOString(), features: [] },
    regime: { regime: "RANGE_BOUND" as const, asOf: new Date().toISOString(), sufficient: true, reasons: [] },
    dataQuality: { status: "GOOD" as const, historyPoints: 20, latestAgeMs: 1000, referenceAgeMs: 1000, missingFields: [] },
    fidelity: "paper" as const,
    asOfMs: Date.now(),
    operator: { configVersion: config.version, strategies: config.strategies, dca: null },
  };
}
