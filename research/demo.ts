import { CANDLE_INTERVAL_MS, type Candle } from "@/domain/candle";
import { asAgentId, asUserId } from "@/domain/ids";
import { divRound, parseDecimal, SCALE } from "@/domain/money";
import { MockReasoningProvider } from "@/research/mock-provider";
import { runResearchDraft } from "@/research/pipeline";
import type { ResearchBar } from "@/research/snapshot";
import { researchStore } from "@/research/store";
import { unavailableResearchBoundaries, type ResearchContext } from "@/research/types";
import { DEMO_USER_ID } from "@/domain/watchlist";

const DEMO_AGENT = "agent_demo";
let seededFor: string | null = null;

/** One deterministic mock draft for the demo user. It does not touch the paper trading book. */
export async function ensureDemoResearch(nowMs = Date.parse("2026-10-04T15:00:00.000Z")): Promise<void> {
  const userId = asUserId(DEMO_USER_ID);
  if (seededFor === `${userId}:${nowMs}` && researchStore().listTheses(userId).length > 0) {
    return;
  }
  if (researchStore().listTheses(userId).length > 0) {
    seededFor = `${userId}:${nowMs}`;
    return;
  }
  await runResearchDraft({
    provider: new MockReasoningProvider(),
    context: demoContext(),
    store: researchStore(),
    bars: demoBars(),
    dataset: "deterministic_research_sample",
    dataSource: "MOCK_FIXTURE",
    contextTimestamp: new Date(nowMs).toISOString(),
    contextDataVersion: "mock:NVDA:40",
    initialCapital: parseDecimal("10000"),
    nowMs,
    userId,
    agentId: asAgentId(DEMO_AGENT),
  });
  seededFor = `${userId}:${nowMs}`;
}

export function resetDemoResearch(): void {
  seededFor = null;
}

function demoContext(): ResearchContext {
  return {
    userId: DEMO_USER_ID,
    agentId: DEMO_AGENT,
    assetId: "paper:NVDA",
    ticker: "NVDA",
    watchlist: ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "SPY"],
    observation: { price: "100.00", session: "CLOSED", regime: "UNKNOWN", freshness: "SAMPLE" },
    features: [{ id: "return_1h", value: null, bps: null }],
    signals: [],
    arbitration: { decision: "NO_OPPORTUNITY", action: null },
    paperPerformance: null,
    priorExperiments: [],
    contextId: null,
    ...unavailableResearchBoundaries(),
  };
}

export function demoBars(): ResearchBar[] {
  let close = parseDecimal("100");
  const start = Date.parse("2026-01-01T14:30:00.000Z");
  const bars: ResearchBar[] = [];
  for (let index = 0; index < 40; index += 1) {
    const open = close;
    if (index < 28) {
      close = divRound(close * 10_030n, 10_000n);
    }
    const upper = open > close ? open : close;
    const lower = open < close ? open : close;
    const candle: Candle = {
      timestampMs: start + index * CANDLE_INTERVAL_MS,
      open,
      high: upper + SCALE,
      low: lower > SCALE ? lower - SCALE : 1n,
      close,
      volume: 1_000n * SCALE,
      tradeCount: 4,
    };
    bars.push({ candle, session: "CLOSED", referenceDeviationBps: null });
  }
  return bars;
}
