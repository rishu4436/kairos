import type { EventProvider, EventReadInput, EventReadResult, TokenizedStatusInput } from "@/context/providers";
import { SOURCES } from "@/context/sources";
import type { ContextFreshnessState, MarketEvent, MarketEventType } from "@/context/types";

/** A restriction without an explicit end time leaves the active set after one day. */
export const DEFAULT_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

const CORPORATE: Readonly<Record<string, MarketEventType>> = {
  earnings: "EARNINGS",
  cash_dividend: "DIVIDEND",
  stock_dividend: "DIVIDEND",
  dividend: "DIVIDEND",
  stock_split: "STOCK_SPLIT",
  merger: "MERGER",
  acquisition: "ACQUISITION",
  spinoff: "SPINOFF",
  maintenance: "MAINTENANCE",
};

const RESTRICTION_CODES = new Set(["ASSET_PAUSED", "ASSET_LIMITED", "MARKET_CLOSED", "pause"]);

/**
 * Maps a Binance tokenized-security status that was already fetched.
 * It does not call the network. A missing reason does not become an earnings event.
 * An earnings reason is a restriction. It is not a result and not a date.
 */
export const binanceTokenizedSecurityEventProvider: EventProvider = {
  id: "BinanceTokenizedSecurityEventProvider",
  read(input) {
    return readBinanceTokenizedStatus(input);
  },
};

export function readBinanceTokenizedStatus(input: EventReadInput): EventReadResult {
  if (!input.tokenizedStatus) {
    return {
      status: "UNAVAILABLE",
      providerAnswered: false,
      events: [],
      reason: "No tokenized-security status was supplied for this cycle.",
    };
  }
  const event = eventFromStatus(input.assetId, input.tokenizedStatus, input.nowMs);
  return {
    status: "AVAILABLE",
    providerAnswered: true,
    events: event ? [event] : [],
    reason: event ? null : "The provider status did not include an event.",
  };
}

/** Test double. It returns only the events it was given and labels them MOCK. */
export function mockEventProvider(events: readonly MarketEvent[]): EventProvider {
  return {
    id: "MockEventProvider",
    read(input) {
      const stamped = events
        .filter((event) => event.assetId === input.assetId)
        .map((event) => ({ ...event, origin: "MOCK" as const }));
      return {
        status: "AVAILABLE",
        providerAnswered: true,
        events: stamped.map((event) => withExpiry(event, input.nowMs)),
        reason: null,
      };
    },
  };
}

export function marketEventsFromSecurity(
  events: readonly { eventType: string | null; status: string | null; effectiveTime: string | null; source: string; assetId: string | null }[],
  assetId: string,
  nowMs: number,
): MarketEvent[] {
  const mapped: MarketEvent[] = [];
  for (const event of events) {
    if (event.assetId !== null && event.assetId !== assetId) {
      continue;
    }
    const reason = event.eventType?.trim().toLowerCase() ?? null;
    const corporate = reason !== null ? CORPORATE[reason] : undefined;
    if (!corporate && reason === null) {
      continue;
    }
    const type = corporate ?? "TRADING_RESTRICTION";
    const observedAt = new Date(nowMs).toISOString();
    const explicitEnd = event.effectiveTime === null ? null : Date.parse(event.effectiveTime);
    const expiresAt =
      explicitEnd !== null && Number.isFinite(explicitEnd) ? event.effectiveTime ?? observedAt : new Date(nowMs + DEFAULT_EVENT_TTL_MS).toISOString();
    const draft: MarketEvent = {
      eventId: `evt:${assetId}:${type}:${reason ?? "security"}:${observedAt}`,
      assetId,
      type,
      status: event.status ?? "UNKNOWN",
      source: event.source,
      observedAt,
      effectiveAt: observedAt,
      expiresAt,
      confidence: null,
      severity: "RESTRICTION",
      reason: corporate ? reason : null,
      details: [event.status, reason ? `reason=${reason}` : null].filter((part): part is string => part !== null).join(" "),
      semantics: {
        detected: [event.status, reason ? `reason=${reason}` : null].filter((part): part is string => part !== null).join(" "),
        interpreted: interpretedLabel(type, corporate ? reason : null, event.status),
        hypothesis: null,
      },
      freshness: "UNKNOWN",
      origin: "REAL",
      active: false,
    };
    mapped.push(withExpiry(draft, nowMs));
  }
  return mapped;
}

export function activeEvents(events: readonly MarketEvent[], nowMs: number): MarketEvent[] {
  return events.filter((event) => isActive(event, nowMs));
}

