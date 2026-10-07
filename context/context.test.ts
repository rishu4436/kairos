import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { arbitrateAsset } from "@/arbitration/arbitrate";
import { SCORE_WEIGHTS } from "@/arbitration/policy";
import { arbitrationViewFromContext } from "@/context/arbitration-view";
import { DEFAULT_EVENT_TTL_MS, mockEventProvider } from "@/context/events";
import { fuseContext, type FusionInput } from "@/context/fusion";
import { POSITION_MANAGER_IMPLEMENTED } from "@/context/position-manager";
import { SOURCES } from "@/context/sources";
import { restoreContext, serializeContext } from "@/context/snapshot";
import { noteStrategySelection } from "@/context/service";
import { resetContextMemory, writeContextPrior, type ContextPrior } from "@/context/transitions";
import { BLANK_POSITION_MEMORY, type ExternalSignalReading, type KAIROSContext, type MarketEvent, type PositionSliceValue, type SecuritySliceValue } from "@/context/types";
import { validateKairosContext } from "@/context/validate";
import type { ArbitrationDecision, StrategyEvaluation } from "@/domain/arbitration";
import { asAgentId, asUserId } from "@/domain/ids";
import type { ObservationRow } from "@/domain/observation";
import { buildPaperObservation } from "@/observation/paper";
import { buildResearchContext } from "@/research/context";
import { QWEN_RESEARCH_INSTRUCTIONS, QWEN_THESIS_PROMPT_VERSION } from "@/research/qwen-prompt";
import type { ResearchThesis } from "@/research/types";
import { validateEvidenceAgainstContext } from "@/research/validate";

const NOW = Date.parse("2026-04-10T15:00:00.000Z");
const AT = new Date(NOW - 1_000).toISOString();
const BAR_MS = 15 * 60 * 1000;

const FEATURES = ["return_1h", "sma_20", "trend", "realized_volatility_20", "data_freshness", "distance_from_mean", "reference_deviation"];

function signal(overrides: Partial<ExternalSignalReading> = {}): ExternalSignalReading {
  return {
    id: "sig-1",
    provider: "BINANCE",
    contract: "0xabc",
    chainId: "56",
    direction: "BUY",
    freshness: "FRESH",
    signalAgeMs: 1_000,
    source: "SMART_MONEY",
    relevance: "MAPPED",
    observedAt: AT,
    ...overrides,
  };
}

function security(overrides: Partial<SecuritySliceValue> = {}): SecuritySliceValue {
  return {
    gate: "ELIGIBLE",
    label: "PASS",
    riskLevel: 1,
    riskLevelEnum: "LOW",
    chainId: "56",
    contractAddress: "0xabc",
    ...overrides,
  };
}

