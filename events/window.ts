import type { EarningsWindow, EventRiskContext } from "@/events/model";
import type { EventTradingPolicy } from "@/events/policy";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calendar-day window against the cycle clock in UTC.
 * PRE_EVENT is 1..preEventDays before the reported date.
 * EVENT_DAY is the same UTC date.
 * POST_EVENT is the first postEventDays after that date.
 */
export function earningsWindow(reportedDate: string | null, nowMs: number, policy: EventTradingPolicy): EarningsWindow {
  const eventDay = calendarDay(reportedDate);
  const today = calendarDay(new Date(nowMs).toISOString().slice(0, 10));
  if (eventDay === null || today === null) {
    return "NORMAL";
  }
  const delta = eventDay - today;
  if (delta === 0) {
    return "EVENT_DAY";
  }
  if (delta > 0 && delta <= policy.preEventDays) {
    return "PRE_EVENT";
  }
  if (delta < 0 && -delta <= policy.postEventDays) {
    return "POST_EVENT";
  }
  return "NORMAL";
}

export function eventRisk(window: EarningsWindow, corporateRestrictionActive: boolean): EventRiskContext {
  const elevated = window === "PRE_EVENT" || window === "EVENT_DAY" || window === "POST_EVENT";
  return {
    earningsWindow: window,
    scheduledEventNear: window === "PRE_EVENT" || window === "EVENT_DAY",
    corporateRestrictionActive,
    highUncertaintyWindow: elevated,
  };
}

/** Inclusive start and exclusive end, in UTC, covering the policy window around the reported date. */
export function windowBounds(reportedDate: string, policy: EventTradingPolicy): { effectiveAt: string; expiresAt: string } | null {
  const day = calendarDay(reportedDate);
  if (day === null) {
    return null;
  }
  const start = Date.parse(`${reportedDate}T00:00:00.000Z`) - policy.preEventDays * DAY_MS;
  const end = Date.parse(`${reportedDate}T00:00:00.000Z`) + (policy.postEventDays + 1) * DAY_MS;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { effectiveAt: new Date(start).toISOString(), expiresAt: new Date(end).toISOString() };
}

function calendarDay(value: string | null): number | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return Math.trunc(ms / DAY_MS);
}
