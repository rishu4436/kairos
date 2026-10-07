import { describe, expect, it } from "vitest";
import { scaleDecimal } from "@/domain/candle";
import { InMemoryMarketHistory } from "@/domain/history";
import { candlesFromCloses } from "@/domain/test-candles";

describe("market history", () => {
  it("appends, queries, and caps", () => {
    const history = new InMemoryMarketHistory(3);
    history.append("nvda", candlesFromCloses(["1", "2", "3", "4"]));
    expect(history.queryRecent("nvda", 10).map((candle) => candle.close)).toEqual([
      scaleDecimal("2"),
      scaleDecimal("3"),
      scaleDecimal("4"),
    ]);
    expect(history.latest("nvda")?.timestampMs).toBe(3 * 900_000);
    expect(history.previous("nvda")?.timestampMs).toBe(2 * 900_000);
    expect(history.queryRange("nvda", 900_000, 1_800_000)).toHaveLength(2);
  });

  it("sorts out-of-order candles and replaces duplicate timestamps", () => {
    const history = new InMemoryMarketHistory();
    const [first, second] = candlesFromCloses(["10", "11"]);
    history.append("a", [second, first]);
    history.append("a", [{ ...first, close: scaleDecimal("12") ?? 0n }]);
    const rows = history.queryRecent("a", 10);
    expect(rows.map((candle) => candle.timestampMs)).toEqual([0, 900_000]);
    expect(rows[0].close).toBe(scaleDecimal("12"));
    history.clear();
    expect(history.latest("a")).toBeNull();
    expect(history.previous("missing")).toBeNull();
  });

  it("returns nothing for an empty series", () => {
    const history = new InMemoryMarketHistory();
    expect(history.queryRecent("none", 5)).toEqual([]);
    expect(history.latest("none")).toBeNull();
    expect(history.previous("none")).toBeNull();
  });
});
