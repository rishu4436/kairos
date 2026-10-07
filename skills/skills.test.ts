import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { arbitrateAsset } from "@/arbitration/arbitrate";
import type { ArbitrationContext, StrategyEvaluation } from "@/domain/arbitration";
import type { DataQuality } from "@/domain/quality";
import { parseDecimal } from "@/domain/money";
import { createTradeIntent } from "@/paper/intent";
import { DEFAULT_PAPER_POLICY } from "@/paper/policy";
import { unobservedWhaleClaim } from "@/research/validate";
import type { ResearchContext } from "@/research/types";
import { buildExternalExperimentContext, readSmartMoney } from "@/skills/clients";
import { buildMarketContext } from "@/skills/market-context";
import { assessExternalPolicy } from "@/skills/policy";
import { assertIntelligenceCapabilities, BINANCE_SKILLS, can, canInvoke, compareCliVersion, OBSERVED_BAW_VERSION, tokenSecurityFollowsRisk } from "@/skills/registry";
import { assessSecurityGate, buildTokenAuditRequest, confidenceAfterSecurity, mapSecurityEvent, normalizeTokenAudit, normalizeTokenizedAssetStatus, scoreAfterSecurity } from "@/skills/security";
import { dedupeExternalSignals, evaluateSmartMoneyConfirmation, mapSignalToAsset, normalizeSmartMoneyPayload, signalFreshness } from "@/skills/signal";
import { ingestExternalSignal, ingestTokenSecurity, readAssetIntelligence, recordSkillFailure, resetSkillStore } from "@/skills/store";
import { discoverWalletTracker } from "@/skills/wallet-tracker";
import { listStrategyCatalog } from "@/strategies/catalog";
import { ids, policy } from "@/test/fixtures";

const AS_OF = Date.parse("2026-04-10T15:00:00.000Z");
const NOW = Date.parse("2026-04-10T15:02:00.000Z");

afterEach(() => {
  resetSkillStore();
});

const quality = (): DataQuality => ({
  status: "GOOD",
  historyPoints: 48,
  latestAgeMs: 4000,
  referenceAgeMs: 4000,
  missingFields: [],
});

function context(overrides: Partial<ArbitrationContext> = {}): ArbitrationContext {
  return {
    userId: ids.userId,
    asset: { id: "rep-nvda", ticker: "NVDA" },
    timestamp: new Date(AS_OF).toISOString(),
    asOfMs: AS_OF,
    regime: "TRENDING_UP",
    session: "OPEN",
    dataQuality: quality(),
    freshness: "FRESH",
    pricePresent: true,
    referencePresent: true,
    historyPoints: 48,
    featureIds: ["return_1h", "sma_20", "trend"],
    priorSelection: null,
    ...overrides,
  };
}

function evaluation(): StrategyEvaluation {
  return {
    signalStrategyId: "momentum",
    strategyName: "Momentum",
    status: "implemented",
    supportedAssets: ["*"],
    supportedSessions: ["*"],
    minHistory: 21,
    requiresReference: false,
    action: "BUY",
    evaluation: "SIGNAL",
    confidence: 0.8,
    evidence: ["1h return +1.20%.", "Close is above the 20-period average.", "Trend UP."],
    featuresUsed: ["return_1h", "sma_20", "trend"],
    tags: ["MOMENTUM"],
    validUntil: new Date(AS_OF + 15 * 60 * 1000).toISOString(),
    signalTimestamp: new Date(AS_OF).toISOString(),
    signalQuality: "GOOD",
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    signalId: 42,
    ticker: "NVDA",
    chainId: "56",
    contractAddress: "0xabc",
    smartSignalType: "SMART_MONEY",
    direction: "buy",
    smartMoneyCount: 5,
    signalTriggerTime: NOW - 60_000,
    alertPrice: "1.25",
    currentPrice: "1.30",
    maxGain: "0.25",
    exitRate: 12,
    status: "valid",
    tokenTag: { "Sensitive Events": [{ tagName: "Smart Money Add Holdings" }] },
    ...overrides,
  };
}

