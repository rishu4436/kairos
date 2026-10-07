import { describe, expect, it } from "vitest";
import { mapMarketSession, sessionLabel } from "@/domain/session-state";

describe("market session mapping", () => {
  it("maps documented statuses without collapsing overnight or pause into closed", () => {
    expect(mapMarketSession("regular")).toBe("OPEN");
    expect(mapMarketSession("premarket")).toBe("PRE_OPEN");
    expect(mapMarketSession("postmarket")).toBe("POST_CLOSE");
    expect(mapMarketSession("closed")).toBe("CLOSED");
    expect(mapMarketSession("overnight")).toBe("UNKNOWN");
    expect(mapMarketSession("pause")).toBe("UNKNOWN");
    expect(mapMarketSession(undefined)).toBe("UNKNOWN");
  });

  it("keeps the raw overnight value visible", () => {
    expect(sessionLabel("UNKNOWN", "overnight")).toBe("UNKNOWN · overnight");
    expect(sessionLabel("PRE_OPEN", "premarket")).toBe("PRE-OPEN");
  });
});
