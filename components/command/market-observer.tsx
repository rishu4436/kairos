"use client";

import Link from "next/link";
import { EventRiskStrip } from "@/components/command/event-risk";
import { PaperCyclePanel } from "@/components/command/paper-cycle-panel";
import { StrategyBrain } from "@/components/command/strategy-brain";
import { EmptyState } from "@/components/ui/empty-state";
import { useObservationBoard } from "@/components/command/use-observation-board";
import type { ObservationBoard, ObservationRow, SignalView } from "@/domain/observation";
import { classifyFreshness, formatAge } from "@/domain/freshness";
import { cn } from "@/lib/cn";

export function MarketObserver({
  dataMode,
  initialBoard = null,
}: {
  dataMode: "live" | "paper";
  initialBoard?: ObservationBoard | null;
}) {
  const { board, now, phase, fault } = useObservationBoard(initialBoard);

  const mode = board?.dataMode ?? dataMode;
  const live = mode === "live";

  const cycle = board?.paperCycle ?? null;

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <div className="xl:col-span-12">
        <PaperCyclePanel cycle={cycle} mode={mode} />
        {board ? <EventRiskStrip rows={board.rows} /> : null}
      </div>
      <div className="xl:col-span-8">
        <section className="panel h-full" aria-labelledby="market-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Market observation</p>
              <h2 id="market-title" className="mt-1 text-[1.7rem] tracking-[0.18em]">
                KAIROS
              </h2>
              <p className="mt-2 flex items-center gap-2 text-sm tracking-[0.14em]">
                <span
                  className={cn("h-2 w-2 rounded-full", live && board?.ok ? "bg-gain" : "bg-signal")}
                  aria-hidden="true"
                />
                {live ? "LIVE MARKET DATA" : cycle ? "PAPER AUTONOMOUS" : "PAPER / MOCK"}
              </p>
            </div>
            <p className="pill">{live ? "Data mode live" : "Data mode paper / mock"}</p>
          </div>

          <HealthPanel board={board} phase={phase} fault={fault} />

          {phase === "loading" && !board ? (
            <p className="mt-5 text-sm text-muted">Loading market observation.</p>
          ) : null}

          {board && board.rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={board.ok ? "No representations returned" : "Market data unavailable"}
                body={board.error?.message ?? board.health.reason ?? "The watchlist has no rows."}
              />
            </div>
          ) : null}

          {board && board.rows.length > 0 ? (
            <div className="mt-4">
              <p className="eyebrow">Strategy brain</p>
              <p className="mt-1 text-xs text-muted">Per asset. A selected strategy is a candidate. It is not an order.</p>
              <div className="mt-3 grid gap-2">
                {board.rows.map((row) => (
                  <AssetRow key={row.representationId} row={row} now={now} board={board} />
                ))}
              </div>
            </div>
          ) : null}

          {board && board.unresolved.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {board.unresolved.map((item) => (
                <li key={`${item.ticker}:${item.reason}`}>
                  {item.ticker}: {item.reason}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 text-xs text-muted">
            {live
              ? "Reference deviation compares the token price with the API reference price. That reference is a per-share conversion of the on-chain token price, not an official stock quote. 24h change is not returned by these endpoints."
              : "These rows use explicitly supplied paper inputs. Failed live requests stay unavailable."}
          </p>
        </section>
      </div>
      <div className="xl:col-span-4">
        <Activity events={board?.events ?? []} live={live} />
      </div>
    </div>
  );
}

function HealthPanel({
  board,
  phase,
  fault,
}: {
  board: ObservationBoard | null;
  phase: "loading" | "ready" | "error";
  fault: string | null;
}) {
  const connected = !fault && board?.health.connection === "connected";
  const last = board?.health.lastSuccessAt ? clock(board.health.lastSuccessAt) : "—";
  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
      <HealthItem
        label="Binance Web3 API"
        value={phase === "loading" && !board ? "Checking" : connected ? "Connected" : "Offline"}
        on={connected}
        detail={fault ?? board?.health.reason ?? null}
      />
      <HealthItem label="RWA data" value={statusWord(board?.health.rwa)} on={board?.health.rwa === "ok"} detail={null} />
      <HealthItem
        label="Market data"
        value={statusWord(board?.health.market)}
        on={board?.health.market === "ok"}
        detail={connected ? `Last update ${last}` : null}
      />
      <HealthItem label="History" value={statusWord(board?.health.history)} on={board?.health.history === "ok"} detail={null} />
    </div>
  );
}

function HealthItem({ label, value, on, detail }: { label: string; value: string; on: boolean; detail: string | null }) {
  return (
    <div>
      <p className="text-xs tracking-[0.14em] text-muted uppercase">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <span className={cn("h-2 w-2 rounded-full", on ? "bg-gain" : "border border-muted")} aria-hidden="true" />
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function AssetRow({ row, now, board }: { row: ObservationRow; now: number; board: ObservationBoard }) {
  const deviation = formatDeviation(row.deviationPct);
  const freshness = liveFreshness(row, now, board);
  return (
    <article className="rounded-xl border border-line px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg tracking-tight">
            <Link href={`/markets/${row.ticker}`} className="hover:text-signal">
              {row.ticker}
            </Link>
          </h3>
          <p className="text-xs text-muted">
            {row.platformLabel} · {row.tokenSymbol} · {row.chainLabel}
          </p>
        </div>
        <p className="num text-lg">{usd(row.price)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Fact label="Reference" value={usd(row.referencePrice)} />
        <Fact label="Deviation" value={deviation} tone={tone(row.deviationPct)} />
        <Fact label="24h" value={row.change24hPct === null ? "—" : formatDeviation(row.change24hPct)} />
        <Fact label="Market" value={row.sessionLabel} />
        <Fact label="Regime" value={row.regime || "UNKNOWN"} />
      </dl>
      {row.signals.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {row.signals.map((signal) => (
            <Link
              key={signal.strategyId}
              href={`/strategies/${signal.strategyId}`}
              className="rounded-lg border border-line px-2 py-2 hover:border-signal"
            >
              <p className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{signal.strategyName}</p>
              <p className="mt-1 text-sm">
                {signalHeadline(signal)}
                {signalPercent(signal) ? <span className="num ml-2 text-paper">{signalPercent(signal)}</span> : null}
              </p>
            </Link>
          ))}
        </div>
      ) : null}
      <StrategyBrain decision={row.arbitration} />
      <p className="mt-3 text-xs tracking-[0.08em] text-muted">DATA {freshness}</p>
      {row.reasonMessage ? <p className="mt-1 text-xs text-muted">{row.reasonMessage}</p> : null}
    </article>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "flat" }) {
  return (
    <div>
      <dt className="text-muted uppercase tracking-[0.12em]">{label}</dt>
      <dd className={cn("num mt-1 text-sm", tone === "up" && "text-gain", tone === "down" && "text-loss")}>{value}</dd>
    </div>
  );
}

function Activity({ events, live }: { events: ObservationBoard["events"]; live: boolean }) {
  return (
    <section className="panel h-full" aria-labelledby="activity-title">
      <p className="eyebrow">{live ? "Observation feed" : "Paper feed"}</p>
      <h2 id="activity-title" className="mt-1 text-base font-medium tracking-tight">
        Agent activity
      </h2>
      {events.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No observation events" body="Events appear after a snapshot is accepted." />
        </div>
      ) : (
        <ol className="mt-4 max-h-[36rem] overflow-auto">
          {events.map((event) => (
            <li key={event.id} className="grid grid-cols-[4.6rem_minmax(0,1fr)] gap-3 border-l border-line py-2.5 pl-3">
              <time dateTime={event.at} className="num text-xs text-muted">
                {event.clock}
              </time>
              <div>
                <p className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{event.type.replaceAll("_", " ")}</p>
                <p className="text-sm leading-5">{event.message}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">
        {live ? "Observation events only. KAIROS has not sent an order." : "Sample observation events. No request was sent."}
      </p>
    </section>
  );
}

function signalHeadline(signal: SignalView): string {
  if (signal.evaluation === "INSUFFICIENT_DATA") {
    return "INSUFFICIENT DATA";
  }
  if (signal.evaluation === "STALE_DATA") {
    return "STALE DATA";
  }
  if (signal.tags.includes("OFF_HOURS_DISLOCATION")) {
    return "DISLOCATION";
  }
  if (signal.action === "NO_SIGNAL" || signal.evaluation === "NO_SIGNAL") {
    return "NO SIGNAL";
  }
  return signal.action;
}

function signalPercent(signal: SignalView): string | null {
  if (signal.confidence <= 0 || signal.evaluation === "INSUFFICIENT_DATA" || signal.evaluation === "STALE_DATA" || signal.evaluation === "NO_SIGNAL") {
    return null;
  }
  return `${Math.round(signal.confidence * 100)}%`;
}

function usd(value: string | null): string {
  if (value === null) {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDeviation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function tone(value: number | null): "up" | "down" | "flat" {
  if (value === null || value === 0) {
    return "flat";
  }
  return value > 0 ? "up" : "down";
}

function liveFreshness(row: ObservationRow, now: number, board: ObservationBoard): string {
  if (row.fidelity === "paper") {
    return "SAMPLE";
  }
  const source = row.sourceTimestamp ? Date.parse(row.sourceTimestamp) : null;
  const freshness = classifyFreshness(source, now, {
    freshMaxMs: board.freshMaxMs,
    agingMaxMs: board.agingMaxMs,
  });
  return `${freshness.status} · ${freshness.ageMs === null ? "age unknown" : formatAge(freshness.ageMs)}`;
}

function clock(iso: string): string {
  return iso.slice(11, 19);
}

function statusWord(value: ObservationBoard["health"]["rwa"] | undefined): string {
  if (value === "ok") {
    return "OK";
  }
  if (value === "error") {
    return "Error";
  }
  return "Not called";
}