function noPosition(): PositionSliceValue {
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
    representationId: "56:0xabc",
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

function input(overrides: Partial<FusionInput> = {}): FusionInput {
  const historyTimestampsMs = Array.from({ length: 48 }, (_, index) => NOW - 1_000 - (47 - index) * BAR_MS);
  const base: FusionInput = {
    userId: "user_a",
    agentId: "agent_a",
    cycleId: "cycle-1",
    nowMs: NOW,
    watchlist: ["NVDA", "TSLA"],
    identity: {
      underlyingTicker: "NVDA",
      underlyingName: "NVIDIA",
      representationId: "56:0xabc",
      tokenSymbol: "bNVDA",
      chainId: "56",
      chainLabel: "BSC",
      contractAddress: "0xabc",
    },
    fidelity: "live",
    marketFreshness: "FRESH",
    marketAgeMs: 1_000,
    price: "120.00",
    priceObservedAt: AT,
    receivedAt: new Date(NOW).toISOString(),
    session: "OPEN",
    sessionLabel: "Regular",
    rawMarketStatus: "TRADING",
    referencePrice: "119.50",
    referenceObservedAt: AT,
    deviationPct: 0.42,
    historyPoints: historyTimestampsMs.length,
    historyTimestampsMs,
    historyLatestClose: "120.00",
    historyBarMs: BAR_MS,
    historySource: SOURCES.BINANCE_MARKET_CANDLES,
    features: FEATURES.map((id) => ({ id, value: "1", sufficient: true })),
    regime: "TRENDING_UP",
    regimeDetail: "Trend UP.",
    regimeSufficient: true,
    dataQualityStatus: "GOOD",
    dataQualityHistoryPoints: 48,
    dataQualityLatestAgeMs: 1_000,
    dataQualityReferenceAgeMs: 1_000,
    dataQualityMissing: [],
    signals: [
      {
        strategyId: "momentum",
        strategyName: "Momentum",
        version: "1",
        action: "BUY",
        evaluation: "SIGNAL",
        confidence: 0.76,
        timestamp: AT,
        validUntil: new Date(NOW + BAR_MS).toISOString(),
        source: SOURCES.KAIROS_STRATEGY_ENGINE,
      },
    ],
    health: [],
    performance: [],
    externalRead: "PRESENT",
    externalError: null,
    externalSignals: [signal()],
    security: security(),
    securityObservedAt: AT,
    securityEvents: [],
    tokenizedStatus: null,
    position: noPosition(),
    positionConflict: null,
    researchTheses: [],
    researchCandidates: [],
    prior: null,
  };
  return { ...base, ...overrides };
}

function prior(overrides: Partial<ContextPrior> = {}): ContextPrior {
  return {
    session: "OPEN",
    regime: "TRENDING_UP",
    referenceFreshness: "FRESH",
    selectedStrategy: null,
    selectedAction: null,
    opportunity: "QUALIFIED",
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
    confidence: 0.76,
    evidence: ["1h return +1.20%.", "Close is above the 20-period average.", "Trend UP."],
    featuresUsed: ["return_1h", "sma_20", "trend"],
    tags: ["MOMENTUM"],
    validUntil: new Date(NOW + BAR_MS).toISOString(),
    signalTimestamp: AT,
    signalQuality: "GOOD",
  };
}

function scoreOf(context: KAIROSContext): number | null {
  return arbitrateAsset(arbitrationViewFromContext(context, NOW), [evaluation()]).score;
}

function rowFor(context: KAIROSContext): ObservationRow {
  return {
    id: "row-1",
    ticker: context.identity.underlyingTicker,
    companyName: context.identity.underlyingName,
    tokenSymbol: context.identity.tokenSymbol,
    platformLabel: "binance",
    chainLabel: context.identity.chainLabel,
    contractAddress: context.identity.contractAddress,
    chainId: context.identity.chainId,
    price: context.market.value?.price ?? null,
    referencePrice: context.reference.value?.referencePrice ?? null,
    deviationPct: context.reference.value?.deviationPct ?? null,
    change24hPct: null,
    session: "OPEN",
    sessionLabel: "Regular",
    rawMarketStatus: "TRADING",
    freshness: "FRESH",
    freshnessLabel: "Fresh",
    ageMs: 1_000,
    sourceTimestamp: AT,
    receivedAt: AT,
    volume24hUsd: null,
    nextOpenAt: null,
    reasonMessage: null,
    fidelity: "live",
    representationId: context.assetId,
    regime: "TRENDING_UP",
    regimeDetail: null,
    dataQuality: "GOOD",
    historyPoints: 48,
    features: [],
    signals: [],
    candles: [],
    arbitration: null,
    kairos: context,
  };
}

function thesis(items: ResearchThesis["supportingEvidence"]): ResearchThesis {
  return {
    thesisId: "thesis",
    userId: asUserId("user_a"),
    agentId: asAgentId("agent_a"),
    assetId: "56:0xabc",
    createdAt: AT,
    updatedAt: AT,
    title: "Check",
    summary: "A check.",
    hypothesis: {
      conditions: ["return_1h >= 50 bps"],
      session: "ANY",
      observationWindowBars: 4,
      testWindowBars: 4,
      expectedOutcome: "Forward return exceeds 20 bps.",
      invalidation: "return_1h < 0",
    },
    observations: [],
    assumptions: [],
    supportingEvidence: items,
    contradictingEvidence: [],
    requiredData: ["return_1h"],
    invalidationConditions: ["return_1h < 0"],
    riskConsiderations: [],
    confidence: 0.4,
    status: "VALIDATING",
    version: "1",
    provenance: {
      sourceType: "MOCK",
      provider: "mock",
      model: "mock",
      promptVersion: "1.1",
      createdAt: AT,
      contextTimestamp: AT,
      contextDataVersion: "test",
      configuredModel: false,
      requestId: "req",
      startedAt: AT,
      completedAt: AT,
      latencyMs: 0,
      status: "SUCCESS",
      errorCategory: null,
    },
    rejectionReasons: [],
  };
}

describe("context fusion", () => {
  beforeEach(() => {
    resetContextMemory();
  });

  it("builds the same context and the same arbitration from the same inputs", () => {
    const left = fuseContext(input());
    const right = fuseContext(input());
    expect(left).toEqual(right);
    expect(left.contextId).toBe("ctx:user_a:56:0xabc:cycle-1");
    expect(left.snapshotTimestamp).toBe(new Date(NOW).toISOString());
    expect(left.sourceTimestamps.market).toBe(AT);
    expect(left.walletAccess).toBe(false);
    expect(left.createsOrders).toBe(false);
    expect(left.quality).toBe("GOOD");
    expect(left.validation.admitsArbitration).toBe(true);
    const view = arbitrationViewFromContext(left, NOW);
    expect(arbitrateAsset(view, [evaluation()])).toEqual(arbitrateAsset(arbitrationViewFromContext(right, NOW), [evaluation()]));
    expect(restoreContext(serializeContext(left))).toEqual(left);
    expect(serializeContext(left)).not.toMatch(/privateKey|signature/);
  });

  it("keeps provenance and does not turn a missing slice into zero", () => {
    const context = fuseContext(input());
    expect(context.market.provenance.source).toBe(SOURCES.BINANCE_RWA_API);
    expect(context.regime.provenance.source).toBe(SOURCES.KAIROS_FEATURE_ENGINE);
    expect(context.externalSignals.provenance.source).toBe(SOURCES.BINANCE_TRADING_SIGNAL);
    expect(context.tokenSecurity.provenance.source).toBe(SOURCES.BINANCE_TOKEN_AUDIT);
    expect(context.strategySignals.provenance.source).toBe(SOURCES.KAIROS_STRATEGY_ENGINE);
    expect(context.positionContext.provenance.source).toBe(SOURCES.KAIROS_PAPER_LEDGER);
    expect(context.newsContext.status).toBe("UNAVAILABLE");
    expect(context.newsContext.value).toBeNull();
    expect(context.newsContext.reason).toBe("NOT_CONFIGURED");
    expect(context.earningsContext.status).toBe("UNAVAILABLE");
    expect(context.earningsContext.reason).toBe("NOT_CONFIGURED");
    expect(context.researchContext.status).toBe("UNAVAILABLE");
    expect(context.researchContext.value).toBeNull();
    expect(context.positionContext.value?.state).toBe("NO_POSITION");
    expect(context.positionContext.value?.quantity).toBeNull();
    expect(context.summaryText).toContain("NO POSITION");
    expect(context.summaryText).not.toMatch(/BUY NOW|because earnings/i);
  });

  it("blocks a missing or stale market and still arbitrates a degraded paper sample", () => {
    const missing = fuseContext(input({ price: null }));
    expect(missing.market.status).toBe("UNAVAILABLE");
    expect(missing.market.value).toBeNull();
    expect(missing.quality).toBe("BLOCKED");
    expect(missing.validation.admitsArbitration).toBe(false);
    expect(missing.opportunity.state).toBe("BLOCKED");

    const stale = fuseContext(input({ marketFreshness: "STALE", marketAgeMs: 500_000 }));
    expect(stale.market.status).toBe("STALE");
    expect(stale.market.freshness).toBe("STALE");
    expect(stale.quality).toBe("BLOCKED");
    expect(stale.validation.admitsArbitration).toBe(false);

    const paper = fuseContext(input({ fidelity: "paper", marketFreshness: "SAMPLE", marketAgeMs: null }));
    expect(paper.market.provenance.source).toBe(SOURCES.PAPER_SAMPLE);
    expect(paper.market.freshness).toBe("UNKNOWN");
    expect(paper.quality).toBe("DEGRADED");
    expect(paper.validation.admitsArbitration).toBe(true);
    expect(arbitrationViewFromContext(paper, NOW).freshness).toBe("SAMPLE");
  });

  it("keeps a stale optional source stale and does not let it confirm", () => {
    const stale = fuseContext(input({ externalSignals: [signal({ freshness: "STALE", signalAgeMs: 400_000 })] }));
    expect(stale.externalSignals.status).toBe("STALE");
    expect(stale.externalSignals.freshness).toBe("STALE");
    expect(stale.quality).toBe("DEGRADED");
    expect(stale.validation.admitsArbitration).toBe(true);
    expect(stale.opportunity.state).toBe("EMERGING");
    const decision = arbitrateAsset(arbitrationViewFromContext(stale, NOW), [evaluation()]);
    expect(decision.externalConfirmation).toBe("STALE");
    expect(decision.score).toBe(scoreOf(fuseContext(input())));

    const mixed = fuseContext(
      input({
        externalSignals: [signal(), signal({ id: "sig-old", freshness: "STALE", signalAgeMs: 400_000 })],
      }),
    );
    expect(mixed.externalSignals.freshness).toBe("STALE");
    expect(mixed.externalSignals.freshness).not.toBe("FRESH");

    const failed = fuseContext(input({ externalRead: "ERROR", externalError: "skill down", externalSignals: [] }));
    expect(failed.externalSignals.status).toBe("UNAVAILABLE");
    expect(failed.externalSignals.value).toBeNull();
    expect(failed.externalSignals.reason).toBe("skill down");
    expect(arbitrationViewFromContext(failed, NOW).externalSignals).toBeUndefined();
    expect(arbitrateAsset(arbitrationViewFromContext(failed, NOW), [evaluation()]).externalConfirmation).toBe("SOURCE_ERROR");
    expect(arbitrationViewFromContext(failed, NOW).externalAbsence).toBe("SOURCE_ERROR");
    expect(failed.quality).not.toBe("BLOCKED");
  });

  it("passes measured health only and does not let security or smart money raise the score", () => {
    expect(SCORE_WEIGHTS.strategyHealth).toBe(0.06);
    const plain = fuseContext(input());
    const unknown = fuseContext(
      input({
        health: [
          {
            strategyId: "momentum",
            strategyVersion: "1",
            status: "UNKNOWN",
            sample: "INSUFFICIENT",
            sampleSize: 0,
            expectancy: null,
            source: SOURCES.KAIROS_STRATEGY_HEALTH,
          },
        ],
      }),
    );
    expect(arbitrationViewFromContext(unknown, NOW).historicalHealth).toBeUndefined();
    expect(scoreOf(unknown)).toBe(scoreOf(plain));

    const measured = fuseContext(
      input({
        health: [
          {
            strategyId: "momentum",
            strategyVersion: "1",
            status: "DEGRADED",
            sample: "ESTABLISHED",
            sampleSize: 40,
            expectancy: "-1.00",
            source: SOURCES.KAIROS_STRATEGY_HEALTH,
          },
        ],
      }),
    );
    const measuredView = arbitrationViewFromContext(measured, NOW);
    expect(measuredView.historicalHealth?.momentum).toEqual({ status: "DEGRADED", sample: "ESTABLISHED" });
    const plainDecision = arbitrateAsset(arbitrationViewFromContext(plain, NOW), [evaluation()]);
    const measuredDecision = arbitrateAsset(measuredView, [evaluation()]);
    const plainCandidate = plainDecision.candidates.find((candidate) => candidate.strategyId === "momentum");
    const measuredCandidate = measuredDecision.candidates.find((candidate) => candidate.strategyId === "momentum");
    expect(measuredCandidate?.components.signalStrength).toBe(plainCandidate?.components.signalStrength);
    expect(measuredCandidate?.components.strategyHealth).toBeLessThan(plainCandidate?.components.strategyHealth ?? 1);
    expect(measuredDecision.evidence.summary).not.toMatch(/replaces the current signal/i);

    const blocked = fuseContext(input({ security: security({ gate: "BLOCK", label: "BLOCK", riskLevel: 5, riskLevelEnum: "HIGH" }) }));
    const blockedDecision = arbitrateAsset(arbitrationViewFromContext(blocked, NOW), [evaluation()]);
    expect(blockedDecision.decision).toBe("DATA_BLOCKED");
    expect(blockedDecision.selectedAction).toBeNull();
    expect(blockedDecision.score).toBe(plainDecision.score);
    expect(blocked.opportunity.state).toBe("BLOCKED");

    const absent = fuseContext(input({ externalRead: "ABSENT", externalSignals: [] }));
    expect(scoreOf(absent)).toBe(plainDecision.score);
    expect(arbitrateAsset(arbitrationViewFromContext(absent, NOW), [evaluation()]).externalConfirmation).toBe("SOURCE_UNAVAILABLE");
    const empty = fuseContext(input({ externalRead: "PRESENT", externalSignals: [] }));
    expect(arbitrateAsset(arbitrationViewFromContext(empty, NOW), [evaluation()]).externalConfirmation).toBe("NO_SIGNAL");
    expect(arbitrateAsset(arbitrationViewFromContext(plain, NOW), [evaluation()]).externalConfirmation).toBe("CONFIRMING_EVIDENCE");
    expect(plain.createsOrders).toBe(false);
  });

  it("keeps users, watchlists, and token representations apart", () => {
    const owner = fuseContext(input());
    const other = fuseContext(input({ userId: "user_b", agentId: "agent_b", externalRead: "ABSENT", externalSignals: [] }));
    expect(other.contextId).not.toBe(owner.contextId);
    expect(JSON.stringify(other)).not.toContain("sig-1");
    expect(other.userId).not.toBe(owner.userId);

    const outside = fuseContext(input({ watchlist: ["AAPL"] }));
    expect(outside.conflicts.some((conflict) => conflict.code === "WATCHLIST_EXCLUDED" && conflict.severity === "BLOCKING")).toBe(true);
    expect(outside.validation.admitsArbitration).toBe(false);
    expect(outside.quality).toBe("BLOCKED");

    const otherToken = fuseContext(
      input({
        identity: {
          underlyingTicker: "NVDA",
          underlyingName: "NVIDIA",
          representationId: "56:0xdef",
          tokenSymbol: "xNVDA",
          chainId: "56",
          chainLabel: "BSC",
          contractAddress: "0xdef",
        },
      }),
    );
    expect(otherToken.assetId).not.toBe(owner.assetId);
    expect(otherToken.identity.underlyingTicker).toBe("NVDA");
    expect(otherToken.conflicts.some((conflict) => conflict.code === "EXTERNAL_CONTRACT_MISMATCH")).toBe(true);
    expect(arbitrationViewFromContext(otherToken, NOW).externalSignals).toEqual([]);
    expect(otherToken.externalSignals.value?.signals[0]?.relevance).toBe("MISMATCH");

    const chain = fuseContext(input({ security: security({ chainId: "1" }) }));
    expect(chain.conflicts.some((conflict) => conflict.code === "CHAIN_MISMATCH" && conflict.severity === "BLOCKING")).toBe(true);
    expect(chain.validation.ok).toBe(false);
    expect(chain.validation.admitsArbitration).toBe(false);
    expect(validateKairosContext({ ...owner, assetId: "paper:NVDA" }, NOW).reasons).toContain("ASSET_MISMATCH");
  });

  it("records conflicts without discarding either source", () => {
    const reference = fuseContext(input({ referenceObservedAt: new Date(NOW - 20 * 60 * 1000).toISOString() }));
    expect(reference.conflicts.some((conflict) => conflict.code === "REFERENCE_TIMESTAMP_DIVERGENCE")).toBe(true);
    expect(reference.market.value?.price).toBe("120.00");
    expect(reference.reference.value?.referencePrice).toBe("119.50");
    expect(reference.reference.freshness).toBe("STALE");
    expect(reference.quality).toBe("DEGRADED");

    const stamps = input().historyTimestampsMs.filter((_, index) => index !== 10 && index !== 11);
    const gapped = fuseContext(input({ historyTimestampsMs: stamps }));
    expect(gapped.conflicts.some((conflict) => conflict.code === "HISTORY_TIMESTAMP_GAP")).toBe(true);
    expect(gapped.history.value?.points).toBe(48);

    const wrongBook = fuseContext(input({ positionConflict: "USER" }));
    expect(wrongBook.conflicts.some((conflict) => conflict.code === "POSITION_SCOPE_MISMATCH" && conflict.severity === "BLOCKING")).toBe(true);
    expect(wrongBook.positionContext.value).toBeNull();
    expect(wrongBook.validation.admitsArbitration).toBe(false);

    const wrongToken = fuseContext(
      input({
        positionConflict: "REPRESENTATION",
        position: { ...noPosition(), state: "OPEN", quantity: "2", notional: "600" },
      }),
    );
    expect(wrongToken.positionContext.status).toBe("UNAVAILABLE");
    expect(wrongToken.positionContext.value).toBeNull();
    expect(wrongToken.conflicts.some((conflict) => conflict.code === "POSITION_REPRESENTATION_MISMATCH")).toBe(true);
  });

  it("maps a tokenized-security restriction without inventing an earnings result", () => {
    const active = fuseContext(
      input({
        tokenizedStatus: {
          marketStatus: "ASSET_LIMITED",
          reasonCode: "ASSET_LIMITED",
          reasonMsg: "earnings",
          openState: false,
          nextOpenAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
          observedAt: AT,
          source: SOURCES.BINANCE_TOKENIZED_SECURITY,
        },
      }),
    );
    const event = active.eventContext.value?.events[0];
    expect(active.eventContext.value?.providerAnswered).toBe(true);
    expect(event?.type).toBe("EARNINGS");
    expect(event?.semantics.hypothesis).toBeNull();
    expect(event?.semantics.detected).toContain("reason=earnings");
    expect(event?.semantics.interpreted).toMatch(/result is not known/i);
    expect(event?.source).toBe(SOURCES.BINANCE_TOKENIZED_SECURITY);
    expect(event?.active).toBe(true);
    expect(active.earningsContext.status).toBe("UNAVAILABLE");
    expect(active.summaryText).toContain("EARNINGS — TRADING LIMITED");
    expect(active.summaryText).not.toMatch(/BUY BECAUSE/i);
    expect(active.createsOrders).toBe(false);

    const quiet = fuseContext(
      input({
        tokenizedStatus: {
          marketStatus: "TRADING",
          reasonCode: "TRADING",
          reasonMsg: null,
          openState: true,
          nextOpenAt: null,
          observedAt: AT,
          source: SOURCES.BINANCE_TOKENIZED_SECURITY,
        },
      }),
    );
    expect(quiet.eventContext.value?.providerAnswered).toBe(true);
    expect(quiet.eventContext.value?.events).toEqual([]);
    expect(quiet.summaryText).toContain("EVENT:\nNONE");

    const closed = fuseContext(
      input({
        tokenizedStatus: {
          marketStatus: "MARKET_CLOSED",
          reasonCode: "MARKET_CLOSED",
          reasonMsg: null,
          openState: false,
          nextOpenAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
          observedAt: AT,
          source: SOURCES.BINANCE_TOKENIZED_SECURITY,
        },
      }),
    );
    expect(closed.eventContext.value?.events[0]?.type).toBe("MARKET_STATUS_CHANGE");

    const expired = fuseContext(
      input({
        tokenizedStatus: {
          marketStatus: "ASSET_LIMITED",
          reasonCode: "ASSET_LIMITED",
          reasonMsg: "earnings",
          openState: false,
          nextOpenAt: new Date(NOW - 60_000).toISOString(),
          observedAt: new Date(NOW - DEFAULT_EVENT_TTL_MS).toISOString(),
          source: SOURCES.BINANCE_TOKENIZED_SECURITY,
        },
      }),
    );
    expect(expired.eventContext.value?.events).toEqual([]);
    expect(expired.conflicts.some((conflict) => conflict.code === "EVENT_EXPIRED" && conflict.severity === "NOTE")).toBe(true);
    expect(expired.earningsContext.status).toBe("UNAVAILABLE");
  });

  it("emits a transition only after a real change", () => {
    expect(fuseContext(input()).transitions).toEqual([]);
    const closed = fuseContext(input({ session: "CLOSED", sessionLabel: "Closed", prior: prior({ session: "OPEN" }) }));
    expect(closed.transitions.map((transition) => transition.label)).toContain("Market closed");
    const preopen = fuseContext(input({ session: "PRE_OPEN", prior: prior({ session: "CLOSED" }) }));
    expect(preopen.transitions.map((transition) => transition.label)).toContain("Market moved to pre-open");
    const opened = fuseContext(input({ session: "OPEN", prior: prior({ session: "PRE_OPEN" }) }));
    expect(opened.transitions.map((transition) => transition.label)).toContain("Market opened");
    const post = fuseContext(input({ session: "POST_CLOSE", prior: prior({ session: "OPEN" }) }));
    expect(post.transitions.map((transition) => transition.label)).toContain("Market moved to post-close");
    const done = fuseContext(input({ session: "CLOSED", prior: prior({ session: "POST_CLOSE" }) }));
    expect(done.transitions.map((transition) => transition.label)).toContain("Post-close ended");
    const unlabeled = fuseContext(input({ session: "PRE_OPEN", prior: prior({ session: "OPEN" }) }));
    expect(unlabeled.transitions.some((transition) => transition.kind === "SESSION")).toBe(false);

    const regime = fuseContext(input({ regime: "HIGH_VOLATILITY", prior: prior({ regime: "TRENDING_UP" }) }));
    expect(regime.transitions.map((transition) => transition.label)).toContain("Volatility regime changed");
    const opportunity = fuseContext(input({ security: null, prior: prior({ opportunity: "QUALIFIED" }) }));
    expect(opportunity.transitions.map((transition) => transition.label)).toContain("Opportunity state → BLOCKED");

    const context = fuseContext(input());
    writeContextPrior(context.userId, context.assetId, prior());
    const stored = noteStrategySelection(context, { selectedStrategy: "momentum", selectedAction: "BUY" } as ArbitrationDecision);
    expect(stored.transitions.some((transition) => transition.kind === "STRATEGY_SELECTION")).toBe(false);
    const changed = noteStrategySelection(context, { selectedStrategy: "mean-reversion", selectedAction: "HOLD" } as ArbitrationDecision);
    expect(changed.transitions.some((transition) => transition.kind === "STRATEGY_SELECTION")).toBe(true);
  });

  it("describes evidence maturity and keeps a closed session qualified when security passed", () => {
    const qualified = fuseContext(input({ session: "CLOSED", sessionLabel: "Closed" }));
    expect(qualified.opportunity.state).toBe("QUALIFIED");
    expect(qualified.opportunity.reason).toMatch(/not an order/i);
    expect(qualified.quality).toBe("GOOD");
    expect(qualified.summaryText).toContain("OPPORTUNITY:\nQUALIFIED");

    const unknown = fuseContext(input({ security: null }));
    expect(unknown.tokenSecurity.value?.label).toBe("UNKNOWN");
    expect(unknown.tokenSecurity.value?.gate).toBe("NOT_EVALUATED");
    expect(unknown.opportunity.state).toBe("BLOCKED");
    expect(unknown.opportunity.reason).toMatch(/Security state is unknown/);
    expect(unknown.opportunity.reason).not.toMatch(/PAPER_ONLY/);
    const paperUnverified = fuseContext(input({ fidelity: "paper", security: null, marketFreshness: "SAMPLE", marketAgeMs: null }));
    expect(paperUnverified.opportunity.state).not.toBe("BLOCKED");
    expect(paperUnverified.opportunity.reason).toMatch(/PAPER_ONLY/);
    expect(paperUnverified.opportunity.reason).toMatch(/SECURITY_UNVERIFIED/);
    const paperOpen = fuseContext(
      input({
        fidelity: "paper",
        security: null,
        marketFreshness: "SAMPLE",
        marketAgeMs: null,
        position: { ...noPosition(), state: "OPEN", quantity: "4", originStrategy: "momentum", lastDecision: "HOLD" },
      }),
    );
    expect(paperOpen.opportunity.state).toBe("MONITORING");
    expect(paperOpen.opportunity.reason).toMatch(/PAPER_ONLY/);
    const liveOpen = fuseContext(
      input({
        security: null,
        position: { ...noPosition(), state: "OPEN", quantity: "4", originStrategy: "momentum", lastDecision: "HOLD" },
      }),
    );
    expect(liveOpen.opportunity.state).toBe("BLOCKED");
    expect(liveOpen.opportunity.reason).toMatch(/LIVE_SECURITY_UNKNOWN/);
    expect(arbitrationViewFromContext(unknown, NOW).securityAssessment).toBeNull();
    expect(scoreOf(unknown)).toBe(scoreOf(fuseContext(input())));

    const open = fuseContext(
      input({
        position: {
          ...noPosition(),
          state: "OPEN",
          quantity: "5",
          averageEntry: "100",
          currentMark: "120",
          unrealizedPnL: "100",
          notional: "600",
          originStrategy: "momentum",
          openedAt: AT,
        },
      }),
    );
    expect(open.summaryText).toContain("$600 OPEN");
    expect(open.positionContext.value?.quantity).toBe("5");
  });

  it("gives research and the arbitrator the same context and refuses invented events", () => {
    const context = fuseContext(
      input({
        tokenizedStatus: {
          marketStatus: "ASSET_LIMITED",
          reasonCode: "ASSET_LIMITED",
          reasonMsg: "earnings",
          openState: false,
          nextOpenAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
          observedAt: AT,
          source: SOURCES.BINANCE_TOKENIZED_SECURITY,
        },
      }),
    );
    const research = buildResearchContext({
      userId: "user_a",
      agentId: "agent_a",
      row: rowFor(context),
      candles: [],
      watchlist: ["NVDA"],
      dataSource: "MOCK_FIXTURE",
      nowMs: NOW,
    });
    expect(research.context.contextId).toBe(context.contextId);
    expect(research.context.eventContext.events[0]?.semantics).toBe("OBSERVED_EVENT");
    expect(research.context.eventContext.events[0]?.hypothesis).toBeNull();
    expect(research.context.newsContext.status).toBe("UNAVAILABLE");
    expect(research.context.newsContext.items).toBeNull();
    expect(research.context.earningsContext.expectedEarningsDate).toBeNull();
    expect(research.context.earningsContext.actualEps).toBeNull();
    expect(research.context.positionContext?.state).toBe("NO_POSITION");
    expect(research.context.positionContext?.quantity).toBeNull();

    const eventId = research.context.eventContext.events[0]?.eventId ?? "";
    expect(validateEvidenceAgainstContext(thesis([{ kind: "OBSERVED_EVENT", statement: "ASSET_LIMITED reason=earnings", source: eventId }]), research.context).ok).toBe(true);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "HYPOTHESIS", statement: "Post-event behavior may differ.", source: null }]), research.context).ok).toBe(true);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "OBSERVED_EVENT", statement: "ASSET_LIMITED", source: "evt:made-up" }]), research.context).ok).toBe(false);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "MODEL_INFERENCE", statement: "The actual EPS was 1.20.", source: null }]), research.context).ok).toBe(false);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "HYPOTHESIS", statement: "There is no news.", source: null }]), research.context).ok).toBe(false);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "OBSERVED_NEWS", statement: "Company announced a product.", source: "missing-news" }]), research.context).ok).toBe(false);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "OBSERVED_EARNINGS", statement: "EPS was 9.99 on 2026-01-01.", source: "missing-earnings" }]), research.context).ok).toBe(false);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "HYPOTHESIS", statement: "There is no relevant news.", source: null }]), research.context).ok).toBe(false);
    expect(validateEvidenceAgainstContext(thesis([{ kind: "OBSERVED_EVENT", statement: "The upcoming earnings date is Friday.", source: eventId }]), research.context).ok).toBe(false);
    expect(QWEN_THESIS_PROMPT_VERSION).toBe("1.1");
    expect(QWEN_RESEARCH_INSTRUCTIONS).toMatch(/OBSERVED_EVENT/);
    expect(QWEN_RESEARCH_INSTRUCTIONS).toMatch(/not an earnings result/);

    const view = arbitrationViewFromContext(context, NOW);
    expect(view.userId).toBe(context.userId);
    expect(view.asset.id).toBe(context.assetId);
    expect(view.priorSelection).toBeNull();
    const decision = arbitrateAsset(view, [evaluation()]);
    expect(decision.loopPhase).toBe("WAITING_FOR_RISK");
    const withWindow = arbitrateAsset({ ...view, eventWindow: "PRE_EVENT", eventContextStatus: "AVAILABLE" }, [evaluation()]);
    expect(withWindow.candidates.map((candidate) => candidate.score)).toEqual(decision.candidates.map((candidate) => candidate.score));
    expect(context.createsOrders).toBe(false);
  });

  it("labels a mock event and keeps the paper board on the same context", () => {
    const mocked: MarketEvent = {
      eventId: "evt:mock",
      assetId: "56:0xabc",
      type: "VOLATILITY_EVENT",
      status: "MOCK",
      source: "MOCK",
      observedAt: AT,
      effectiveAt: AT,
      expiresAt: new Date(NOW + 60_000).toISOString(),
      confidence: null,
      severity: "INFO",
      reason: null,
      details: "MOCK volatility",
      semantics: { detected: "MOCK volatility", interpreted: null, hypothesis: null },
      freshness: "FRESH",
      origin: "REAL",
      active: true,
    };
    const context = fuseContext(input({ eventProvider: mockEventProvider([mocked]) }));
    expect(context.eventContext.value?.events[0]?.origin).toBe("MOCK");
    expect(context.timeline.some((entry) => entry.origin === "MOCK")).toBe(true);

    const board = buildPaperObservation("user_demo", new Date(NOW));
    const tsla = board.board.rows.find((row) => row.ticker === "TSLA");
    expect(tsla?.kairos?.assetId).toBe("paper:TSLA");
    expect(tsla?.kairos?.assetId).not.toBe("TSLA");
    expect(tsla?.kairos?.newsContext.status).toBe("UNAVAILABLE");
    expect(tsla?.kairos?.eventContext.status).toBe("UNAVAILABLE");
    expect(tsla?.kairos?.timeline.some((entry) => entry.origin === "UNAVAILABLE")).toBe(true);
    expect(tsla?.kairos?.createsOrders).toBe(false);
    expect(tsla?.kairos?.walletAccess).toBe(false);
    expect(tsla?.kairos?.validation.admitsArbitration).toBe(true);
    expect(tsla?.arbitration).not.toBeNull();
    expect(buildPaperObservation("user_b", new Date(NOW)).board.rows).toHaveLength(0);
    expect(POSITION_MANAGER_IMPLEMENTED).toBe(true);
  });

  it("does not import a wallet or a broadcast, and the cycle calls the position manager", () => {
    for (const file of ["context/fusion.ts", "context/service.ts", "context/events.ts", "context/arbitration-view.ts", "observation/analyze.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/@\/wallet/);
      expect(source).not.toMatch(/broadcastTransaction/);
      expect(source).not.toMatch(/signTransaction/);
      expect(source).not.toMatch(/LiveExecutionGateway/);
    }
    const cycle = readFileSync("paper/cycle.ts", "utf8");
    expect(cycle).toMatch(/deterministicPositionManager/);
    expect(cycle).not.toMatch(/@\/wallet/);
    expect(cycle).not.toMatch(/LiveExecutionGateway/);
    expect(cycle).not.toMatch(/generateExitIntent/);
    expect(cycle).not.toMatch(/evaluateThesisInvalidation/);
  });
});
