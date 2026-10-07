import { afterEach, describe, expect, it } from "vitest";
import { InMemoryKairosStateStore, resetAutonomousStore } from "@/runtime/store";
import { applyOperatorPatch, defaultOperatorConfig, validateOperatorConfig } from "@/operator/config";
import { alignOperatingMode } from "@/operator/store";
import { posturePreset } from "@/operator/posture";
import { applyRuntimeAction, patchOperatorConfig } from "@/operator/actions";
import { persistWalletSnapshot, readWalletSnapshot } from "@/operator/snapshots";
import { assertPersistable } from "@/runtime/store";
import { loadProductionDashboard } from "@/services/dashboard";
import { readFileSync } from "node:fs";
import { createLocalKairosRunner } from "@/runtime/local-host";
import { writeOperatorCommand } from "@/operator/commands";

describe("operator control plane", () => {
  afterEach(() => {
    resetAutonomousStore();
  });

  it("rejects invalid capital and keeps the previous config", () => {
    const current = defaultOperatorConfig();
    const rejected = applyOperatorPatch(current, { capital: { ...current.capital, maxPerTradeNotional: "-1" } }, current.updatedAt);
    expect(rejected.ok).toBe(false);
    expect(validateOperatorConfig(current).ok).toBe(true);
  });

  it("increments config version on a valid patch", () => {
    const store = new InMemoryKairosStateStore();
    const first = patchOperatorConfig({ capital: { maxPerTradeNotional: "250", maxCapitalNotional: "10000", reserveCapitalNotional: "0", strategyMaxTradeNotional: {} } }, store);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.config.version).toBe(2);
      expect(first.config.previousVersion).toBe(1);
    }
  });

  it("audits RUN/PAUSE/STOP and emergency disable", () => {
    const store = new InMemoryKairosStateStore();
    expect(applyRuntimeAction("RUN", store).ok).toBe(true);
    expect(applyRuntimeAction("PAUSE", store).ok).toBe(true);
    expect(applyRuntimeAction("STOP", store).ok).toBe(true);
    expect(applyRuntimeAction("EXECUTION_DISABLE", store).ok).toBe(true);
    const types = store.listAudits("user_demo", "agent_demo").map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining(["AGENT_STARTED", "AGENT_PAUSED", "AGENT_STOPPED", "EXECUTION_DISABLED"]));
  });

  it("does not allow a second overlapping runner tick", async () => {
    const store = new InMemoryKairosStateStore();
    const runner = createLocalKairosRunner({ intervalMs: 1000, nowMs: () => 1000, store, env: { KAIROS_DATA_MODE: "paper" } });
    runner.start(0);
    const first = runner.tick(1000);
    expect(await runner.tick(1000)).toBeNull();
    await first;
    runner.stop();
  });

  it("RUN ONE command is consumed after a tick path sets pause", () => {
    const store = new InMemoryKairosStateStore();
    writeOperatorCommand({ kind: "ONE_SHOT", requestedAt: new Date().toISOString() }, store);
    expect(store.get("ignored")).toBeNull();
  });

  it("public dashboard source has no BAW CLI import", () => {
    const source = readFileSync("services/dashboard.ts", "utf8");
    expect(source).not.toMatch(/CliAgenticWalletGateway/);
    expect(source).not.toMatch(/baw/);
  });

  it("renders a stored wallet snapshot and marks missing as unavailable", async () => {
    resetAutonomousStore();
    persistWalletSnapshot({
      connectionStatus: "CONNECTED",
      address: "0xc44edDcFfA4227d38bc92a7cA5990953AA7Ff0cF",
      chainId: "56",
      bnb: "0.008",
      usdt: "109.89",
      tokens: [],
      quotaUsed: "0",
      quotaRemaining: "100",
      highRiskHandling: "NeedConfirmation",
      tokenScope: "OPERATOR_ATTESTED",
      observedAt: new Date().toISOString(),
      stale: false,
    });
    const view = await loadProductionDashboard();
    expect(view.wallet.usdt).toBe("109.89");
    expect(view.wallet.tokenScope).toBe("OPERATOR_ATTESTED");
    resetAutonomousStore();
    const empty = readWalletSnapshot();
    expect(empty.connectionStatus).toBe("UNAVAILABLE");
  });

  it("refuses secret-like snapshot payloads", () => {
    expect(() => assertPersistable({ apiKey: "secret" })).toThrow(/STATE_INVALID/);
  });

  it("lifts paper execution to LIVE_PREVIEW only when market data is live", () => {
    const previous = process.env.KAIROS_DATA_MODE;
    process.env.KAIROS_DATA_MODE = "live";
    try {
      expect(alignOperatingMode(defaultOperatorConfig()).runtime.executionMode).toBe("LIVE_PREVIEW");
    } finally {
      if (previous === undefined) {
        delete process.env.KAIROS_DATA_MODE;
      } else {
        process.env.KAIROS_DATA_MODE = previous;
      }
    }
  });

  it("auto postures stay inside the existing strategy parameter limits", () => {
    const base = defaultOperatorConfig();
    for (const posture of ["CONSERVATIVE", "MEDIUM", "HIGH"] as const) {
      const next = posturePreset(posture, base);
      expect(validateOperatorConfig(next).ok).toBe(true);
      expect(next.risk.liveTradingEnabled).toBe(base.risk.liveTradingEnabled);
    }
    expect(posturePreset("CONSERVATIVE", base).strategies.dca.enabled).toBe(false);
    expect(posturePreset("HIGH", base).strategies.dca.dipThresholdBps).toBe(300);
    expect(posturePreset("MEDIUM", base).strategies.momentum.minReturnBps).toBe(50);
  });

  it("requires LIVE confirmation", () => {
    const store = new InMemoryKairosStateStore();
    const denied = patchOperatorConfig({ runtime: { enabled: true, cycleIntervalMs: 60_000, executionMode: "LIVE" } }, store);
    expect(denied.ok).toBe(false);
  });

  it("public command center has no operator mutation controls", () => {
    const page = readFileSync("features/command-center/command-center.tsx", "utf8");
    expect(page).not.toMatch(/RUN ONE CYCLE/);
    expect(page).not.toMatch("/api/operator");
  });
});
