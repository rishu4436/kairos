import type { MarketEvent } from "@/context/types";
import type { CorrelatedMarketEvent, EarningsEvent } from "@/events/model";
import { earningsWindow } from "@/events/window";
import type { EventTradingPolicy } from "@/events/policy";

/**
 * A Binance restriction and an FMP earnings date corroborate only when both exist
 * and the earnings date falls in the policy window around the Binance effective time.
 * Otherwise the records stay independent. No correlation is invented.
 */
export function correlateEvents(input: {
  ticker: string;
  earnings: EarningsEvent | null;
  binanceEvents: readonly MarketEvent[];
  policy: EventTradingPolicy;
}): CorrelatedMarketEvent[] {
  const earningsId = input.earnings?.eventId ?? null;
  const related = input.binanceEvents.filter(isEarningsRestriction);
  if (related.length === 0 && earningsId === null) {
    return [];
  }
  if (related.length === 0) {
    return [independent(input.ticker, null, earningsId)];
  }
  return related.map((event) => {
    const window = input.earnings?.reportedDate
      ? earningsWindow(input.earnings.reportedDate, Date.parse(event.effectiveAt), input.policy)
      : null;
    const corroborated = earningsId !== null && window !== null && window !== "NORMAL";
    return {
      correlationId: `corr:${input.ticker}:${event.eventId}:${earningsId ?? "none"}`,
      state: corroborated ? "CORROBORATED" : "INDEPENDENT",
      underlyingTicker: input.ticker,
      binanceEventId: event.eventId,
      earningsEventId: corroborated ? earningsId : earningsId,
      window: corroborated ? window : null,
    };
  });
}

function isEarningsRestriction(event: MarketEvent): boolean {
  const reason = event.reason?.toLowerCase() ?? "";
  return event.type === "EARNINGS" || reason === "earnings";
}

function independent(ticker: string, binanceEventId: string | null, earningsEventId: string | null): CorrelatedMarketEvent {
  return {
    correlationId: `corr:${ticker}:${binanceEventId ?? "none"}:${earningsEventId ?? "none"}`,
    state: "INDEPENDENT",
    underlyingTicker: ticker,
    binanceEventId,
    earningsEventId,
    window: null,
  };
}
