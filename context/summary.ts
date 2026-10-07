import type { KAIROSContext, MarketEvent, SummaryLine } from "@/context/types";

/** Built from structured fields. No model writes this text. */
export function summarizeContext(context: Omit<KAIROSContext, "summaryLines" | "summaryText" | "validation"> & { validation?: KAIROSContext["validation"] }): {
  summaryLines: SummaryLine[];
  summaryText: string;
} {
  const lines: SummaryLine[] = [
    { label: "MARKET", value: marketLine(context) },
    { label: "REGIME", value: context.regime.value?.regime ?? context.regime.status },
    { label: "SESSION", value: context.session.value?.label ?? context.session.status },
    ...signalLines(context),
    { label: "SMART MONEY", value: smartMoneyLine(context) },
    { label: "STRATEGY HEALTH", value: healthLine(context) },
    { label: "EVENT", value: eventLine(context) },
    { label: "EARNINGS", value: earningsLine(context) },
    { label: "NEWS", value: newsLine(context) },
    { label: "SECURITY", value: context.tokenSecurity.value?.label ?? context.tokenSecurity.status },
    { label: "POSITION", value: positionLine(context) },
    { label: "DATA QUALITY", value: context.quality },
    { label: "OPPORTUNITY", value: context.opportunity.state },
  ];
  const header = context.identity.underlyingTicker;
  const body = lines.map((line) => `${line.label}:\n${line.value}`).join("\n\n");
  return { summaryLines: lines, summaryText: `${header}\n\n${body}` };
}

function earningsLine(context: { earningsContext: KAIROSContext["earningsContext"] }): string {
  if (context.earningsContext.reason === "NOT_CONFIGURED" || context.earningsContext.value === null) {
    return context.earningsContext.reason ?? context.earningsContext.status;
  }
  const event = context.earningsContext.value.event;
  if (!event) {
    return "PROVIDER_ANSWERED";
  }
  return [event.reportedDate ?? "date unavailable", event.reportTime, event.status, context.earningsContext.value.window].join(" · ");
}

function newsLine(context: { newsContext: KAIROSContext["newsContext"] }): string {
  if (context.newsContext.status !== "AVAILABLE" && context.newsContext.status !== "STALE") {
    return context.newsContext.reason ?? context.newsContext.status;
  }
  const count = context.newsContext.value?.items?.length ?? 0;
  return `${count} current`;
}

function marketLine(context: { market: KAIROSContext["market"]; session: KAIROSContext["session"] }): string {
  if (context.market.status === "UNAVAILABLE" || context.market.status === "STALE") {
    return context.market.status;
  }
  return context.session.value?.session ?? context.market.value?.session ?? context.market.status;
}

function signalLines(context: { strategySignals: KAIROSContext["strategySignals"] }): SummaryLine[] {
  const signals = context.strategySignals.value?.signals ?? [];
  if (signals.length === 0) {
    return [{ label: "STRATEGIES", value: context.strategySignals.status }];
  }
  return signals.map((signal) => ({
    label: signal.strategyName.toUpperCase(),
    value: signal.evaluation === "SIGNAL" ? signal.action : signal.evaluation,
  }));
}

function smartMoneyLine(context: { externalSignals: KAIROSContext["externalSignals"] }): string {
  if (context.externalSignals.status !== "AVAILABLE" || !context.externalSignals.value) {
    return context.externalSignals.status;
  }
  const mapped = context.externalSignals.value.signals.filter((signal) => signal.relevance === "MAPPED");
  if (mapped.length === 0) {
    return "NONE";
  }
  const fresh = mapped.find((signal) => signal.freshness === "FRESH" && signal.direction);
  if (fresh?.direction) {
    return fresh.direction;
  }
  if (mapped.every((signal) => signal.freshness === "STALE" || signal.freshness === "EXPIRED")) {
    return "STALE";
  }
  return mapped[0]?.direction ?? "NONE";
}

function healthLine(context: { strategyHealth: KAIROSContext["strategyHealth"] }): string {
  const reports = context.strategyHealth.value?.reports ?? [];
  if (reports.length === 0) {
    return context.strategyHealth.status;
  }
  const measured = reports.find((report) => report.sampleSize > 0);
  return measured?.status ?? reports[0]?.status ?? context.strategyHealth.status;
}

function eventLine(context: { eventContext: KAIROSContext["eventContext"] }): string {
  if (!context.eventContext.value?.providerAnswered) {
    return "UNAVAILABLE";
  }
  const active = context.eventContext.value.events.filter((event) => event.active);
  if (active.length === 0) {
    return "NONE";
  }
  return active.map(eventText).join("; ");
}

function eventText(event: MarketEvent): string {
  if (event.type === "EARNINGS") {
    return `EARNINGS — ${restrictionLabel(event)}`;
  }
  return `${event.type} — ${restrictionLabel(event)}`;
}

function restrictionLabel(event: MarketEvent): string {
  const code = event.details.split(" ")[0] ?? event.status;
  if (code === "ASSET_LIMITED") {
    return "TRADING LIMITED";
  }
  if (code === "ASSET_PAUSED") {
    return "TRADING PAUSED";
  }
  return event.status.toUpperCase();
}

function positionLine(context: { positionContext: KAIROSContext["positionContext"] }): string {
  const position = context.positionContext.value;
  if (!position || context.positionContext.status === "UNAVAILABLE") {
    return context.positionContext.status;
  }
  if (position.state === "NO_POSITION") {
    return "NO POSITION";
  }
  const notional = position.notional ? `$${position.notional}` : position.quantity ?? "OPEN";
  const entry = position.entry
    ? ` · entry ${position.entry.entryStrategySignal.strategyId} ${position.entry.entryStrategySignal.action} @ ${position.entry.entryPrice}`
    : "";
  return `${notional} ${position.state}${entry}`;
}
