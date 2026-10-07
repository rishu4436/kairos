import { describe, expect, it } from "vitest";
import { fmpApiKey } from "@/events/fmp/client";
import { resetEventIntelligence, warmUnderlyingEvents, readCachedUnderlyingEvents } from "@/events/service";

const enabled = process.env.FMP_LIVE_TEST === "1" && Boolean(fmpApiKey());

describe("credentialed FMP event read", () => {
  it.skipIf(!enabled)("reads TSLA earnings and news without creating an order", async () => {
    resetEventIntelligence();
    const started = Date.now();
    await warmUnderlyingEvents({ tickers: ["TSLA"], nowMs: started, fidelity: "paper" });
    const read = readCachedUnderlyingEvents({ ticker: "TSLA", nowMs: started, fidelity: "paper" });
    expect(read.newsReason).not.toBe("NOT_CONFIGURED");
    expect(read.earningsReason === null || read.earningsReason === "PROVIDER_ANSWERED" || read.earningsStatus === "UNAVAILABLE").toBe(true);
    expect(JSON.stringify(read)).not.toContain(fmpApiKey() ?? "missing-key");
    expect(read.health.latencyMs === null || read.health.latencyMs >= 0).toBe(true);
  });
});
