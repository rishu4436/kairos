import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/domain/money";
import { createLocalKairosRunner } from "@/runtime/local-host";
import { InMemoryKairosStateStore } from "@/runtime/store";
import { writeControl } from "@/operator/commands";
import {
  AUTO_PROFILES,
  addWatch,
  admitOperatorAction,
  assetsForMandate,
  buttonAvailability,
  controlFace,
  pinWatch,
  refreshAutoWatch,
  removeWatch,
  searchUniverse,
  sizeByPercentage,
} from "@/operator/mandate";
import { assessPromotion, promoteThesis } from "@/research/promotion";
import { readFileSync } from "node:fs";

const usd = (value: string) => parseDecimal(value);

describe("operator control center", () => {
  it("enables RUN and one cycle only while stopped with a mandate", () => {
    expect(buttonAvailability("STOPPED", true)).toEqual({ run: true, stop: false, oneCycle: true });
    expect(buttonAvailability("RUNNING", true)).toEqual({ run: false, stop: true, oneCycle: false });
    expect(buttonAvailability("CYCLE", true).oneCycle).toBe(false);
    expect(admitOperatorAction("ONE_CYCLE", "RUNNING", true).ok).toBe(false);
    expect(admitOperatorAction("RUN", "RUNNING", true).ok).toBe(false);
    expect(admitOperatorAction("ONE_CYCLE", "STOPPED", false)).toEqual({ ok: false, reason: "MANDATE_REQUIRED" });
  });

  it("does not tick a stopped runner", async () => {
    const store = new InMemoryKairosStateStore();
    writeControl("STOPPED", store, "2026-10-07T00:00:00.000Z");
    const runner = createLocalKairosRunner({ intervalMs: 1000, nowMs: () => 5000, store, env: { KAIROS_DATA_MODE: "paper" } });
    runner.start(0);
    expect(await runner.tick(5000)).toBeNull();
    runner.stop();
  });

  it("resolves bounded auto profiles without enabling live trading", () => {
    expect(AUTO_PROFILES.LOW.deployableCapitalBps).toBe(3000);
    expect(AUTO_PROFILES.MEDIUM.momentumMinReturnBps).toBe(50);
    expect(AUTO_PROFILES.HIGH.deployableCapitalBps).toBeLessThanOrEqual(10_000);
    expect(AUTO_PROFILES.HIGH.perTradeBpsOfDeployable).toBeLessThanOrEqual(10_000);
  });

  it("sizes 100 USDT at 50% deployable and 10% per trade as 5 USDT", () => {
    const sized = sizeByPercentage({
      stablecoinBalance: usd("100"),
      reserve: 0n,
      capital: { ...AUTO_PROFILES.MEDIUM, deployableCapitalBps: 5000, perTradeBpsOfDeployable: 1000 },
    });
    expect(sized.ok).toBe(true);
    if (sized.ok) {
      expect(sized.raw).toBe(usd("5"));
      expect(sized.notional).toBe(usd("5"));
      expect(sized.binding).toBe("PER_TRADE_PCT");
    }
  });

  it("lets a tighter position cap win", () => {
    const sized = sizeByPercentage({
      stablecoinBalance: usd("100"),
      reserve: 0n,
      capital: { ...AUTO_PROFILES.MEDIUM, deployableCapitalBps: 5000, perTradeBpsOfDeployable: 5000, maxPositionBpsOfDeployable: 1000, strategyBudgetBpsOfDeployable: 10_000 },
    });
    expect(sized.ok && sized.binding).toBe("MAX_POSITION");
    expect(sized.ok && sized.notional).toBe(usd("5"));
  });

  it("blocks an empty balance and keeps pinned assets", () => {
    expect(sizeByPercentage({ stablecoinBalance: usd("1"), reserve: usd("1"), capital: AUTO_PROFILES.LOW }).ok).toBe(false);
    const added = addWatch([], { ticker: "TSLA", representationId: "56:TSLA", source: "USER", pinned: true, chainId: "56", contractAddress: "0x5b1910eaad6450e50f816082aa078c41f10c292f" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const pinned = pinWatch(added.book, "TSLA", true);
    const refreshed = refreshAutoWatch({ current: pinned, ranked: ["NVDA", "AAPL", "MSFT", "AMD", "SPY", "FAKE"], maxAssets: 3 });
    expect(refreshed.find((item) => item.ticker === "TSLA")?.pinned).toBe(true);
    expect(refreshed.some((item) => item.ticker === "FAKE")).toBe(false);
    expect(refreshed.length).toBeLessThanOrEqual(3);
    expect(removeWatch(pinned, "TSLA")).toHaveLength(1);
    expect(searchUniverse("tsla").map((item) => item.ticker)).toEqual(["TSLA"]);
    expect(addWatch([], { ticker: "TSLA", representationId: "x", source: "USER", pinned: false, chainId: "1", contractAddress: null }).ok).toBe(false);
  });

  it("keeps manual evaluation inside the selected assets", () => {
    expect(assetsForMandate("MANUAL", ["TSLA"], ["NVDA", "AAPL"])).toEqual(["TSLA"]);
    expect(assetsForMandate("AUTO", ["TSLA"], ["NVDA"])).toEqual(["NVDA"]);
    expect(assetsForMandate("UNCONFIGURED", ["TSLA"], ["NVDA"])).toEqual([]);
  });

  it("does not promote a small winning sample", () => {
    expect(assessPromotion({ trades: 3, winRate: 0.66, expectancy: 1, maxDrawdownBps: 100, sampleSufficient: false, validationViolations: 0 }).status).toBe("INSUFFICIENT_SAMPLE");
    const promoted = promoteThesis({
      thesisId: "th_1",
      title: "TSLA Dip Recovery",
      metrics: { trades: 24, winRate: 0.58, expectancy: 0.4, maxDrawdownBps: 800, sampleSufficient: true, validationViolations: 0 },
    });
    expect("enabled" in promoted && promoted.enabled).toBe(false);
    expect("origin" in promoted && promoted.origin).toBe("RESEARCH-DERIVED");
  });

  it("keeps paper off the normal operator dashboard", () => {
    const page = readFileSync("features/command-center/command-center.tsx", "utf8");
    expect(page).not.toMatch(/Execution Mode/);
    expect(page).not.toMatch(/>PAPER</);
  });

  it("shows stopped and running as different control faces", () => {
    expect(controlFace("STOPPED", false)).toBe("STOPPED");
    expect(controlFace("RUNNING", true)).toBe("CYCLE");
  });
});
