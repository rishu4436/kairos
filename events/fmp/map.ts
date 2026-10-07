import type { CompanyNewsItem, EarningsEvent, EarningsState, ReportTiming } from "@/events/model";
import { newsFreshness, newsIdFor, clipSnippet } from "@/events/news";
import { surprise } from "@/events/surprise";

const TIMING: Readonly<Record<string, ReportTiming>> = {
  bmo: "BEFORE_OPEN",
  amc: "AFTER_CLOSE",
};

export interface MappedEarnings {
  events: EarningsEvent[];
  invalid: boolean;
}

export function mapEarningsPayload(body: unknown, ticker: string, observedAt: string, nowMs: number): MappedEarnings {
  if (!Array.isArray(body)) {
    return { events: [], invalid: true };
  }
  const events: EarningsEvent[] = [];
  for (const row of body) {
    if (!isRecord(row)) {
      return { events: [], invalid: true };
    }
    const symbol = text(row.symbol);
    if (symbol === null || symbol.toUpperCase() !== ticker) {
      continue;
    }
    const reportedDate = dateText(row.date);
    const epsEstimated = decimalText(row.epsEstimated);
    const epsActual = decimalText(row.epsActual);
    const revenueEstimated = decimalText(row.revenueEstimated);
    const revenueActual = decimalText(row.revenueActual);
    const eps = surprise(epsActual, epsEstimated);
    const revenue = surprise(revenueActual, revenueEstimated);
    events.push({
      eventId: `fmp:earnings:${ticker}:${reportedDate ?? "undated"}:${events.length}`,
      underlyingTicker: ticker,
      reportedDate,
      reportTime: reportTime(row.time),
      status: earningsState(reportedDate, epsActual, revenueActual, nowMs),
      epsEstimated,
      epsActual,
      revenueEstimated,
      revenueActual,
      epsSurprise: eps.absolute,
      epsSurprisePct: eps.percent,
      revenueSurprise: revenue.absolute,
      revenueSurprisePct: revenue.percent,
      source: "FMP",
      sourceUpdatedAt: dateTimeText(row.lastUpdated),
      observedAt,
    });
  }
  return { events, invalid: false };
}

export interface MappedNews {
  items: CompanyNewsItem[];
  invalid: boolean;
}

export function mapNewsPayload(body: unknown, ticker: string, observedAt: string, nowMs: number): MappedNews {
  if (!Array.isArray(body)) {
    return { items: [], invalid: true };
  }
  const items: CompanyNewsItem[] = [];
  for (const row of body) {
    if (!isRecord(row)) {
      return { items: [], invalid: true };
    }
    const symbol = text(row.symbol);
    if (symbol !== null && symbol.toUpperCase() !== ticker) {
      continue;
    }
    const headline = text(row.title);
    const publishedAt = dateTimeText(row.publishedDate);
    if (headline === null || publishedAt === null) {
      continue;
    }
    const freshness = newsFreshness(publishedAt, nowMs);
    if (freshness === null) {
      continue;
    }
    const url = text(row.url);
    items.push({
      newsId: newsIdFor({ id: text(row.id), url, headline, publishedAt, ticker }),
      underlyingTicker: ticker,
      headline,
      snippet: clipSnippet(text(row.text)),
      publisher: text(row.publisher) ?? text(row.site),
      publishedAt,
      url,
      imageUrl: text(row.image),
      provider: "FMP",
      observedAt,
      freshness,
    });
  }
  return { items, invalid: false };
}

export function selectEarnings(events: readonly EarningsEvent[], nowMs: number): EarningsEvent | null {
  const dated = events.filter((event) => event.reportedDate !== null);
  if (dated.length === 0) {
    return events[0] ?? null;
  }
  const today = Date.parse(new Date(nowMs).toISOString().slice(0, 10) + "T00:00:00.000Z");
  return [...dated].sort((left, right) => {
    const leftMs = Date.parse(`${left.reportedDate}T00:00:00.000Z`);
    const rightMs = Date.parse(`${right.reportedDate}T00:00:00.000Z`);
    const leftDistance = Math.abs(leftMs - today);
    const rightDistance = Math.abs(rightMs - today);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return rightMs - leftMs;
  })[0] ?? null;
}

function earningsState(date: string | null, epsActual: string | null, revenueActual: string | null, nowMs: number): EarningsState {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (date === today) {
    return "TODAY";
  }
  if (epsActual !== null || revenueActual !== null) {
    return "REPORTED";
  }
  if (date !== null && date > today) {
    return "UPCOMING";
  }
  return "UNKNOWN";
}

function reportTime(value: unknown): ReportTiming {
  const raw = text(value);
  if (raw === null) {
    return "UNKNOWN";
  }
  return TIMING[raw.toLowerCase()] ?? "UNKNOWN";
}

function decimalText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return trimNumber(value);
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function trimNumber(value: number): string {
  const textValue = value.toString();
  if (!/e/i.test(textValue)) {
    return textValue;
  }
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function dateText(value: unknown): string | null {
  const raw = text(value);
  return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function dateTimeText(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
