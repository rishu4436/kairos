"use client";

import Link from "next/link";
import { BinanceIntelligenceBlock } from "@/components/command/binance-intelligence";
import { StrategyBrain } from "@/components/command/strategy-brain";
import { emptyBinanceIntelligence } from "@/skills/view";
import { ContextMap, EventTimeline } from "@/components/context/kairos-context";
import { EventIntelligence } from "@/components/markets/event-intelligence";
import { PositionIntelligence } from "@/components/markets/position-intelligence";
import { CandleChart } from "@/components/markets/candle-chart";
import { useObservationBoard } from "@/components/command/use-observation-board";
import { EmptyState } from "@/components/ui/empty-state";
import type { ObservationBoard, ObservationRow, SignalView } from "@/domain/observation";

export function AssetTerminal({ ticker, initialBoard }: { ticker: string; initialBoard: ObservationBoard }) {
  const { board, phase, fault } = useObservationBoard(initialBoard);
  const rows = board?.rows.filter((row) => row.ticker.toUpperCase() === ticker.toUpperCase()) ?? [];
  const live = board?.dataMode === "live";

  return (
    <div className="grid gap-3">
      <p className="text-xs tracking-[0.14em] text-muted uppercase">{live ? "Data mode live" : "Data mode paper / mock"}</p>
      {phase === "loading" && !board ? <p className="text-sm text-muted">Loading market observation.</p> : null}
      {fault ? <p className="text-sm text-muted">{fault}</p> : null}
      {board && rows.length === 0 ? (
        <EmptyState title="No representation" body="This ticker is not in the current observation board." />
      ) : null}
      {rows.map((row) => (
        <AssetBlock key={row.representationId} row={row} />
      ))}
    </div>
  );
}

function AssetBlock({ row }: { row: ObservationRow }) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{row.companyName}</p>
          <h2 className="mt-1 text-2xl tracking-tight">{row.ticker}</h2>
          <p className="mt-1 text-xs text-muted">
            {row.platformLabel} · {row.tokenSymbol} · {row.chainLabel}
          </p>
        </div>
        <p className="num text-2xl">{money(row.price)}</p>
      </div>
      {row.kairos ? (
        <div className="mt-4 border-t border-line pt-4">
          <ContextMap context={row.kairos} />
          <PositionIntelligence context={row.kairos} />
          <EventIntelligence context={row.kairos} />
          <div className="mt-4">
            <EventTimeline entries={row.kairos.timeline} />
          </div>
        </div>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Item label="Reference" value={money(row.referencePrice)} />
        <Item label="Deviation" value={row.deviationPct === null ? "—" : signed(row.deviationPct)} />
        <Item label="Market" value={row.sessionLabel} />
        <Item label="Freshness" value={row.freshnessLabel} />
        <Item label="Regime" value={row.regime} />
        <Item label="Quality" value={row.dataQuality ?? "—"} />
      </dl>
      <div className="mt-4 border-t border-line pt-4">
        <p className="eyebrow">Candles · 15m</p>
        <div className="mt-2">
          <CandleChart bars={row.candles} />
        </div>
        <p className="mt-2 text-xs text-muted">{row.fidelity === "paper" ? "Sample candles generated for paper mode." : "Candles from the Binance Web3 market candle endpoint."}</p>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <p className="eyebrow">Features</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {row.features.map((feature) => (
            <div key={feature.id}>
              <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{feature.label}</dt>
              <dd className="num mt-1 text-sm">{feature.sufficient ? feature.value : "—"}</dd>
              {!feature.sufficient && feature.note ? <p className="text-[0.68rem] text-faint">{feature.note}</p> : null}
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <BinanceIntelligenceBlock view={row.binanceIntelligence ?? emptyBinanceIntelligence()} />
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <p className="eyebrow">Strategies</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {row.signals.map((signal) => (
            <StrategyCard key={signal.strategyId} signal={signal} />
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <p className="eyebrow">Strategy arbitration</p>
        <StrategyBrain decision={row.arbitration} />
      </div>
    </section>
  );
}

function StrategyCard({ signal }: { signal: SignalView }) {
  return (
    <article className="rounded-xl border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">
          <Link href={`/strategies/${signal.strategyId}`} className="hover:text-signal">
            {signal.strategyName}
          </Link>
        </h3>
        <span className="pill">{headline(signal)}</span>
      </div>
      <p className="num mt-2 text-sm">{percent(signal) ?? "—"}</p>
      <p className="mt-1 text-[0.68rem] tracking-[0.12em] text-muted uppercase">{signal.evaluation}</p>
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {signal.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-3 text-[0.68rem] text-faint">Not an order. {signal.riskHints[0] ?? ""}</p>
    </article>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="num mt-1 text-sm">{value}</dd>
    </div>
  );
}

function headline(signal: SignalView): string {
  if (signal.tags.includes("OFF_HOURS_DISLOCATION")) {
    return "DISLOCATION";
  }
  if (signal.evaluation === "INSUFFICIENT_DATA") {
    return "INSUFFICIENT";
  }
  if (signal.evaluation === "STALE_DATA") {
    return "STALE";
  }
  if (signal.action === "NO_SIGNAL") {
    return "NO SIGNAL";
  }
  return signal.action;
}

function percent(signal: SignalView): string | null {
  if (signal.confidence <= 0 || signal.evaluation === "NO_SIGNAL" || signal.evaluation === "INSUFFICIENT_DATA" || signal.evaluation === "STALE_DATA") {
    return null;
  }
  return `${Math.round(signal.confidence * 100)}%`;
}

function money(value: string | null): string {
  if (value === null) {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function signed(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
