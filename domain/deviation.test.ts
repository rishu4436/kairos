import { describe, expect, it } from "vitest";
import { referenceDeviationPct } from "@/domain/deviation";

describe("reference deviation", () => {
  it("computes the percent gap from the reference price", () => {
    expect(referenceDeviationPct("101", "100")).toBeCloseTo(1);
    expect(referenceDeviationPct("99.5", "100")).toBeCloseTo(-0.5);
  });

  it("returns null when the reference price cannot be used", () => {
    expect(referenceDeviationPct("10", "0")).toBeNull();
    expect(referenceDeviationPct("nope", "10")).toBeNull();
    expect(referenceDeviationPct("10", "")).toBeNull();
  });
});
