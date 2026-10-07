import type { ArbitrationDecision } from "@/domain/arbitration";
import { freshnessLabel } from "@/domain/freshness";
import type { ChartBar, FeatureView, MarketObservationRecord, ObservationBoard, ObservationEventView, ObservationRow, SignalView } from "@/domain/observation";
import { sessionLabel } from "@/domain/session-state";
import { formatClock } from "@/lib/format";

export function rowFromLive(record: MarketObservationRecord): ObservationRow {
  return {
    id: record.id,
    ticker: record.underlying.ticker,
    companyName: record.underlying.name,
    tokenSymbol: record.representation.tokenSymbol,
    platformLabel: record.representation.platformLabel,
    chainLabel: record.representation.chainLabel,
    contractAddress: record.representation.contractAddress,
    chainId: record.representation.chainId,
    reasonCode: record.reasonCode,
    openState: record.openState,
    price: record.price,
    referencePrice: record.referencePrice,
    deviationPct: record.priceDeviation?.percent ?? null,
    change24hPct: null,
    session: record.marketSession,
    sessionLabel: sessionLabel(record.marketSession, record.rawMarketStatus),
    rawMarketStatus: record.rawMarketStatus,
    freshness: record.freshness.status,
    freshnessLabel: freshnessLabel(record.freshness.status, record.freshness.ageMs, "live"),
    ageMs: record.freshness.ageMs,
    sourceTimestamp: record.freshness.sourceTimestamp,
    receivedAt: record.freshness.receivedAt,
    volume24hUsd: record.liquidity.volume24hUsd,
    nextOpenAt: record.nextOpenAt,
    reasonMessage: record.reasonMessage,
    fidelity: "live",
    representationId: record.representation.id,
    ...blankIntelligence(),
  };
}

export function blankIntelligence(): {
  regime: string;
  regimeDetail: string | null;
  dataQuality: null;
  historyPoints: number;
  features: FeatureView[];
  signals: SignalView[];
  candles: ChartBar[];
  arbitration: ArbitrationDecision | null;
} {
  return {
    regime: "UNKNOWN",
    regimeDetail: null,
    dataQuality: null,
    historyPoints: 0,
    features: [],
    signals: [],
    candles: [],
    arbitration: null,
  };
}

export function observationEvents(rows: readonly ObservationRow[], at: string): ObservationEventView[] {
  const events: ObservationEventView[] = [
    { id: `${at}:snapshot`, at, clock: formatClock(at), type: "MARKET_OBSERVED", message: "Market snapshot received" },
  ];
  for (const row of rows.slice(0, 12)) {
    events.push({
      id: `${at}:${row.id}:updated`,
      at,
      clock: formatClock(at),
      type: "MARKET_OBSERVED",
      message: `${row.ticker} observation updated`,
    });
    if (row.deviationPct !== null) {
      events.push({
        id: `${at}:${row.id}:deviation`,
        at,
        clock: formatClock(at),
        type: "MARKET_OBSERVED",
        message: "Reference deviation calculated",
      });
    }
    events.push({
      id: `${at}:${row.id}:session`,
      at,
      clock: formatClock(at),
      type: "MARKET_OBSERVED",
      message: `Market status: ${row.sessionLabel}`,
    });
  }
  events.push({
    id: `${at}:accepted`,
    at,
    clock: formatClock(at),
    type: "MARKET_OBSERVED",
    message: "Observation accepted by KAIROS",
  });
  return events;
}

export function emptyHealth(lastSuccessAt: string | null): ObservationBoard["health"] {
  return {
    connection: "offline",
    reason: null,
    httpStatus: null,
    lastSuccessAt,
    rwa: "skipped",
    market: "skipped",
    history: "skipped",
  };
}
