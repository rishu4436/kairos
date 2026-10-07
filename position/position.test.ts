import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLANK_POSITION_MEMORY, type KAIROSContext, type PositionSliceValue } from "@/context/types";
import { captureCycleSnapshot, diffPositionContext } from "@/position/diff";
import { captureEntrySnapshot, percentToBps } from "@/position/entry";
import { deterministicPositionManager } from "@/position/manager";
import { DEFAULT_ADD_POLICY, MAX_REDUCE_BPS } from "@/position/policy";
import { POSITION_DECISION_PRIORITY } from "@/position/types";

const AT = "2026-10-04T14:15:00.000Z";
const ENTRY_AT = "2026-10-04T14:00:00.000Z";

describe("deterministic position manager", () => {
  it("holds a valid momentum position and does not add on a repeated signal", () => {
    const decision = deterministicPositionManager.evaluatePosition(context());
    expect(decision.action).toBe("HOLD");
    expect(decision.executable).toBe(false);
    expect(decision.riskEffect).toBe("NONE");
    expect(decision.positionState).toBe("OPEN");
    expect(decision.currentThesisState).toBe("VALID");
    expect(decision.reasonCodes).toEqual([
      "THESIS_VALID",
      "RISK_WITHIN_LIMIT",
      "NO_EXIT_TRIGGER",
      "ADD_NOT_FRESH",
      "ADD_COOLDOWN",
    ]);
    expect(decision.createdAt).toBe(AT);
    expect(decision.decisionId).toBe("posdec:user_a:paper:NVDA:cycle-1:HOLD");
    expect(deterministicPositionManager.evaluatePosition(context())).toEqual(decision);
  });

  it("does not exit because unrealized PnL is negative", () => {
    const decision = deterministicPositionManager.evaluatePosition(
      context({
        position: {
          unrealizedPnL: "-40.00",
          currentMark: "99.60",
        },
      }),
    );
    expect(decision.action).toBe("HOLD");
    expect(decision.reasonCodes).not.toContain("ADVERSE_MOVE");
  });

  it("exits momentum at the configured 150 bps adverse move and not one basis point earlier", () => {
    const stopped = deterministicPositionManager.evaluatePosition(
      context({ position: { currentMark: "98.50" }, marketPrice: "98.50" }),
    );
    const inside = deterministicPositionManager.evaluatePosition(
      context({ position: { currentMark: "98.51" }, marketPrice: "98.51" }),
    );
    expect(stopped.action).toBe("EXIT");
    expect(stopped.reasonCodes).toContain("ADVERSE_MOVE");
    expect(stopped.riskEffect).toBe("CLOSE_RISK");
    expect(stopped.exitClass).toBe("RISK");
    expect(stopped.positionState).toBe("CLOSING");
    expect(stopped.executable).toBe(false);
    expect(inside.action).toBe("HOLD");
  });

  it("keeps the documented priority: data, security, thesis, then reduce, add, and hold", () => {
    expect(POSITION_DECISION_PRIORITY).toEqual([
      "HARD_RISK_OR_DATA_BLOCK",
      "SECURITY_OR_TRADABILITY",
      "THESIS_INVALIDATION",
      "EXIT_SIGNAL",
      "REDUCE",
      "ADD",
      "HOLD",
    ]);
    const blocked = deterministicPositionManager.evaluatePosition(
      context({
        marketStatus: "STALE",
        securityGate: "BLOCK",
        signal: { action: "SELL", confidence: 0.9 },
      }),
    );
    const security = deterministicPositionManager.evaluatePosition(context(addReady({ securityGate: "BLOCK" })));
    const reversed = deterministicPositionManager.evaluatePosition(context({ signal: { action: "SELL", confidence: 0.9 } }));
    expect(blocked.action).toBe("BLOCKED");
    expect(blocked.reasonCodes).toEqual(["MARKET_DATA_STALE"]);
    expect(blocked.positionState).toBe("BLOCKED");
    expect(security.action).toBe("EXIT");
    expect(security.reasonCodes).toEqual(["SECURITY_BLOCK"]);
    expect(reversed.action).toBe("EXIT");
    expect(reversed.reasonCodes).toContain("ORIGIN_STRATEGY_REVERSED");
    expect(reversed.reasonCodes).not.toContain("EXIT_SIGNAL");
  });

  it("blocks a missing mark instead of inventing an exit", () => {
    const decision = deterministicPositionManager.evaluatePosition(
      context({ marketPrice: null, position: { currentMark: null } }),
    );
    expect(decision.action).toBe("BLOCKED");
    expect(decision.reasonCodes).toEqual(["CRITICAL_DATA_FAILURE"]);
    expect(decision.riskEffect).toBe("NONE");
  });

  it("does not add because the price fell, and an add cannot beat a hard exit", () => {
    const cheaper = deterministicPositionManager.evaluatePosition(
      context(addReady({ position: { currentMark: "99.50" }, marketPrice: "99.50" })),
    );
    const stopped = deterministicPositionManager.evaluatePosition(
      context(addReady({ position: { currentMark: "98.50" }, marketPrice: "98.50" })),
    );
    expect(cheaper.action).toBe("HOLD");
    expect(cheaper.reasonCodes).toContain("ADD_PRICE_DOWN");
    expect(cheaper.reasonCodes).not.toContain("ADD_SUPPORTED");
    expect(stopped.action).toBe("EXIT");
    expect(stopped.reasonCodes).toContain("ADVERSE_MOVE");
  });

  it("adds only when every gate passes", () => {
    const decision = deterministicPositionManager.evaluatePosition(context(addReady()));
    expect(decision.action).toBe("ADD");
    expect(decision.reasonCodes).toEqual(["ADD_SUPPORTED"]);
    expect(decision.riskEffect).toBe("INCREASE_RISK");
    expect(decision.positionState).toBe("ADDING");
    expect(decision.currentThesisState).toBe("STRENGTHENED");
    expect(decision.strength).toBe(0.8);
    expect(decision.executable).toBe(false);
    const report = deterministicPositionManager.generateExitIntent(context(addReady()));
    expect(report.action).toBe("HOLD");
    expect(report.reasonCodes).toEqual(["NO_EXIT_TRIGGER"]);
    expect(report.riskEffect).toBe("NONE");
    expect(report.executable).toBe(false);
  });

  it("enforces add count, cooldown, and the total notional cap", () => {
    const cooled = deterministicPositionManager.evaluatePosition(
      context(addReady({ timestamp: "2026-10-04T14:30:00.000Z" })),
    );
    const capped = deterministicPositionManager.evaluatePosition(
      context(addReady({ position: { addCount: DEFAULT_ADD_POLICY.maxAdds } })),
    );
    const full = deterministicPositionManager.evaluatePosition(
      context(addReady({ position: { notional: DEFAULT_ADD_POLICY.maxTotalNotional } })),
    );
    expect(cooled.action).toBe("HOLD");
    expect(cooled.reasonCodes).toContain("ADD_COOLDOWN");
    expect(capped.reasonCodes).toContain("ADD_AT_MAX");
    expect(full.reasonCodes).toContain("ADD_AT_MAX");
    expect(capped.action).toBe("HOLD");
    expect(full.action).toBe("HOLD");
  });

  it("reduces once for a weakened signal and then holds", () => {
    const first = deterministicPositionManager.evaluatePosition(
      context({ signal: { confidence: 0.5 }, timestamp: "2026-10-04T18:00:00.000Z" }),
    );
    const second = deterministicPositionManager.evaluatePosition(
      context({
        signal: { confidence: 0.5 },
        timestamp: "2026-10-04T18:00:00.000Z",
        position: { appliedReductions: ["WEAKENED_SIGNAL"] },
      }),
    );
    expect(first.action).toBe("REDUCE");
    expect(first.reasonCodes).toEqual(["WEAKENED_SIGNAL"]);
    expect(first.reductionBps).toBe(2500);
    expect(first.reductionBps).toBeLessThan(10_000);
    expect(first.reductionBps).toBeLessThanOrEqual(MAX_REDUCE_BPS);
    expect(first.riskEffect).toBe("REDUCE_RISK");
    expect(first.positionState).toBe("REDUCING");
    expect(second.action).toBe("HOLD");
    expect(second.reasonCodes).toContain("WEAKENED_SIGNAL");
    expect(second.reasonCodes).toContain("NO_EXIT_TRIGGER");
  });

  it("does not treat insufficient health or a mere regime change as an exit", () => {
    const health = deterministicPositionManager.evaluatePosition(
      context({ health: { status: "INSUFFICIENT_DATA", sampleSize: 1 } }),
    );
    const regime = deterministicPositionManager.evaluatePosition(context({ regime: "RANGE_BOUND" }));
    const degraded = deterministicPositionManager.evaluatePosition(
      context({ health: { status: "DEGRADED", sampleSize: 4 } }),
    );
    expect(health.action).toBe("HOLD");
    expect(regime.action).toBe("HOLD");
    expect(degraded.action).toBe("REDUCE");
    expect(degraded.reasonCodes).toEqual(["HEALTH_DEGRADED"]);
    expect(degraded.reductionBps).toBe(5000);
  });

  it("invalidates momentum when the trend is no longer supportive", () => {
    const decision = deterministicPositionManager.evaluatePosition(
      context({ trend: "DOWN", regime: "TRENDING_DOWN" }),
    );
    expect(decision.action).toBe("EXIT");
    expect(decision.currentThesisState).toBe("INVALIDATED");
    expect(decision.reasonCodes).toContain("TREND_NO_LONGER_SUPPORTIVE");
  });

  it("invalidates mean reversion on completion, extension, and a hostile regime", () => {
    const completed = deterministicPositionManager.evaluatePosition(
      context({
        origin: "mean-reversion",
        distance: "+0.10%",
        entryDistance: -240,
        regime: "RANGE_BOUND",
      }),
    );
    const extended = deterministicPositionManager.evaluatePosition(
      context({
        origin: "mean-reversion",
        distance: "-3.60%",
        entryDistance: -240,
        regime: "RANGE_BOUND",
      }),
    );
    const hostile = deterministicPositionManager.evaluatePosition(
      context({
        origin: "mean-reversion",
        distance: "-2.00%",
        entryDistance: -240,
        regime: "TRENDING_DOWN",
      }),
    );
    const intact = deterministicPositionManager.evaluatePosition(
      context({
        origin: "mean-reversion",
        distance: "-2.00%",
        entryDistance: -240,
        regime: "RANGE_BOUND",
      }),
    );
    expect(completed.reasonCodes).toContain("REVERSION_COMPLETED");
    expect(extended.reasonCodes).toContain("EXTENSION_AGAINST_THESIS");
    expect(hostile.reasonCodes).toContain("REGIME_INVALIDATED");
    expect(completed.action).toBe("EXIT");
    expect(extended.action).toBe("EXIT");
    expect(hostile.action).toBe("EXIT");
    expect(intact.action).toBe("HOLD");
  });

  it("leaves the weekend strategy analytical unless hard risk or security applies", () => {
    const analytical = deterministicPositionManager.evaluatePosition(
      context({ origin: "weekend", regime: "HIGH_VOLATILITY", signal: { action: "HOLD", confidence: 0.4 } }),
    );
    const drawdown = deterministicPositionManager.evaluatePosition(
      context({
        origin: "weekend",
        regime: "HIGH_VOLATILITY",
        performanceNet: "-1500",
      }),
    );
    const blocked = deterministicPositionManager.evaluatePosition(
      context({ origin: "weekend", securityGate: "BLOCK" }),
    );
    expect(analytical.action).toBe("HOLD");
    expect(analytical.reasonCodes).toContain("WEEKEND_ANALYTICAL");
    expect(analytical.currentThesisState).toBe("UNKNOWN");
    expect(drawdown.action).toBe("EXIT");
    expect(drawdown.reasonCodes).toContain("MAX_DRAWDOWN_BREACH");
    expect(blocked.action).toBe("EXIT");
    expect(blocked.reasonCodes).toEqual(["SECURITY_BLOCK"]);
  });

  it("does not exit on daily loss alone and does block an add", () => {
    const decision = deterministicPositionManager.evaluatePosition(
      context(addReady({ dailyLossReached: true })),
    );
    expect(decision.action).toBe("HOLD");
    expect(decision.riskState).toBe("INCREASE_BLOCKED");
    expect(decision.reasonCodes).toContain("ADD_RISK_BLOCKED");
    expect(decision.reasonCodes).not.toContain("RISK_BREACH");
  });

  it("trims exposure inside the hard multiple and exits beyond it", () => {
    const trim = deterministicPositionManager.evaluatePosition(
      context({ position: { notional: "6000" } }),
    );
    const hard = deterministicPositionManager.evaluatePosition(
      context({ position: { notional: "12000" } }),
    );
    expect(trim.action).toBe("REDUCE");
    expect(trim.reasonCodes).toContain("EXPOSURE_TOO_LARGE");
    expect(trim.reductionBps).toBeGreaterThan(0);
    expect(trim.reductionBps).toBeLessThanOrEqual(MAX_REDUCE_BPS);
    expect(hard.action).toBe("EXIT");
    expect(hard.reasonCodes).toContain("POSITION_LIMIT_BREACH");
  });

  it("blocks when no position is open or management is already in flight", () => {
    const empty = deterministicPositionManager.evaluatePosition(context({ positionState: "NO_POSITION" }));
    const inflight = deterministicPositionManager.evaluatePosition(context({ positionState: "REDUCING" }));
    expect(empty.action).toBe("BLOCKED");
    expect(empty.reasonCodes).toEqual(["NO_POSITION"]);
    expect(empty.positionState).toBe("NO_POSITION");
    expect(inflight.reasonCodes).toEqual(["MANAGEMENT_IN_FLIGHT"]);
    expect(deterministicPositionManager.generateExitIntent(context({ positionState: "NO_POSITION" })).action).toBe("BLOCKED");
  });

  it("stores a compact entry snapshot and parses feature percents", () => {
    expect(percentToBps("+1.20%")).toBe(120);
    expect(percentToBps("-2.40%")).toBe(-240);
    expect(percentToBps("1.2")).toBeNull();
    const snapshot = captureEntrySnapshot(context(), "momentum", "100.00", ENTRY_AT);
    expect(snapshot.entryStrategySignal).toEqual({
      strategyId: "momentum",
      action: "BUY",
      evaluation: "SIGNAL",
      confidence: 0.7,
    });
    expect(snapshot.entryFeatures).toEqual({ trend: "UP", distanceFromMeanBps: -240 });
    expect(snapshot.entryExternalEvidence).toBeNull();
    expect(snapshot.entryEventState).toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(/secret|payload|prompt/i);
  });

  it("replays hold, add, reduce, exit, and a stale block without creating an intent effect", () => {
    const hold = deterministicPositionManager.evaluatePosition(context());
    const later = deterministicPositionManager.evaluatePosition(context({ timestamp: "2026-10-04T14:30:00.000Z" }));
    const added = deterministicPositionManager.evaluatePosition(context(addReady()));
    const reduced = deterministicPositionManager.evaluatePosition(context({ signal: { confidence: 0.5 } }));
    const exited = deterministicPositionManager.evaluatePosition(context({ signal: { action: "SELL", confidence: 0.9 } }));
    const stale = deterministicPositionManager.evaluatePosition(context({ marketStatus: "STALE" }));
    const unverified = deterministicPositionManager.evaluatePosition(context());
    expect(hold.action).toBe("HOLD");
    expect(later.action).toBe("HOLD");
    expect(hold.riskEffect).toBe("NONE");
    expect(later.riskEffect).toBe("NONE");
    expect(stale.action).toBe("BLOCKED");
    expect(stale.riskEffect).toBe("NONE");
    expect(stale.reasonCodes).toEqual(["MARKET_DATA_STALE"]);
    expect(unverified.action).toBe("HOLD");
    expect(added.action).toBe("ADD");
    expect(added.riskEffect).toBe("INCREASE_RISK");
    expect(reduced.action).toBe("REDUCE");
    expect(reduced.riskEffect).toBe("REDUCE_RISK");
    expect(reduced.reductionBps).toBeLessThan(10_000);
    expect(exited.action).toBe("EXIT");
    expect(exited.riskEffect).toBe("CLOSE_RISK");
    expect(exited.exitClass).toBe("THESIS");
    expect(exited.executable).toBe(false);
  });

  it("expires a thesis only when a holding limit is configured and trails only on paper", () => {
    const open = deterministicPositionManager.evaluatePosition(
      context({ timestamp: "2026-10-04T16:00:00.000Z" }),
    );
    expect(open.reasonCodes).not.toContain("THESIS_EXPIRED");
    const expired = deterministicPositionManager.evaluatePosition(
      context({
        timestamp: "2026-10-04T16:00:00.000Z",
        position: {
          managementPolicy: {
            maxPositionDrawdownBps: null,
            maxHoldingBars: null,
            maxHoldingMinutes: 30,
            profitProtectionBps: null,
            trailingExitBps: null,
          },
        },
      }),
    );
    expect(expired.action).toBe("EXIT");
    expect(expired.reasonCodes).toEqual(["THESIS_EXPIRED"]);
    expect(expired.exitClass).toBe("THESIS");

    const configured = context({
      position: {
        highestMark: "110.00",
        currentMark: "100.00",
        managementPolicy: {
          maxPositionDrawdownBps: null,
          maxHoldingBars: null,
          maxHoldingMinutes: null,
          profitProtectionBps: null,
          trailingExitBps: 500,
        },
      },
      marketPrice: "100.00",
    });
    if (configured.market.value) {
      configured.market.value.fidelity = "paper";
    }
    const trailed = deterministicPositionManager.evaluatePosition(configured);
    expect(trailed.action).toBe("EXIT");
    expect(trailed.reasonCodes).toContain("TRAILING_EXIT");
    expect(trailed.exitClass).toBe("RISK");
    const live = deterministicPositionManager.evaluatePosition(
      context({
        position: {
          highestMark: "110.00",
          currentMark: "100.00",
          managementPolicy: {
            maxPositionDrawdownBps: null,
            maxHoldingBars: null,
            maxHoldingMinutes: null,
            profitProtectionBps: null,
            trailingExitBps: 500,
          },
        },
        marketPrice: "100.00",
      }),
    );
    expect(live.reasonCodes).not.toContain("TRAILING_EXIT");
  });

  it("records external conflict, alternate strategy, and maintenance without handing off or exiting", () => {
    const base = context();
    const conflict = deterministicPositionManager.evaluatePosition({
      ...base,
      externalSignals: {
        status: "AVAILABLE",
        value: { signals: [{ relevance: "MAPPED", direction: "SELL", freshness: "FRESH" }] },
      },
    } as unknown as KAIROSContext);
    expect(conflict.action).not.toBe("EXIT");
    expect(conflict.reasonCodes).toContain("EXTERNAL_CONFLICT");
    expect(conflict.currentThesisState).toBe("WEAKENED");
    expect(conflict.originStrategyId).toBe("momentum");

    const alternate = deterministicPositionManager.evaluatePosition({
      ...base,
      strategySignals: {
        value: {
          signals: [
            ...(base.strategySignals.value?.signals ?? []),
            {
              strategyId: "mean-reversion",
              strategyName: "Mean Reversion",
              version: "1",
              action: "BUY",
              evaluation: "SIGNAL",
              confidence: 0.95,
              timestamp: AT,
              validUntil: "2026-10-04T18:00:00.000Z",
              source: "test",
            },
          ],
        },
      },
    } as unknown as KAIROSContext);
    expect(alternate.action).toBe("HOLD");
    expect(alternate.reasonCodes).toContain("ALTERNATE_STRATEGY_SIGNAL");
    expect(alternate.originStrategyId).toBe("momentum");
    expect(alternate.alternateStrategyId).toBe("mean-reversion");

    const maintenance = deterministicPositionManager.evaluatePosition({
      ...base,
      eventContext: {
        status: "AVAILABLE",
        value: { events: [{ type: "MAINTENANCE", severity: "RESTRICTION", active: true }] },
      },
    } as unknown as KAIROSContext);
    expect(maintenance.action).toBe("HOLD");
    expect(maintenance.reasonCodes).toContain("MAINTENANCE");

    const restricted = deterministicPositionManager.evaluatePosition({
      ...base,
      eventContext: {
        status: "AVAILABLE",
        value: { events: [{ type: "TRADING_RESTRICTION", severity: "RESTRICTION", active: true }] },
      },
    } as unknown as KAIROSContext);
    expect(restricted.action).toBe("EXIT");
    expect(restricted.reasonCodes).toContain("TRADING_RESTRICTION");
    expect(restricted.exitClass).toBe("RISK");
  });

  it("diffs entry and current context and keeps a small historical loss from forcing an exit", () => {
    const current = captureCycleSnapshot(context({ regime: "RANGE_BOUND" }));
    const entry = context().positionContext.value?.entry ?? null;
    const diff = diffPositionContext({ entry, previous: null, current });
    expect(diff.regime.entry).toBe("TRENDING_UP");
    expect(diff.regime.current).toBe("RANGE_BOUND");
    expect(diff.regime.changed).toBe(true);
    expect(diff.strategyAction.entry).toBe("momentum:BUY");
    const quiet = deterministicPositionManager.evaluatePosition(context({ performanceNet: "-10.00" }));
    expect(quiet.action).not.toBe("EXIT");
    const unstable = deterministicPositionManager.evaluatePosition(context({ health: { status: "UNSTABLE", sampleSize: 40 } }));
    expect(unstable.action).toBe("REDUCE");
    expect(unstable.action).not.toBe("EXIT");
  });

  it("binds a decision to the context user and asset", () => {
    const owned = deterministicPositionManager.evaluatePosition(context());
    const other = deterministicPositionManager.evaluatePosition({ ...context(), userId: "user_b", assetId: "paper:AAPL" } as unknown as KAIROSContext);
    expect(owned.userId).toBe("user_a");
    expect(owned.assetId).toBe("paper:NVDA");
    expect(other.userId).toBe("user_b");
    expect(other.assetId).toBe("paper:AAPL");
    expect(other.decisionId).not.toBe(owned.decisionId);
  });

  it("holds through an upcoming earnings window unless reduction is configured", () => {
    const held = deterministicPositionManager.evaluatePosition(context({
      earnings: { window: "PRE_EVENT", eventReductionEnabled: false },
    }));
    expect(held.action).toBe("HOLD");
    expect(held.reasonCodes).toContain("EVENT_UNCERTAINTY");
    expect(held.riskEffect).toBe("NONE");
    const reduced = deterministicPositionManager.evaluatePosition(context({
      earnings: { window: "PRE_EVENT", eventReductionEnabled: true },
    }));
    expect(reduced.action).toBe("REDUCE");
    expect(reduced.reasonCodes).toContain("EVENT_UNCERTAINTY");
    expect(reduced.riskEffect).toBe("REDUCE_RISK");
    expect(reduced.reductionBps).toBeLessThan(10_000);
    const headline = deterministicPositionManager.evaluatePosition(context({
      newsHeadline: "Company announced a product update",
    }));
    expect(headline.action).not.toBe("EXIT");
    expect(headline.riskEffect).toBe("NONE");
  });

  it("does not fetch a market, a model, a wallet, or the paper cycle", () => {
    for (const file of ["position/decide.ts", "position/manager.ts", "position/entry.ts", "position/policy.ts", "position/diff.ts", "position/explain.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from ["']@\/wallet/);
      expect(source).not.toMatch(/from ["'][^"']*qwen/i);
      expect(source).not.toMatch(/createTradeIntent/);
      expect(source).not.toMatch(/from ["']@\/paper\/cycle/);
      expect(source).not.toMatch(/from ["'][^"']*binance/i);
      expect(source).not.toMatch(/Date\.now/);
      expect(source).not.toMatch(/broadcastTransaction/);
    }
    const cycle = readFileSync("paper/cycle.ts", "utf8");
    expect(cycle).toMatch(/deterministicPositionManager/);
    expect(cycle).not.toMatch(/@\/wallet/);
    expect(cycle).not.toMatch(/LiveExecutionGateway/);
    expect(cycle).not.toMatch(/generateExitIntent/);
    expect(cycle).toMatch(/recordPaperFill/);
    const holdBranch = cycle.slice(cycle.indexOf('decision.action === "HOLD"'), cycle.indexOf("const arbitration"));
    expect(holdBranch).not.toMatch(/recordPaperFill/);
    expect(holdBranch).not.toMatch(/createManagementIntent/);
    const research = ["research/context.ts", "research/qwen.ts", "research/qwen-prompt.ts", "research/schemas.ts"]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(research).not.toMatch(/decidePosition|deterministicPositionManager/);
    expect(research).toContain("A position hypothesis is not a PositionDecision.");
  });
});

function addReady(extra: ContextPatch = {}): ContextPatch {
  return {
    timestamp: "2026-10-04T16:00:00.000Z",
    signal: { action: "BUY", confidence: 0.8, timestamp: "2026-10-04T15:00:00.000Z" },
    entryConfidence: 0.7,
    ...extra,
    position: {
      currentMark: "101.00",
      ...(extra.position ?? {}),
    },
    marketPrice: extra.marketPrice === undefined ? "101.00" : extra.marketPrice,
  };
}

interface ContextPatch {
  timestamp?: string;
  marketStatus?: "AVAILABLE" | "UNAVAILABLE" | "STALE";
  marketFreshness?: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  marketPrice?: string | null;
  quality?: "GOOD" | "DEGRADED" | "BLOCKED";
  origin?: string;
  regime?: string;
  trend?: string | null;
  distance?: string | null;
  entryDistance?: number | null;
  securityGate?: "NOT_EVALUATED" | "BLOCK";
  dailyLossReached?: boolean | null;
  performanceNet?: string | null;
  earnings?: { window: "PRE_EVENT" | "EVENT_DAY" | "POST_EVENT" | "NORMAL"; eventReductionEnabled: boolean };
  newsHeadline?: string;
  positionState?: PositionSliceValue["state"];
  health?: { status: string; sampleSize: number };
  signal?: { action?: string; confidence?: number | null; evaluation?: string; timestamp?: string };
  entryConfidence?: number | null;
  position?: Partial<PositionSliceValue>;
}

function context(patch: ContextPatch = {}): KAIROSContext {
  const timestamp = patch.timestamp ?? AT;
  const origin = patch.origin ?? "momentum";
  const signal = {
    strategyId: origin,
    strategyName: origin,
    version: "1",
    action: patch.signal?.action ?? "BUY",
    evaluation: patch.signal?.evaluation ?? "SIGNAL",
    confidence: patch.signal && "confidence" in patch.signal ? patch.signal.confidence ?? null : 0.7,
    timestamp: patch.signal?.timestamp ?? timestamp,
    validUntil: "2026-10-04T18:00:00.000Z",
    source: "test",
  };
  const position = positionSlice(origin, patch);
  return {
    userId: "user_a",
    agentId: "agent_a",
    assetId: "paper:NVDA",
    cycleId: "cycle-1",
    timestamp,
    quality: patch.quality ?? "DEGRADED",
    market: {
      status: patch.marketStatus ?? "AVAILABLE",
      freshness: patch.marketFreshness ?? "UNKNOWN",
      value: patch.marketPrice === null ? { price: "" } : { price: patch.marketPrice ?? "100.00" },
    },
    features: {
      value: {
        features: [
          { id: "trend", value: patch.trend === undefined ? "UP" : patch.trend },
          { id: "distance_from_mean", value: patch.distance === undefined ? "-2.40%" : patch.distance },
        ],
      },
    },
    regime: { value: { regime: patch.regime ?? "TRENDING_UP" } },
    session: { value: { session: "UNKNOWN" } },
    strategySignals: { value: { signals: [signal] } },
    strategyHealth: {
      value: {
        reports: [
          {
            strategyId: origin,
            status: patch.health?.status ?? "INSUFFICIENT_DATA",
            sampleSize: patch.health?.sampleSize ?? 1,
            sample: "1",
          },
        ],
      },
    },
    strategyPerformance: {
      value: {
        records: patch.performanceNet
          ? [{ strategyId: origin, dataset: "PAPER", netPnL: patch.performanceNet }]
          : [],
      },
    },
    externalSignals: { status: "UNAVAILABLE", value: null },
    tokenSecurity: {
      value: {
        gate: patch.securityGate ?? "NOT_EVALUATED",
        label: patch.securityGate === "BLOCK" ? "BLOCK" : "UNKNOWN",
      },
    },
    eventContext: { status: "UNAVAILABLE", value: null },
    positionContext: { value: position },
    ...(patch.earnings
      ? {
          earningsContext: {
            status: "AVAILABLE",
            value: {
              event: { eventId: "fmp:earnings:NVDA:2026-10-07:0", reportedDate: "2026-10-07", status: "UPCOMING" },
              window: patch.earnings.window,
              policy: { eventReductionEnabled: patch.earnings.eventReductionEnabled },
              eventRisk: { earningsWindow: patch.earnings.window, highUncertaintyWindow: patch.earnings.window !== "NORMAL" },
            },
          },
        }
      : {}),
    ...(patch.newsHeadline
      ? {
          newsContext: {
            status: "AVAILABLE",
            value: {
              providerConnected: true,
              items: [{ newsId: "fmp:news:1", headline: patch.newsHeadline, underlyingTicker: "NVDA" }],
            },
          },
        }
      : {}),
  } as unknown as KAIROSContext;
}

function positionSlice(origin: string, patch: ContextPatch): PositionSliceValue {
  if (patch.positionState === "NO_POSITION") {
    return {
      state: "NO_POSITION",
      quantity: null,
      averageEntry: null,
      currentMark: null,
      unrealizedPnL: null,
      notional: null,
      originStrategy: null,
      strategyVersion: null,
      openedAt: null,
      representationId: "paper:NVDA",
      positionId: null,
      correlationId: null,
      addCount: 0,
      lastAddAt: null,
      appliedReductions: [],
      entry: null,
      risk: null,
      ...BLANK_POSITION_MEMORY,
    };
  }
  const base: PositionSliceValue = {
    state: patch.positionState ?? "OPEN",
    quantity: "4",
    averageEntry: "100.00",
    currentMark: "100.00",
    unrealizedPnL: "0",
    notional: "400.00",
    originStrategy: origin,
    strategyVersion: "1",
    openedAt: ENTRY_AT,
    representationId: "paper:NVDA",
    positionId: "pos_1",
    correlationId: "corr_open",
    addCount: 0,
    lastAddAt: null,
    appliedReductions: [],
    entry: {
      entryContextId: "ctx_entry",
      entryCycleId: "cycle-entry",
      entryStrategySignal: {
        strategyId: origin,
        action: "BUY",
        evaluation: "SIGNAL",
        confidence: patch.entryConfidence ?? 0.7,
      },
      entryRegime: "TRENDING_UP",
      entrySession: "UNKNOWN",
      entryPrice: "100.00",
      entryStrategyHealth: { status: "INSUFFICIENT_DATA", sample: "0", sampleSize: 0 },
      entryExternalEvidence: null,
      entryEventState: null,
      entryTimestamp: ENTRY_AT,
      entryFeatures: {
        trend: "UP",
        distanceFromMeanBps: patch.entryDistance === undefined ? -240 : patch.entryDistance,
      },
    },
    ...BLANK_POSITION_MEMORY,
    risk: {
      maxPositionNotional: "5000",
      maxAllocationBps: 2500,
      equity: "10000",
      invested: "400",
      dailyLossReached: patch.dailyLossReached ?? false,
      minimumTradeNotional: "25",
    },
  };
  return { ...base, ...patch.position };
}
