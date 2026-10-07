import { describe, expect, it } from "vitest";
import { executionModeFromRequest, resolveProductExecutionMode } from "@/domain/execution-mode";

describe("execution modes", () => {
  it("ignores request strings when selecting LIVE", () => {
    expect(executionModeFromRequest("LIVE")).toBe("PAPER");
    expect(executionModeFromRequest("live")).toBe("PAPER");
    expect(resolveProductExecutionMode({ requested: "LIVE" })).toBe("PAPER");
    expect(resolveProductExecutionMode({ serverMode: "LIVE_PREVIEW", requested: "LIVE" })).toBe("LIVE_PREVIEW");
    expect(resolveProductExecutionMode({ serverMode: "LIVE", requested: "PAPER" })).toBe("LIVE");
  });
});
