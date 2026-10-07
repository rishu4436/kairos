import type { KAIROSContext } from "@/context/types";

/** Provider facts and the KAIROS window label stay in separate blocks. */
export function EventIntelligence({ context }: { context: KAIROSContext }) {
  const earnings = context.earningsContext;
  const news = context.newsContext;
  const event = earnings.value?.event ?? null;
  const restriction = context.eventContext.value?.events.find((item) => item.severity === "RESTRICTION" && item.source !== "FMP_EARNINGS");
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="eyebrow">Event intelligence</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-medium">Earnings</h3>
          {earnings.reason === "NOT_CONFIGURED" || earnings.value === null ? (
            <p className="mt-2 text-sm text-muted">UNKNOWN — PROVIDER {earnings.reason ?? earnings.status}</p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <Fact label="Date" value={event?.reportedDate ?? "—"} />
              <Fact label="Timing" value={timingLabel(event?.reportTime ?? null)} />
              <Fact label="EPS estimate" value={event?.epsEstimated ?? "—"} />
              <Fact label="EPS actual" value={event?.epsActual ?? "—"} />
              <Fact label="State" value={event?.status ?? "—"} />
              <Fact label="Window" value={earnings.value.window} />
            </dl>
          )}
        </section>
        <section>
          <h3 className="text-sm font-medium">News</h3>
          {news.value?.items && news.value.items.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {news.value.items.slice(0, 5).map((item) => (
                <li key={item.newsId} className="text-sm">
                  <p>{item.headline}</p>
                  <p className="text-xs text-muted">
                    {item.publisher ?? "Publisher unavailable"} · {item.freshness} · {item.provider}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{news.reason === "NOT_CONFIGURED" ? "UNKNOWN — PROVIDER NOT CONFIGURED" : (news.reason ?? news.status)}</p>
          )}
        </section>
      </div>
      <section className="mt-4">
        <h3 className="text-sm font-medium">Tokenized security</h3>
        <p className="mt-1 text-sm text-muted">
          {restriction ? `${restriction.status} · ${restriction.reason ?? restriction.type}` : "No active trading restriction on this representation."}
        </p>
      </section>
      <section className="mt-4 border-t border-line pt-3">
        <h3 className="text-sm font-medium">KAIROS interpretation</h3>
        <p className="mt-1 text-sm text-muted">
          {earnings.value ? `Window ${earnings.value.window}. ${earnings.value.eventRisk.highUncertaintyWindow ? "Elevated uncertainty." : "No event adjustment."} This is not an order.` : "No underlying earnings reading is available. This is not an order."}
        </p>
      </section>
    </div>
  );
}

function timingLabel(value: string | null): string {
  if (value === "BEFORE_OPEN") {
    return "BEFORE OPEN";
  }
  if (value === "AFTER_CLOSE") {
    return "AFTER CLOSE";
  }
  if (value === "DURING_SESSION") {
    return "DURING SESSION";
  }
  return value ?? "—";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
