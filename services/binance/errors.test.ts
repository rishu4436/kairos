import { describe, expect, it } from "vitest";
import { categoryForUpstream, KairosApiError, redact } from "@/services/binance/errors";
import { readBinanceConfig } from "@/services/binance/config";

describe("API error mapping", () => {
  it("maps gateway statuses and business codes onto KAIROS categories", () => {
    expect(categoryForUpstream(401, 40102)).toBe("AUTHENTICATION_ERROR");
    expect(categoryForUpstream(401, 40101)).toBe("AUTHENTICATION_ERROR");
    expect(categoryForUpstream(403, 40104)).toBe("AUTHENTICATION_ERROR");
    expect(categoryForUpstream(429, 42900)).toBe("RATE_LIMITED");
    expect(categoryForUpstream(400, 40001)).toBe("INVALID_REQUEST");
    expect(categoryForUpstream(500, 50000)).toBe("UPSTREAM_ERROR");
    expect(categoryForUpstream(503, 50001)).toBe("UPSTREAM_ERROR");
  });

  it("fails closed when a credential is missing and redacts secrets", () => {
    expect(() => readBinanceConfig({} as NodeJS.ProcessEnv)).toThrow(KairosApiError);
    expect(() => readBinanceConfig({} as NodeJS.ProcessEnv)).toThrow(/API credentials missing/);
    expect(redact("key secret leaked", ["secret"])).toBe("key [redacted] leaked");
  });
});
