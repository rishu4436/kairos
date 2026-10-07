import { formatDecimal } from "@/domain/money";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { blankIntelligence } from "@/observation/board";
import { setPaperObservationInput } from "@/observation/paper";
import { resetMarketStores } from "@/observation/stores";
import { createDemoSession } from "@/test/fixtures/sample-session";
import { buildPaperSeries } from "@/test/fixtures/paper-series";

/** Synthetic market inputs belong to tests, never application startup. */
export function seedPaperMarketFixture(): void {
  setPaperObservationInput(DEMO_USER_ID, (now) => {
    const rows = createDemoSession().watchlist.map((item) => ({
      id: `paper:${item.asset.ticker}`, ticker: item.asset.ticker, companyName: item.asset.name,
      tokenSymbol: item.asset.tokenizedSymbol, platformLabel: "Test fixture", chainLabel: "Not resolved",
      contractAddress: null, price: formatDecimal(item.price, 2), referencePrice: null, deviationPct: null,
      change24hPct: item.change24hBps / 100, session: "UNKNOWN" as const, sessionLabel: "UNKNOWN",
      rawMarketStatus: null, freshness: "SAMPLE" as const, freshnessLabel: "SAMPLE", ageMs: null,
      sourceTimestamp: null, receivedAt: now.toISOString(), volume24hUsd: null, nextOpenAt: null,
      reasonMessage: null, fidelity: "paper" as const, representationId: `paper:${item.asset.ticker}`,
      ...blankIntelligence(),
    }));
    const candles = new Map(rows.map((row) => [row.representationId, buildPaperSeries(row.ticker, row.price, now.getTime())]));
    return { rows, candles };
  });
}

export function resetTestMarketStores(): void {
  resetMarketStores();
  seedPaperMarketFixture();
}
