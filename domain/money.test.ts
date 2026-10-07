import { describe, expect, it } from "vitest";
import { formatDecimal, mul, parseDecimal } from "@/domain/money";

describe("scaled money", () => {
  it("parses and formats two-decimal amounts", () => {
    expect(formatDecimal(parseDecimal("184.55"))).toBe("184.55");
    expect(formatDecimal(parseDecimal("-1.50"))).toBe("-1.50");
    expect(formatDecimal(parseDecimal("42350"))).toBe("42350.00");
  });

  it("rejects more than six decimal places", () => {
    expect(() => parseDecimal("1.1234567")).toThrow(/decimal places/);
  });

  it("multiplies scaled amounts", () => {
    expect(mul(parseDecimal("184.55"), parseDecimal("8"))).toBe(parseDecimal("1476.40"));
    expect(mul(parseDecimal("2"), parseDecimal("3"))).toBe(parseDecimal("6"));
  });
});
