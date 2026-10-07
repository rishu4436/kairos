import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalKairosRunner, resolveRunnerExecutionMode } from "@/runtime/local-host";
import { InMemoryKairosStateStore, resetAutonomousStore } from "@/runtime/store";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID, DEMO_USER_ID } from "@/domain/watchlist";
import { resetTestMarketStores } from "@/test/paper-market";

afterEach(() => {
  resetAutonomousStore();
  resetTestMarketStores();
});

describe("local persistent runner", () => {
  it("does not start a loop on import and refuses overlapping ticks", async () => {
    const runner = createLocalKairosRunner({ intervalMs: 1_000, nowMs: () => 1_000 });
    expect(runner.due(1_000)).toBe(false);
    runner.start(0);
    expect(runner.due(1_000)).toBe(true);
    const first = await runner.tick(1_000);
    expect(first).not.toBeNull();
    expect(await runner.tick(1_000)).toBeNull();
    runner.stop();
    expect(await runner.tick(2_000)).toBeNull();
  });

  it("loads the persisted local user and agent literals", () => {
    expect(LOCAL_RUNTIME_USER_ID).toBe("user_demo");
    expect(DEFAULT_AGENT_ID).toBe("agent_demo");
    expect(DEMO_USER_ID).toBe("user_demo");
  });

  it("gives each runner instance a unique owner and excludes the second on a shared lease", async () => {
    const store = new InMemoryKairosStateStore();
    const first = createLocalKairosRunner({ userId: "user_a", agentId: "agent_a", store, env: { KAIROS_DATA_MODE: "paper" } });
    const second = createLocalKairosRunner({ userId: "user_a", agentId: "agent_a", store, env: { KAIROS_DATA_MODE: "paper" } });
    expect(first.ownerId).not.toBe(second.ownerId);
    expect(first.ownerId).toMatch(/^local:user_a:agent_a:/);
    const now = Date.now();
    const held = store.acquireLease({ userId: "user_a", agentId: "agent_a", ownerId: first.ownerId, nowMs: now, ttlMs: 60_000 });
    expect(held.ok).toBe(true);
    const blocked = await second.runOnce(now);
    expect(blocked.errors[0]?.code).toBe("LEASE_UNAVAILABLE");
    expect(store.renewLease("user_a", "agent_a", second.ownerId, 60_000, now).ok).toBe(false);
    expect(store.renewLease("user_a", "agent_a", first.ownerId, 60_000, now).ok).toBe(true);
    store.releaseLease("user_a", "agent_a", first.ownerId);
    const opened = await createLocalKairosRunner({
      userId: "user_a",
      agentId: "agent_a",
      store,
      env: { KAIROS_DATA_MODE: "paper" },
      ownerId: second.ownerId,
    }).runOnce(now + 1);
    expect(opened.errors.some((error) => error.code === "LEASE_UNAVAILABLE")).toBe(false);
  });

  it("does not import Studio and uses a declared tsx runner", () => {
    const host = readFileSync("runtime/local-host.ts", "utf8");
    expect(host).not.toMatch(/@\/studio/);
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string>; dependencies: Record<string, string> };
    expect(pkg.scripts["kairos:runner"]).toMatch(/^tsx /);
    expect(pkg.dependencies.tsx).toBeTruthy();
    expect(readFileSync("app/layout.tsx", "utf8")).not.toMatch(/LayoutProps/);
  });

  it("rejects invalid paper/live data combinations", () => {
    expect(resolveRunnerExecutionMode(undefined, { KAIROS_DATA_MODE: "paper" })).toBe("PAPER");
    expect(resolveRunnerExecutionMode("LIVE_PREVIEW", { KAIROS_DATA_MODE: "live" })).toBe("LIVE_PREVIEW");
    expect(() => resolveRunnerExecutionMode("LIVE", { KAIROS_DATA_MODE: "paper" })).toThrow(/paper data mode/);
    expect(() => resolveRunnerExecutionMode("PAPER", { KAIROS_DATA_MODE: "live" })).toThrow(/live data mode/);
  });
});
