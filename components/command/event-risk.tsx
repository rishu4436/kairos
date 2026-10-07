import type { ObservationRow } from "@/domain/observation";

/** Compact event risk. Headlines stay on the asset terminal. */
export function EventRiskStrip({ rows }: { rows: readonly ObservationRow[] }) {
  const relevant = rows.filter((row) => row.kairos);
  if (relevant.length === 0) {
    return null;
  }
  return (
    <section className="panel" aria-labelledby="event-risk-title">
      <p className="eyebrow">Event risk</p>
      <h2 id="event-risk-title" className="mt-1 text-sm font-medium">Underlying earnings and news</h2>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {relevant.map((row) => {
          const context = row.kairos;
          if (!context) {
            return null;
          }
          const earnings = context.earningsContext;
          const news = context.newsContext;
          const restriction = context.eventContext.value?.events.some((event) => event.severity === "RESTRICTION" && event.source !== "FMP_EARNINGS");
          const unconfigured = earnings.reason === "NOT_CONFIGURED" && news.reason === "NOT_CONFIGURED";
          return (
            <li key={row.representationId} className="text-sm">
              <span className="font-medium">{row.ticker}</span>
              {unconfigured ? (
                <span className="text-muted"> · UNKNOWN — PROVIDER NOT CONFIGURED</span>
              ) : (
                <span className="text-muted">
                  {" · "}
                  {earningsLine(earnings.value?.event?.reportedDate ?? null, earnings.value?.window ?? null, context.timestamp)}
                  {" · News: "}
                  {news.value?.items?.length ?? news.reason ?? news.status}
                  {" · Restriction: "}
                  {restriction ? "active" : "none"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <ProviderHealth rows={relevant} />
    </section>
  );
}

function earningsLine(date: string | null, window: string | null, timestamp: string): string {
  if (!date || !window || window === "NORMAL") {
    return window ? `Earnings ${window}` : "Earnings unavailable";
  }
  const days = calendarDelta(date, timestamp);
  if (days === null) {
    return `Earnings ${date}`;
  }
  if (days === 0) {
    return "Earnings today";
  }
  if (days > 0) {
    return `Earnings in ${days}d`;
  }
  return `Earnings ${-days}d ago`;
}

function calendarDelta(date: string, timestamp: string): number | null {
  const eventMs = Date.parse(`${date}T00:00:00.000Z`);
  const today = timestamp.slice(0, 10);
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(eventMs) || !Number.isFinite(todayMs)) {
    return null;
  }
  return Math.round((eventMs - todayMs) / 86_400_000);
}

function ProviderHealth({ rows }: { rows: readonly ObservationRow[] }) {
  const health = rows.find((row) => row.kairos?.earningsContext.value?.health || row.kairos?.newsContext.value?.health)?.kairos?.earningsContext.value?.health
    ?? rows.find((row) => row.kairos?.newsContext.value?.health)?.kairos?.newsContext.value?.health
    ?? null;
  if (!health) {
    return <p className="mt-3 text-xs text-muted">FMP earnings NOT CONFIGURED · news NOT CONFIGURED</p>;
  }
  return (
    <p className="mt-3 text-xs text-muted">
      FMP earnings {health.earnings} · news {health.news}
      {health.lastSuccessAt ? ` · last success ${health.lastSuccessAt.slice(11, 19)}` : ""}
      {health.latencyMs === null ? "" : ` · latency ${health.latencyMs} ms`}
    </p>
  );
}