export function isActive(event: MarketEvent, nowMs: number): boolean {
  const start = Date.parse(event.effectiveAt);
  const end = Date.parse(event.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  return nowMs >= start && nowMs < end;
}

function eventFromStatus(assetId: string, status: TokenizedStatusInput, nowMs: number): MarketEvent | null {
  const reason = normalizeToken(status.reasonMsg);
  const code = normalizeToken(status.reasonCode);
  const marketStatus = normalizeToken(status.marketStatus);
  const corporate = reason !== null ? CORPORATE[reason] : undefined;
  const restriction = code !== null && RESTRICTION_CODES.has(code);
  const paused = marketStatus !== null && RESTRICTION_CODES.has(marketStatus);
  if (!corporate && !restriction && !paused) {
    return null;
  }
  const type: MarketEventType = corporate ?? (restriction || paused ? "TRADING_RESTRICTION" : "OTHER");
  if (!corporate && code === "MARKET_CLOSED") {
    return finish(assetId, "MARKET_STATUS_CHANGE", status, nowMs, code, reason);
  }
  return finish(assetId, type, status, nowMs, code, reason);
}

function finish(
  assetId: string,
  type: MarketEventType,
  status: TokenizedStatusInput,
  nowMs: number,
  code: string | null,
  reason: string | null,
): MarketEvent {
  const observedAt = status.observedAt ?? new Date(nowMs).toISOString();
  const effectiveAt = observedAt;
  const expiresAt = status.nextOpenAt ?? new Date(Date.parse(observedAt) + DEFAULT_EVENT_TTL_MS).toISOString();
  const providerStatus = status.marketStatus ?? status.reasonCode ?? "UNKNOWN";
  const detectedParts = [code, reason ? `reason=${reason}` : null, status.marketStatus ? `marketStatus=${status.marketStatus}` : null].filter(
    (part): part is string => part !== null,
  );
  const detected = detectedParts.join(" ");
  const event: MarketEvent = {
    eventId: `evt:${assetId}:${type}:${reason ?? code ?? "status"}:${observedAt}`,
    assetId,
    type,
    status: providerStatus,
    source: status.source || SOURCES.BINANCE_TOKENIZED_SECURITY,
    observedAt,
    effectiveAt,
    expiresAt,
    confidence: null,
    severity: type === "MARKET_STATUS_CHANGE" ? "INFO" : "RESTRICTION",
    reason,
    details: detected,
    semantics: {
      detected,
      interpreted: interpretedLabel(type, reason, code),
      hypothesis: null,
    },
    freshness: freshnessAt(observedAt, nowMs),
    origin: "REAL",
    active: false,
  };
  return withExpiry(event, nowMs);
}

function withExpiry(event: MarketEvent, nowMs: number): MarketEvent {
  const active = isActive(event, nowMs);
  return { ...event, active, freshness: active ? event.freshness : "STALE" };
}

function interpretedLabel(type: MarketEventType, reason: string | null, code: string | null): string | null {
  if (type === "EARNINGS") {
    return "Earnings-related trading restriction. The earnings result is not known.";
  }
  if (type === "DIVIDEND") {
    return "Dividend-related trading restriction. The dividend terms are not known.";
  }
  if (type === "STOCK_SPLIT") {
    return "Stock-split trading restriction. The split terms are not known.";
  }
  if (type === "MERGER") {
    return "Merger-related trading restriction. The merger terms are not known.";
  }
  if (type === "ACQUISITION") {
    return "Acquisition-related trading restriction. The acquisition terms are not known.";
  }
  if (type === "SPINOFF") {
    return "Spinoff-related trading restriction. The spinoff terms are not known.";
  }
  if (type === "MAINTENANCE") {
    return "Maintenance-related trading restriction.";
  }
  if (type === "MARKET_STATUS_CHANGE") {
    return code ? `Market status reported as ${code}.` : null;
  }
  if (type === "TRADING_RESTRICTION") {
    return reason ? `Trading restriction reported with reason ${reason}.` : code ? `Trading restriction reported as ${code}.` : null;
  }
  return null;
}

function freshnessAt(observedAt: string, nowMs: number): ContextFreshnessState {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) {
    return "UNKNOWN";
  }
  const age = nowMs - observed;
  if (age < 0) {
    return "UNKNOWN";
  }
  if (age < 30 * 60 * 1000) {
    return "FRESH";
  }
  if (age < 6 * 60 * 60 * 1000) {
    return "AGING";
  }
  return "STALE";
}

function normalizeToken(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
