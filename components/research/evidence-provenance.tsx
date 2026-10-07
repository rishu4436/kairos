import type { ObservationRow } from "@/domain/observation";

/** What the research context can actually see. A missing provider is not a negative finding. */
export function EvidenceProvenance({ rows }: { rows: readonly ObservationRow[] }) {
  const row = rows.find((item) => item.kairos) ?? null;
  const context = row?.kairos;
  if (!context || !row) {
    return null;
  }
  const newsCount = context.newsContext.value?.items?.length ?? null;
  const earnings = context.earningsContext;
  const external = context.externalSignals.status === "AVAILABLE" ? "present" : "unavailable";
  return (
    <section className="panel">
      <p className="eyebrow">Observed inputs</p>
      <h2 className="mt-1 text-sm font-medium">{row.ticker} thesis inputs</h2>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Item label="Market" ok={context.market.status === "AVAILABLE"} detail={context.market.status} />
        <Item label="Strategy health" ok={context.strategyHealth.status === "AVAILABLE"} detail={context.strategyHealth.status} />
        <Item label="Smart Money" ok={external === "present"} detail={external} />
        <Item label="Earnings" ok={earnings.status === "AVAILABLE"} detail={earnings.status === "AVAILABLE" ? `FMP ${earnings.value?.window ?? ""}` : (earnings.reason ?? earnings.status)} />
        <Item label="News" ok={newsCount !== null && newsCount > 0} detail={newsCount === null ? (context.newsContext.reason ?? context.newsContext.status) : `${newsCount} items`} />
      </ul>
    </section>
  );
}

function Item({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li>
      <span className={ok ? "text-gain" : "text-muted"}>{ok ? "✓" : "○"}</span> {label}
      <span className="text-muted"> · {detail}</span>
    </li>
  );
}
