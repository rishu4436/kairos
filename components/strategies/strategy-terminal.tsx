"use client";

import Link from "next/link";
import { StrategyContextStrip } from "@/components/context/kairos-context";
import { EvidenceAlignment } from "@/components/command/binance-intelligence";
import { decisionLabel } from "@/arbitration/labels";
import { useObservationBoard } from "@/components/command/use-observation-board";
import { EmptyState } from "@/components/ui/empty-state";
import type { StrategyMetadata } from "@/domain/models";
import type { KAIROSContext } from "@/context/types";
import type { ObservationBoard, SignalView } from "@/domain/observation";

export function StrategyTerminal({
  strategy,
  parameters,
  initialBoard = null,
}: {
  strategy: StrategyMetadata;
  parameters: readonly { name: string; value: string }[];
  initialBoard?: ObservationBoard | null;
}) {
  const { board, phase } = useObservationBoard(initialBoard);
  const current = board?.rows.flatMap((row) => row.signals.filter((signal) => signal.strategyId === strategy.id)) ?? [];
  const arbitration = board?.rows.flatMap((row) => {
    const candidate = row.arbitration?.candidates.find((item) => item.strategyId === strategy.id);
    if (!row.arbitration || !candidate) {
      return [];
    }
    return [{ ticker: row.ticker, decision: row.arbitration, candidate }];
  }) ?? [];
  const recent = board?.recentEvaluations.filter((signal) => signal.strategyId === strategy.id) ?? [];
  const implemented = strategy.status === "implemented";

  return (
    <div className="grid gap-3">
      <section className="panel">
        <p className="eyebrow">{strategy.category}</p>
        <h2 className="mt-1 text-xl">{strategy.name}</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">{strategy.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Field label="Version" value={strategy.version} />
          <Field label="Status" value={implemented ? "Implemented" : "Coming soon"} />
          <Field label="Required data" value={strategy.requiredData.join(", ") || "—"} />
          <Field label="Sessions" value={strategy.supportedSessions.join(", ") || "—"} />
        </dl>
        <p className="mt-3 text-xs text-muted">Supported assets: {strategy.supportedAssets.join(", ") || "—"}. A signal is not an order.</p>
        {parameters.length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {parameters.map((item) => (
              <div key={item.name}>
                <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{item.name}</dt>
                <dd className="num mt-1 text-sm">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
      {!implemented ? (
        <EmptyState title="Not evaluated" body="This strategy is catalogued only. The registry does not run it." />
      ) : null}
      {implemented && arbitration.length > 0 ? (
        <section className="panel">
          <p className="eyebrow">Arbitration status</p>
          <ul className="mt-3 divide-y divide-line">
            {arbitration.map((item) => (
              <li key={item.ticker} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/markets/${item.ticker}`} className="hover:text-signal">
                    {item.ticker}
                  </Link>
                  <span className="num text-xs text-muted">{item.candidate.candidateStatus.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {decisionLabel(item.decision.decision, item.decision.selectedStrategyName)}
                  {item.candidate.score > 0 ? ` · score ${item.candidate.score.toFixed(2)}` : ""}
                </p>
                <p className="mt-1 text-xs text-faint">{item.candidate.rejectionReason ?? item.decision.evidence.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {implemented && phase === "loading" && !board ? <p className="text-sm text-muted">Loading evaluations.</p> : null}
      {implemented && current.length === 0 && board ? (
        <EmptyState title="No current evaluation" body="The watchlist observation has not produced a row for this strategy." />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {current.map((signal) => (
          <Evaluation
            key={`${signal.representationId}:${signal.timestamp}`}
            signal={signal}
            external={board?.rows.find((row) => row.representationId === signal.representationId)?.binanceIntelligence}
            context={board?.rows.find((row) => row.representationId === signal.representationId)?.kairos}
          />
        ))}
      </div>
      {implemented && recent.length > 0 ? (
        <section className="panel">
          <p className="eyebrow">Recent evaluations</p>
          <ul className="mt-3 divide-y divide-line">
            {recent.slice(-12).reverse().map((signal) => (
              <li key={`${signal.id}:recent`} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <Link href={`/markets/${signal.ticker}`} className="hover:text-signal">
                  {signal.ticker}
                  <span className="ml-2 text-xs text-muted">{signal.tokenSymbol}</span>
                </Link>
                <span className="num text-xs text-muted">
                  {signal.evaluation} · {signal.action}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Evaluation({
  signal,
  external,
  context,
}: {
  signal: SignalView;
  external?: ObservationBoard["rows"][number]["binanceIntelligence"];
  context?: KAIROSContext;
}) {
  return (
    <article className="panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{signal.ticker}</p>
          <h3 className="mt-1 text-lg">{signal.action}</h3>
          <p className="text-xs text-muted">{signal.tokenSymbol}</p>
        </div>
        <p className="num text-lg">{signal.confidence > 0 ? `${Math.round(signal.confidence * 100)}%` : "—"}</p>
      </div>
      <p className="mt-3 text-xs tracking-[0.12em] text-muted uppercase">{signal.evaluation}</p>
      <h4 className="mt-4 text-xs tracking-[0.14em] text-muted uppercase">Why this evaluation</h4>
      <ul className="mt-2 space-y-1 text-sm">
        {signal.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {signal.tags.length > 0 ? <p className="mt-3 text-xs text-aqua">{signal.tags.join(" · ")}</p> : null}
      <p className="mt-3 text-xs text-faint">
        Quality {signal.dataQuality}. History {signal.historyPoints}. Executable false.
      </p>
      <StrategyContextStrip context={context} strategyId={signal.strategyId} />
      <EvidenceAlignment internal={signal.action} view={external} />
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