describe("binance skill registry", () => {
  it("records inspected versions and blocks skills that need a newer CLI", () => {
    expect(OBSERVED_BAW_VERSION).toBe("1.9.0");
    expect(compareCliVersion("1.9.0", "1.9.1")).toBe("SKILL_BLOCKED_BY_VERSION");
    expect(compareCliVersion("1.9.0", "1.9.0")).toBe("COMPATIBLE");
    expect(compareCliVersion("1.9.0", null)).toBe("COMPATIBLE");
    const trading = BINANCE_SKILLS.find((skill) => skill.id === "binance-trading-signal");
    const audit = BINANCE_SKILLS.find((skill) => skill.id === "query-token-audit");
    const tokenized = BINANCE_SKILLS.find((skill) => skill.id === "binance-tokenized-securities-info");
    const tracker = BINANCE_SKILLS.find((skill) => skill.id === "binance-wallet-tracker");
    const wallet = BINANCE_SKILLS.find((skill) => skill.id === "binance-agentic-wallet");
    expect(trading).toMatchObject({ version: "3.5", requiredCliVersion: "1.9.1", status: "BLOCKED", installed: false, compatibility: "SKILL_BLOCKED_BY_VERSION" });
    expect(audit).toMatchObject({ version: "1.4", requiredCliVersion: null, compatibility: "COMPATIBLE", transport: "DIRECT_API" });
    expect(tokenized?.limitation).toContain("ONDO_ONLY");
    expect(tracker).toMatchObject({ version: "1.3", status: "BLOCKED", enabled: false });
    expect(wallet).toMatchObject({ version: "1.11.0", installed: true, executionAccess: "ISOLATED", compatibility: "COMPATIBLE" });
    expect(canInvoke("binance-trading-signal")).toBe(false);
    expect(canInvoke("binance-wallet-tracker")).toBe(false);
  });

  it("does not grant execution because a skill is installed", () => {
    expect(() => assertIntelligenceCapabilities(["READ_SIGNAL", "SIGN"])).toThrow(/SIGN/);
    expect(can("binance-trading-signal", "READ_SIGNAL")).toBe(true);
    expect(can("binance-trading-signal", "READ_SIGNAL_HISTORY")).toBe(true);
    expect(can("binance-trading-signal", "READ_BACKTEST_RESULT")).toBe(true);
    expect(can("binance-trading-signal", "EXECUTE_TRADE")).toBe(false);
    expect(can("binance-trading-signal", "CREATE_TRADE_INTENT")).toBe(false);
    expect(can("binance-trading-signal", "SIGN")).toBe(false);
    expect(can("binance-trading-signal", "BROADCAST")).toBe(false);
    expect(can("query-token-audit", "READ_TOKEN_SECURITY")).toBe(true);
    expect(can("query-token-audit", "READ_SIGNAL")).toBe(false);
    expect(can("query-token-audit", "EXECUTE_TRADE")).toBe(false);
    expect(can("binance-agentic-wallet", "SIGN")).toBe(false);
    expect(can("binance-agentic-wallet", "BROADCAST")).toBe(false);
    expect(tokenSecurityFollowsRisk()).toBe(true);
    expect(listStrategyCatalog().some((strategy) => strategy.id === "smart-money" || strategy.id === "smart-money-confirmation")).toBe(false);
  });

  it("keeps skill source off the execution path", () => {
    const source = readdirSync(join(process.cwd(), "skills"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(process.cwd(), "skills", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/createTradeIntent|executeSwap|broadcast-transaction|spawnBaw|market-order swap|signTransaction/);
    expect(source).not.toMatch(/from "@\/paper\//);
    expect(source).not.toMatch(/from "@\/wallet\//);
  });
});

describe("external signals", () => {
  it("normalizes a smart money row and leaves missing fields null", () => {
    const [signal] = normalizeSmartMoneyPayload({ code: "000000", data: [row({ maxGain: undefined, exitRate: undefined, confidence: undefined })] }, NOW);
    expect(signal).toMatchObject({
      signalId: "42",
      source: "SMART_MONEY",
      provider: "binance-trading-signal",
      chainId: "56",
      ticker: "NVDA",
      contractAddress: "0xabc",
      direction: "BUY",
      triggerPrice: "1.25",
      currentPrice: "1.30",
      maxGain: null,
      exitRate: null,
      confidence: null,
      strength: null,
      smartMoneyCount: 5,
      status: "valid",
      freshness: "FRESH",
    });
    expect(signal?.tokenTag).toEqual({ "Sensitive Events": [{ tagName: "Smart Money Add Holdings" }] });
  });

  it("marks timeout and old timestamps as not current", () => {
    expect(signalFreshness({ triggerTimeMs: NOW, observedAtMs: NOW, providerStatus: "timeout" })).toBe("EXPIRED");
    expect(signalFreshness({ triggerTimeMs: null, observedAtMs: NOW, providerStatus: "valid" })).toBe("UNKNOWN");
    const stale = normalizeSmartMoneyPayload({ data: [row({ signalTriggerTime: NOW - 2 * 60 * 60 * 1000, status: "valid" })] }, NOW)[0];
    expect(stale?.freshness).toBe("STALE");
    expect(evaluateSmartMoneyConfirmation("BUY", [{ direction: "BUY", freshness: "STALE", source: "SMART_MONEY", mapStatus: "MAPPED" }])).toBe("NO_SIGNAL");
  });

  it("dedupes by provider signal id and by contract, time, and direction", () => {
    const first = normalizeSmartMoneyPayload({ data: [row()] }, NOW)[0];
    const second = normalizeSmartMoneyPayload({ data: [row()] }, NOW)[0];
    const other = normalizeSmartMoneyPayload({ data: [row({ signalId: null, contractAddress: "0xdef" })] }, NOW)[0];
    expect(first && second && other).toBeTruthy();
    expect(dedupeExternalSignals([first!, second!, other!])).toHaveLength(2);
  });

  it("maps only a verified chain and contract", () => {
    const assets = [
      { assetId: "ondo-nvda", ticker: "NVDA", chainId: "56", contractAddress: "0xAbC" },
      { assetId: "xstock-nvda", ticker: "NVDA", chainId: "56", contractAddress: "0x999" },
    ];
    const signal = normalizeSmartMoneyPayload({ data: [row()] }, NOW)[0]!;
    expect(mapSignalToAsset(signal, assets)).toEqual({ status: "MAPPED", assetId: "ondo-nvda" });
    expect(mapSignalToAsset({ ...signal, contractAddress: null }, assets).status).toBe("SIGNAL_UNRELATED");
    expect(mapSignalToAsset({ ...signal, chainId: "1" }, assets).status).toBe("SIGNAL_UNRELATED");
    expect(mapSignalToAsset({ ...signal, ticker: "NVDA", contractAddress: "0xnot-a-match" }, assets).status).toBe("SIGNAL_UNRELATED");
  });

  it("confirms, conflicts, or reports no signal without creating an order", () => {
    const fresh = (direction: "BUY" | "SELL") => ({ direction, freshness: "FRESH" as const, source: "SMART_MONEY", mapStatus: "MAPPED" as const });
    expect(evaluateSmartMoneyConfirmation("BUY", [fresh("BUY")])).toBe("CONFIRMING_EVIDENCE");
    expect(evaluateSmartMoneyConfirmation("BUY", [fresh("SELL")])).toBe("CONFLICTING_EVIDENCE");
    expect(evaluateSmartMoneyConfirmation("BUY", [])).toBe("NO_SIGNAL");
    expect(evaluateSmartMoneyConfirmation("BUY", [{ ...fresh("BUY"), mapStatus: "SIGNAL_UNRELATED" }])).toBe("NO_SIGNAL");
  });

  it("does not let the live smart money reader guess an endpoint", () => {
    const result = readSmartMoney();
    expect(result.ok).toBe(false);
    expect(result.transport).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/not installed/);
    expect(result.reason).not.toMatch(/https?:/);
  });
});

describe("token security and tokenized status", () => {
  it("normalizes an authoritative audit and does not call LOW safe", () => {
    const assessment = normalizeTokenAudit({
      assetId: "ondo-nvda",
      chainId: "56",
      contractAddress: "0xabc",
      checkedAt: new Date(NOW).toISOString(),
      body: {
        code: "000000",
        data: {
          hasResult: true,
          isSupported: true,
          riskLevelEnum: "LOW",
          riskLevel: 1,
          extraInfo: { buyTax: "0", sellTax: "0", isVerified: true },
          riskItems: [{ id: "CONTRACT_RISK", name: "Contract Risk", details: [{ title: "Honeypot Risk Not Found", description: "A honeypot is a token that can be bought but not sold", isHit: false, riskType: "RISK" }] }],
        },
      },
    });
    expect(assessment.riskLevelEnum).toBe("LOW");
    expect(assessment.available).toBe(true);
    expect(JSON.stringify(assessment)).not.toMatch(/safe/i);
    expect(assessSecurityGate(assessment)).toBe("ELIGIBLE");
    expect(buildTokenAuditRequest({ chainId: "56", contractAddress: "0xabc", requestId: "11111111-1111-4111-8111-111111111111" }).url).toBe(
      "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit",
    );
  });

  it("hides risk fields when the audit is not authoritative", () => {
    const assessment = normalizeTokenAudit({
      assetId: "ondo-nvda",
      chainId: "56",
      contractAddress: "0xabc",
      checkedAt: new Date(NOW).toISOString(),
      body: { data: { hasResult: false, isSupported: false, riskLevel: 5, riskLevelEnum: "HIGH", riskItems: [{ id: "SCAM_RISK" }] } },
    });
    expect(assessment.available).toBe(false);
    expect(assessment.riskLevel).toBeNull();
    expect(assessment.riskLevelEnum).toBeNull();
    expect(assessment.riskItems).toBeNull();
    expect(assessSecurityGate(assessment)).toBe("UNAVAILABLE");
  });

  it("blocks high risk without adding it to confidence or score", () => {
    const gate = assessSecurityGate({ available: true, supported: true, riskLevel: 5, riskLevelEnum: "HIGH" });
    expect(gate).toBe("BLOCK");
    expect(assessSecurityGate({ available: true, supported: true, riskLevel: 4, riskLevelEnum: "HIGH" })).toBe("BLOCK");
    expect(confidenceAfterSecurity(0.81, gate)).toBeNull();
    expect(scoreAfterSecurity(0.81, gate)).toBe(0.81);
    expect(confidenceAfterSecurity(0.81, "ELIGIBLE")).toBe(0.81);
  });

  it("maps a corporate action only when the provider returns one", () => {
    expect(mapSecurityEvent({ assetId: "ondo-nvda", body: { data: { openState: true, marketStatus: "regular", reasonCode: null, reasonMsg: null } } })).toBeNull();
    expect(mapSecurityEvent({ assetId: "ondo-nvda", body: { data: { reasonCode: "ASSET_LIMITED", reasonMsg: "earnings", marketStatus: "pause", nextOpenTime: 1_774_252_860_000 } } })).toMatchObject({
      eventType: "earnings",
      status: "pause",
      assetId: "ondo-nvda",
      source: "binance-tokenized-securities-info",
    });
    expect(normalizeTokenizedAssetStatus({ data: { reasonCode: "TRADING" } }).limitation).toBe("ONDO_ONLY");
  });
});

describe("skill isolation", () => {
  it("keeps one user's signals out of another user's asset", () => {
    const signal = normalizeSmartMoneyPayload({ data: [row()] }, NOW)[0]!;
    ingestExternalSignal({
      userId: "user_skill_a",
      signal,
      map: { status: "MAPPED", assetId: "ondo-nvda" },
      nowMs: NOW,
    });
    expect(readAssetIntelligence("user_skill_a", "ondo-nvda").signals).toHaveLength(1);
    expect(readAssetIntelligence("user_skill_b", "ondo-nvda").signals).toHaveLength(0);
    expect(readAssetIntelligence("user_skill_a", "other-asset").signals).toHaveLength(0);
    const unrelated = normalizeSmartMoneyPayload({ data: [row({ signalId: 7, contractAddress: "0xnope" })] }, NOW)[0]!;
    ingestExternalSignal({ userId: "user_skill_a", signal: unrelated, map: { status: "SIGNAL_UNRELATED", reason: "No match" }, nowMs: NOW });
    expect(readAssetIntelligence("user_skill_a", "ondo-nvda").signals.map((item) => item.signalId)).toEqual(["42"]);
  });

  it("records a skill failure instead of an empty no-signal read", () => {
    const event = recordSkillFailure({ userId: "user_skill_a", skillId: "binance-trading-signal", message: "Upstream unavailable", nowMs: NOW });
    expect(event.type).toBe("SKILL_ERROR");
    expect(event.payload).not.toHaveProperty("orderId");
    const read = readAssetIntelligence("user_skill_a", "ondo-nvda").signalRead;
    expect(read.kind).toBe("SKILL_ERROR");
    expect(read.kind).not.toBe("NO_SIGNAL");
    expect(readAssetIntelligence("user_skill_b", "ondo-nvda").signalRead.kind).toBe("NO_SIGNAL");
  });

  it("discovers wallet tracking without enabling it", () => {
    const discovery = discoverWalletTracker();
    expect(discovery.status).toBe("SKILL_BLOCKED_BY_VERSION");
    expect(discovery.signals).toEqual([]);
    expect(discovery.activeStrategy).toBe(false);
    expect(discovery.onMainBrain).toBe(false);
  });
});

describe("arbitrator and research integration", () => {
  it("records confirmation and conflict without changing the score", () => {
    const plain = arbitrateAsset(context(), [evaluation()]);
    const confirming = arbitrateAsset(
      context({
        externalSignals: [{ direction: "BUY", freshness: "FRESH", source: "SMART_MONEY", mapStatus: "MAPPED" }],
      }),
      [evaluation()],
    );
    const conflicting = arbitrateAsset(
      context({
        externalSignals: [{ direction: "SELL", freshness: "FRESH", source: "SMART_MONEY", mapStatus: "MAPPED" }],
      }),
      [evaluation()],
    );
    const stale = arbitrateAsset(
      context({
        externalSignals: [{ direction: "BUY", freshness: "STALE", source: "SMART_MONEY", mapStatus: "MAPPED" }],
      }),
      [evaluation()],
    );
    expect(plain.decision).toBe("SELECT_STRATEGY");
    expect(confirming.externalConfirmation).toBe("CONFIRMING_EVIDENCE");
    expect(confirming.score).toBe(plain.score);
    expect(confirming.confidence).toBe(plain.confidence);
    expect(confirming.decision).toBe(plain.decision);
    expect(conflicting.externalConflict).toBe("CONFLICTING_EVIDENCE");
    expect(conflicting.score).toBe(plain.score);
    expect(stale.externalConfirmation).toBe("STALE");
    expect(stale.externalFreshness).toBe("STALE");
    expect(stale.decision).toBe("SELECT_STRATEGY");
    expect(stale.score).toBe(plain.score);
  });

  it("blocks a high-risk token without raising confidence or creating an intent", () => {
    const plain = arbitrateAsset(context(), [evaluation()]);
    const blocked = arbitrateAsset(
      context({
        securityAssessment: { available: true, supported: true, riskLevel: 5, riskLevelEnum: "HIGH" },
      }),
      [evaluation()],
    );
    expect(blocked.securityGate).toBe("BLOCK");
    expect(blocked.decision).toBe("DATA_BLOCKED");
    expect(blocked.selectedAction).toBeNull();
    expect(blocked.score).toBe(plain.score);
    expect(blocked.confidence).toBeNull();
    expect(blocked.evidence.penalties.join(" ")).not.toMatch(/safe/i);
    const intent = createTradeIntent({
      userId: ids.userId,
      agentId: ids.agentId,
      accountId: ids.accountId,
      decision: blocked,
      observation: {
        assetId: "rep-nvda",
        ticker: "NVDA",
        userId: ids.userId,
        observedPrice: parseDecimal("100"),
        referencePrice: null,
        priceTimestamp: new Date(AS_OF).toISOString(),
      },
      riskPolicy: policy(),
      quantity: parseDecimal("1"),
      notional: parseDecimal("100"),
      paperPolicy: DEFAULT_PAPER_POLICY,
      nowMs: NOW,
      correlationId: "corr_skill",
    });
    expect(intent.ok).toBe(false);
  });

  it("keeps an unavailable audit from changing the decision", () => {
    const plain = arbitrateAsset(context(), [evaluation()]);
    const unavailable = arbitrateAsset(
      context({
        securityAssessment: { available: false, supported: false, riskLevel: null, riskLevelEnum: null },
      }),
      [evaluation()],
    );
    expect(unavailable.securityGate).toBe("UNAVAILABLE");
    expect(unavailable.decision).toBe(plain.decision);
    expect(unavailable.score).toBe(plain.score);
    expect(unavailable.confidence).toBe(plain.confidence);
  });

  it("gives research the same external slices and rejects an unobserved whale claim", () => {
    const signal = normalizeSmartMoneyPayload({ data: [row()] }, NOW)[0]!;
    ingestExternalSignal({ userId: "user_research", signal, map: { status: "MAPPED", assetId: "rep-1" }, nowMs: NOW });
    ingestTokenSecurity({
      userId: "user_research",
      assessment: normalizeTokenAudit({
        assetId: "rep-1",
        chainId: "56",
        contractAddress: "0xabc",
        checkedAt: new Date(NOW).toISOString(),
        body: { data: { hasResult: true, isSupported: true, riskLevel: 1, riskLevelEnum: "LOW" } },
      }),
      nowMs: NOW,
    });
    const owned = readAssetIntelligence("user_research", "rep-1");
    const other = readAssetIntelligence("user_other", "rep-1");
    const market = buildMarketContext({
      marketObservations: [{ assetId: "rep-1", ticker: "NVDA", price: "1" }],
      features: [],
      regime: "TRENDING_UP",
      session: "OPEN",
      strategySignals: [{ strategyId: "momentum", action: "BUY" }],
      externalSignals: owned.signals,
      tokenSecurity: owned.security,
      tokenizedSecurityStatus: null,
      securityEvents: owned.securityEvents,
      dataQuality: "GOOD",
    });
    expect(market.externalSignals).toHaveLength(1);
    expect(market.tokenSecurity?.riskLevelEnum).toBe("LOW");
    expect(other.signals).toHaveLength(0);
    const context = {
      externalSignals: [{ id: signal.signalId ?? "42", source: "SMART_MONEY", direction: "BUY" as const, freshness: "FRESH" }],
    } as unknown as ResearchContext;
    expect(unobservedWhaleClaim("Whales are buying.", { ...context, externalSignals: [] })).toBe(true);
    expect(unobservedWhaleClaim("Whales are buying.", context)).toBe(false);
    expect(buildExternalExperimentContext([signal.signalId])).toEqual({
      signalIds: ["42"],
      usedAsCandles: false,
      fabricatedHistory: false,
      note: "External signals are context only. They are not historical candles, and no signal history was fabricated.",
    });
    expect(assessExternalPolicy({ internalAction: "BUY", signals: [] }).externalConfirmation).toBe("NO_SIGNAL");
  });
});
