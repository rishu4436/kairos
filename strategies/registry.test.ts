import { describe, expect, it } from "vitest";
import { createStrategyRegistry, listStrategyCatalog } from "@/strategies";
import { momentumStrategy } from "@/strategies/momentum";
import { StrategyRegistry } from "@/strategies/registry";
import type { IntelligenceStrategy } from "@/strategies/types";

describe("strategy registry", () => {
  it("registers the implemented strategies and looks them up", () => {
    const registry = createStrategyRegistry();
    expect(registry.list().map((strategy) => strategy.metadata.id)).toEqual([
      "momentum",
      "mean-reversion",
      "weekend",
      "dca",
    ]);
    expect(registry.get("momentum")?.metadata.name).toBe("Momentum");
    expect(registry.get("momentum")?.metadata.status).toBe("implemented");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("rejects duplicates and strategies that are not implemented", () => {
    const registry = new StrategyRegistry();
    registry.register(momentumStrategy);
    expect(() => registry.register(momentumStrategy)).toThrow(/already registered/);
    const preview: IntelligenceStrategy = {
      metadata: { ...momentumStrategy.metadata, id: "arbitrage", status: "coming_soon" },
      evaluate: (input) => momentumStrategy.evaluate(input),
    };
    expect(() => registry.register(preview)).toThrow(/cannot be registered/);
  });

  it("lists eligible strategies from asset support", () => {
    const registry = createStrategyRegistry();
    registry.register({
      metadata: { ...momentumStrategy.metadata, id: "aapl-only", supportedAssets: ["AAPL"] },
      evaluate: (input) => momentumStrategy.evaluate(input),
    });
    registry.register({
      metadata: { ...momentumStrategy.metadata, id: "momentum-off", enabled: false },
      evaluate: (input) => momentumStrategy.evaluate(input),
    });

    const eligible = registry.listEligible("NVDA").map((strategy) => strategy.metadata.id);
    expect(eligible).toContain("momentum");
    expect(eligible).toContain("weekend");
    expect(eligible).not.toContain("aapl-only");
    expect(eligible).not.toContain("momentum-off");
    expect(registry.listEligible("AAPL").map((strategy) => strategy.metadata.id)).toContain("aapl-only");
  });

  it("keeps coming-soon strategies out of the executable registry", () => {
    const registry = createStrategyRegistry();
    const catalog = listStrategyCatalog(registry);
    const arbitrage = catalog.find((strategy) => strategy.id === "arbitrage");
    expect(arbitrage?.status).toBe("coming_soon");
    expect(arbitrage?.name).toBe("Cross-representation arbitrage");
    expect(registry.get("arbitrage")).toBeUndefined();
    expect(catalog.filter((strategy) => strategy.status === "implemented")).toHaveLength(4);
    expect(catalog.map((strategy) => strategy.id)).toEqual(
      expect.arrayContaining(["earnings", "event", "volatility", "relative-value", "rebalancing", "correlation", "agent-generated"]),
    );
  });
});
