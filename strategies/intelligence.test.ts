import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessDataQuality } from "@/domain/quality";
import { hasDirectionalAction, parseSignal, serializeSignal } from "@/domain/signal";
import { candlesFromCloses } from "@/domain/test-candles";
import { buildStrategyContext, type StrategyContext } from "@/strategies/context";
import { meanReversionStrategy } from "@/strategies/mean-reversion";
import { momentumStrategy } from "@/strategies/momentum";
import { weekendStrategy } from "@/strategies/weekend";

const AT = Date.parse("2026-10-03T12:00:00.000Z");

function context(overrides: Partial<Parameters<typeof buildStrategyContext>[0]> = {}): StrategyContext {
  return buildStrategyContext({
    ticker: "NVDA",
    assetName: "NVIDIA",
    representationId: "rep-nvda",
    tokenSymbol: "NVDAB",
    price: "100.60",
    referencePrice: "100",
    session: "OPEN",
    freshness: "FRESH",
    latestAgeMs: 4000,
    candles: candlesFromCloses(["100"]),
    fidelity: "live",
    asOfMs: AT,
    requiredPoints: 21,
    ...overrides,
  });
}

function climb(): string[] {
  const closes = Array.from({ length: 21 }, () => "100.00");
  closes[17] = "100.15";
  closes[18] = "100.30";
  closes[19] = "100.45";
  closes[20] = "100.60";
  return closes;
}

describe("momentum", () => {
  it("buys a confirmed positive 1h return", () => {
    const signal = momentumStrategy.evaluate(context({ candles: candlesFromCloses(climb()), price: "100.60" }));
    expect(signal.evaluation).toBe("SIGNAL");
    expect(signal.action).toBe("BUY");
    expect(signal.executable).toBe(false);
    expect(signal.evidence.join(" ")).toMatch(/1h return/);
    expect(signal.confidence).toBeGreaterThan(0.5);
  });

  it("does not turn a short history into a hold", () => {
    const signal = momentumStrategy.evaluate(context({ candles: candlesFromCloses(["100", "101", "102"]) }));
    expect(signal.evaluation).toBe("INSUFFICIENT_DATA");
    expect(signal.action).toBe("NO_SIGNAL");
    expect(hasDirectionalAction(signal)).toBe(false);
  });

  it("rejects a stale observation", () => {
    const signal = momentumStrategy.evaluate(
      context({ freshness: "STALE", latestAgeMs: 400_000, candles: candlesFromCloses(climb()) }),
    );
    expect(signal.evaluation).toBe("STALE_DATA");
    expect(signal.action).toBe("NO_SIGNAL");
    expect(signal.confidence).toBe(0);
    expect(signal.dataQuality.status).toBe("STALE");
  });
});

describe("mean reversion", () => {
  it("buys a stretch below the mean when the regime is not a downtrend", () => {
    const closes = Array.from({ length: 20 }, () => "100");
    closes[19] = "98.70";
    const signal = meanReversionStrategy.evaluate(context({ candles: candlesFromCloses(closes), price: "98.70", session: "OPEN" }));
    expect(signal.action).toBe("BUY");
    expect(signal.evaluation).toBe("SIGNAL");
    expect(signal.executable).toBe(false);
  });

  it("reports insufficient data for a single candle", () => {
    const signal = meanReversionStrategy.evaluate(context({ candles: candlesFromCloses(["100"]) }));
    expect(signal.evaluation).toBe("INSUFFICIENT_DATA");
    expect(signal.action).toBe("NO_SIGNAL");
  });
});

describe("weekend / off-hours", () => {
  it("reports a dislocation without calling it arbitrage or a buy", () => {
    const signal = weekendStrategy.evaluate(
      context({ session: "CLOSED", price: "101", referencePrice: "100", candles: [] }),
    );
    expect(signal.evaluation).toBe("SIGNAL");
    expect(signal.action).toBe("HOLD");
    expect(signal.tags).toEqual(expect.arrayContaining(["OFF_HOURS_DISLOCATION", "REFERENCE_DEVIATION", "POTENTIAL_OPPORTUNITY"]));
    expect(signal.evidence.join(" ")).not.toMatch(/arbitrage profit/i);
    expect(hasDirectionalAction(signal)).toBe(false);
  });

  it("does not apply during the regular session", () => {
    const signal = weekendStrategy.evaluate(context({ session: "OPEN" }));
    expect(signal.evaluation).toBe("NO_SIGNAL");
    expect(signal.action).toBe("NO_SIGNAL");
  });

  it("treats an unknown session and a missing reference as insufficient", () => {
    expect(weekendStrategy.evaluate(context({ session: "UNKNOWN" })).evaluation).toBe("INSUFFICIENT_DATA");
    expect(
      weekendStrategy.evaluate(context({ session: "CLOSED", referencePrice: null, price: "101" })).evaluation,
    ).toBe("INSUFFICIENT_DATA");
  });

  it("refuses a stale reference observation", () => {
    const signal = weekendStrategy.evaluate(context({ session: "CLOSED", freshness: "STALE", price: "101", referencePrice: "100" }));
    expect(signal.evaluation).toBe("STALE_DATA");
    expect(signal.dataQuality.status).not.toBe("GOOD");
  });
});

describe("signal invariants", () => {
  it("keeps a hold from becoming a buy through serialization", () => {
    const signal = weekendStrategy.evaluate(context({ session: "OPEN" }));
    const parsed = parseSignal(serializeSignal(signal));
    expect(parsed.action).toBe("NO_SIGNAL");
    expect(parsed.executable).toBe(false);
  });

  it("rejects an insufficient evaluation that claims a buy", () => {
    const signal = momentumStrategy.evaluate(context({ candles: candlesFromCloses(["100"]) }));
    const tampered = serializeSignal(signal).replace('"NO_SIGNAL"', '"BUY"');
    expect(() => parseSignal(tampered)).toThrow(/do not agree/);
  });

  it("does not mark stale data good", () => {
    const quality = assessDataQuality({
      historyPoints: 100,
      requiredPoints: 21,
      freshness: "STALE",
      latestAgeMs: 500_000,
      referenceAgeMs: 500_000,
      missingFields: [],
      fidelity: "live",
    });
    expect(quality.status).toBe("STALE");
    expect(quality.status).not.toBe("GOOD");
  });

  it("does not mutate an unrelated risk policy and does not import execution", () => {
    const policy = Object.freeze({ maxPosition: 1n, liveTrading: false });
    const before = { ...policy };
    momentumStrategy.evaluate(context({ candles: candlesFromCloses(climb()) }));
    expect(policy).toEqual(before);
    for (const file of ["momentum.ts", "mean-reversion.ts", "weekend.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/wallet\/|execution\/|signPrehash|broadcast|privateKey|createHmac/);
    }
  });
});
