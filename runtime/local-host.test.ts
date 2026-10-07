import { afterEach, describe, expect, it } from "vitest";
import { createLocalKairosRunner } from "@/runtime/local-host";
import { resetAutonomousStore } from "@/runtime/store";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID, DEMO_USER_ID } from "@/domain/watchlist";
import { resetTestMarketStores } from "@/test/paper-market";

afterEach(() => {
  resetAutonomousStore();
  resetTestMarketStores();
});

describe("local persistent runner", () => {
  it("does not start a loop on import and refuses overlapping ticks", () => {
    const runner = createLocalKairosRunner({ intervalMs: 1_000, nowMs: () => 1_000 });
    expect(runner.due(1_000)).toBe(false);
    runner.start(0);
    expect(runner.due(1_000)).toBe(true);
    const first = runner.tick(1_000);
    expect(first).not.toBeNull();
    expect(runner.tick(1_000)).toBeNull();
    runner.stop();
    expect(runner.tick(2_000)).toBeNull();
  });

  it("loads the persisted local user and agent literals", () => {
    expect(LOCAL_RUNTIME_USER_ID).toBe("user_demo");
    expect(DEFAULT_AGENT_ID).toBe("agent_demo");
    expect(DEMO_USER_ID).toBe("user_demo");
  });
});
