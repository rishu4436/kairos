import type { ObservationRow } from "@/domain/observation";
import type { KAIROSContext, TimelineEntry } from "@/context/types";

export function KairosContextPanel({
  rows,
  note = "One snapshot per watchlist asset for this cycle. Opportunity is evidence maturity. It is not an order.",
}: {
  rows: readonly ObservationRow[];
  note?: string;
}) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">KAIROS context</p>
          <h2 className="mt-1 text-base font-medium">Decision snapshot</h2>
        </div>
        <p className="text-xs text-muted">No wallet · No order</p>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-muted">{note}</p>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.representationId} className="py-3">
            {row.kairos ? <ContextSummary context={row.kairos} /> : <p className="text-sm text-muted">{row.ticker} context unavailable</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ContextMap({ context }: { context: KAIROSContext }) {
  const sections = [
    ["MARKET", context.market, marketValue(context)],
    ["STRATEGIES", context.strategySignals, strategyValue(context)],
    ["EXTERNAL INTELLIGENCE", context.externalSignals, externalValue(context)],
    ["EVENTS", context.eventContext, eventValue(context)],
    ["SECURITY", context.tokenSecurity, context.tokenSecurity.value?.label ?? context.tokenSecurity.status],
    ["POSITION", context.positionContext, positionValue(context)],
    ["RESEARCH", context.researchContext, researchValue(context)],
  ] as const;
  return (
    <div>
      <p className="eyebrow">Context map</p>
      <p className="mt-1 text-xs text-muted">
        {context.identity.underlyingTicker} · {context.identity.tokenSymbol} · {context.identity.chainLabel}
        {context.identity.contractAddress ? ` · ${context.identity.contractAddress}` : ""}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {sections.map(([label, slice, value]) => (
          <article key={label} className="rounded-xl border border-line p-3">
            <p className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{label}</p>
            <p className="mt-1 text-sm">{value}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[0.68rem] text-faint">
              <div>
                <dt className="uppercase">Source</dt>
                <dd className="mt-1 text-muted">{slice.provenance.source ?? "—"}</dd>
              </div>
              <div>
                <dt className="uppercase">Timestamp</dt>
                <dd className="mt-1 text-muted">{slice.provenance.observedAt ? slice.provenance.observedAt.slice(11, 19) : "—"}</dd>
              </div>
              <div>
                <dt className="uppercase">Freshness</dt>
                <dd className="mt-1 text-muted">
                  {slice.status} · {slice.freshness}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

export function EventTimeline({ entries }: { entries: readonly TimelineEntry[] }) {
  return (
    <div>
      <p className="eyebrow">Event timeline</p>
      {entries.length === 0 ? <p className="mt-2 text-sm text-muted">No timeline rows for this cycle.</p> : null}
      <ul className="mt-3 divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
            <span>
              <span className="num mr-3 text-xs text-muted">{entry.clock}</span>
              {entry.label}
              <span className="ml-2 text-xs text-faint">{entry.detail}</span>
            </span>
            <span className="pill">{entry.source ?? entry.origin}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StrategyContextStrip({ context, strategyId }: { context: KAIROSContext | undefined; strategyId: string }) {
  if (!context) {
    return <p className="mt-3 text-xs text-muted">Market context unavailable for this evaluation.</p>;
  }
  const health = context.strategyHealth.value?.reports.find((report) => report.strategyId === strategyId);
  const signal = context.strategySignals.value?.signals.find((item) => item.strategyId === strategyId);
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
      <Fact label="Signal" value={signal ? `${signal.action} · ${signal.evaluation}` : context.strategySignals.status} />
      <Fact label="Health" value={health ? `${health.status} · n=${health.sampleSize}` : context.strategyHealth.status} />
      <Fact label="Market" value={`${context.session.value?.session ?? context.session.status} · ${context.regime.value?.regime ?? context.regime.status}`} />
      <Fact label="External" value={externalValue(context)} />
      <Fact label="Event" value={eventValue(context)} />
      <Fact label="Position" value={positionValue(context)} />
      <p className="col-span-2 text-[0.68rem] text-faint sm:col-span-3">Historical health does not replace the current signal.</p>
    </dl>
  );
}

function ContextSummary({ context }: { context: KAIROSContext }) {
  const headline = context.summaryLines
    .filter((line) => ["MARKET", "REGIME", "SESSION", "SMART MONEY", "STRATEGY HEALTH", "EVENT", "EARNINGS", "NEWS", "SECURITY", "POSITION", "DATA QUALITY", "OPPORTUNITY"].includes(line.label))
    .map((line) => `${line.label} ${line.value}`);
  return (
    <details>
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{context.identity.underlyingTicker}</span>
        <span className="ml-2 text-muted">{context.identity.tokenSymbol}</span>
        <span className="ml-2 text-xs text-faint">{context.quality}</span>
      </summary>
      <p className="mt-2 text-xs leading-5 text-muted">{headline.join(" · ")}</p>
      <pre className="mt-3 overflow-x-auto text-xs leading-5 whitespace-pre-wrap text-paper">{context.summaryText}</pre>
      {context.conflicts.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-loss">
          {context.conflicts.map((conflict) => (
            <li key={`${conflict.code}:${conflict.message}`}>
              {conflict.code}: {conflict.message}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function marketValue(context: KAIROSContext): string {
  if (context.market.value === null) {
    return context.market.status;
  }
  return `${context.market.value.price} · ${context.market.value.sessionLabel}`;
}

function strategyValue(context: KAIROSContext): string {
  const signals = context.strategySignals.value?.signals ?? [];
  if (signals.length === 0) {
    return context.strategySignals.status;
  }
  return signals.map((signal) => `${signal.strategyName} ${signal.action}`).join(" · ");
}

function externalValue(context: KAIROSContext): string {
  if (context.externalSignals.status !== "AVAILABLE" || context.externalSignals.value === null) {
    return context.externalSignals.status;
  }
  const mapped = context.externalSignals.value.signals.filter((signal) => signal.relevance === "MAPPED" && signal.direction);
  if (mapped.length === 0) {
    return "NONE";
  }
  return mapped.map((signal) => `${signal.direction} ${signal.freshness}`).join(" · ");
}

function eventValue(context: KAIROSContext): string {
  const line = context.summaryLines.find((item) => item.label === "EVENT");
  return line?.value ?? context.eventContext.status;
}

function positionValue(context: KAIROSContext): string {
  const line = context.summaryLines.find((item) => item.label === "POSITION");
  return line?.value ?? context.positionContext.status;
}

function researchValue(context: KAIROSContext): string {
  const theses = context.researchContext.value?.theses.length ?? 0;
  if (context.researchContext.status !== "AVAILABLE") {
    return context.researchContext.status;
  }
  return `${theses} thesis record${theses === 1 ? "" : "s"}`;
}

