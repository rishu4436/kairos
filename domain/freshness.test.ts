import { describe, expect, it } from "vitest";
import { classifyFreshness, DEFAULT_FRESHNESS_POLICY } from "@/domain/freshness";

const now = 1_700_000_000_000;

describe("freshness", () => {
  it("classifies a recent source timestamp as fresh", () => {
    const result = classifyFreshness(now - 4_000, now, DEFAULT_FRESHNESS_POLICY);
    expect(result.status).toBe("FRESH");
    expect(result.ageMs).toBe(4_000);
    expect(result.sourceTimestamp).toBe(new Date(now - 4_000).toISOString());
    expect(result.receivedAt).toBe(new Date(now).toISOString());
  });

  it("classifies an aging timestamp separately from a stale one", () => {
    expect(classifyFreshness(now - 60_000, now).status).toBe("AGING");
    expect(classifyFreshness(now - 180_000, now).status).toBe("STALE");
  });

  it("returns unknown when the source time is missing or in the future", () => {
    expect(classifyFreshness(null, now).status).toBe("UNKNOWN");
    expect(classifyFreshness(now + 30_000, now).status).toBe("UNKNOWN");
    expect(classifyFreshness(Number.NaN, now).ageMs).toBeNull();
  });
});
