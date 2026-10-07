import { createHash } from "node:crypto";
import type { CompanyNewsItem, NewsFreshness } from "@/events/model";
import { NEWS_SNIPPET_MAX, newsContextLimit, newsFreshMs } from "@/events/policy";

export function newsFreshness(publishedAt: string, nowMs: number): NewsFreshness | null {
  const at = Date.parse(publishedAt);
  if (!Number.isFinite(at)) {
    return null;
  }
  const age = nowMs - at;
  if (age < 0) {
    return null;
  }
  const limits = newsFreshMs();
  if (age < limits.fresh) {
    return "FRESH";
  }
  if (age < limits.recent) {
    return "RECENT";
  }
  if (age < limits.aging) {
    return "AGING";
  }
  return "STALE";
}

export function newsIdFor(input: { id: string | null; url: string | null; headline: string; publishedAt: string; ticker: string }): string {
  if (input.id && input.id.trim().length > 0) {
    return `fmp:news:${input.id.trim()}`;
  }
  const key = input.url && input.url.trim().length > 0
    ? normalizeUrl(input.url)
    : `${normalizeHeadline(input.headline)}|${input.publishedAt}|${input.ticker}`;
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `fmp:news:${digest}`;
}

export function clipSnippet(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.length <= NEWS_SNIPPET_MAX ? trimmed : trimmed.slice(0, NEWS_SNIPPET_MAX);
}

/** Latest influencing headlines. Stale rows stay in `archive` and leave the current list. */
export function selectCurrentNews(archive: readonly CompanyNewsItem[]): { current: CompanyNewsItem[]; historicalCount: number } {
  const unique = dedupeNews(archive);
  const current = unique
    .filter((item) => item.freshness !== "STALE")
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, newsContextLimit());
  return { current, historicalCount: unique.length };
}

export function dedupeNews(items: readonly CompanyNewsItem[]): CompanyNewsItem[] {
  const byId = new Map<string, CompanyNewsItem>();
  for (const item of items) {
    const prior = byId.get(item.newsId);
    if (!prior || Date.parse(item.publishedAt) >= Date.parse(prior.publishedAt)) {
      byId.set(item.newsId, item);
    }
  }
  return [...byId.values()];
}

function normalizeHeadline(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}
