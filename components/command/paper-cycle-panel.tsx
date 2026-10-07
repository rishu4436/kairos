"use client";

import type { PaperCycleView, PaperMissionView } from "@/domain/paper-cycle-view";

export function PaperCyclePanel({
  cycle,
  mode,
}: {
  cycle: PaperCycleView | null;
  mode: "live" | "paper";
}) {
  if (mode !== "paper" || !cycle) {
    return (
      <section className="panel" aria-labelledby="paper-cycle-title">
        <p className="eyebrow">Execution</p>
        <h2 id="paper-cycle-title" className="mt-1 text-base font-medium">
          Paper cycle
        </h2>
        <p className="mt-3 text-sm text-muted">
          Paper execution runs only in paper mode. Live market data does not create a paper fill, and nothing is broadcast.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="paper-cycle-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Autonomous paper loop</p>
          <h2 id="paper-cycle-title" className="mt-1 text-[1.7rem] tracking-[0.16em]">
            {cycle.headline}
          </h2>
          <p className="mt-2 text-sm text-muted">{cycle.notice}</p>
          <p className="mt-2 text-sm">Agent loop {cycle.loopState}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="pill pill-signal">{cycle.badge}</span>
          <span className="pill pill-loss">{cycle.funds}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <CurrentCycle assets={cycle.assets} />
        <CurrentMission mission={cycle.mission} />
      </div>

      <Explanation history={cycle.history} />
      <PositionMonitor cycle={cycle} />
    </section>
  );
}

function CurrentCycle({ assets }: { assets: PaperCycleView["assets"] }) {
  const active = assets.filter((asset) => asset.steps.some((step) => step.state !== "skipped"));
  const quiet = assets.filter((asset) => !active.includes(asset));
  return (
    <div>
      <h3 className="text-sm font-medium">Current cycle</h3>
      <div className="mt-3 space-y-3">
        {active.length === 0 ? <p className="text-sm text-muted">No executable selection on this pass.</p> : null}
        {active.map((asset) => (
          <article key={asset.assetId} className="rounded-xl border border-line px-3 py-3">
            <h4 className="text-sm">{asset.headline}</h4>
            <ol className="mt-2 space-y-1">
              {asset.steps.map((step) => (
                <li key={`${asset.assetId}:${step.label}`} className="text-sm text-muted">
                  <span className={step.state === "failed" ? "text-loss" : step.state === "done" ? "text-paper" : undefined}>
                    {step.label}
                  </span>
                  {" · "}
                  {step.detail}
                </li>
              ))}
            </ol>
          </article>
        ))}
        {quiet.length > 0 ? (
          <p className="text-xs text-muted">{quiet.map((asset) => asset.ticker).join(" · ")} did not produce an executable action.</p>
        ) : null}
      </div>
    </div>
  );
}

function CurrentMission({ mission }: { mission: PaperMissionView | null }) {
  if (!mission) {
    return (
      <div className="rounded-xl border border-line px-3 py-3">
        <h3 className="text-sm font-medium">Current mission</h3>
        <p className="mt-2 text-sm text-muted">No paper mission yet. The sample ledger on this page is a separate fixture.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line px-3 py-3">
      <p className="eyebrow">Current mission</p>
      <h3 className="mt-1 text-2xl tracking-tight">
        {mission.action} {mission.asset}
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Field label="Strategy" value={mission.strategy} />
        <Field label="Target" value={mission.target} />
        <Field label="Risk" value={mission.risk} />
        <Field label="Expected execution" value={mission.expectedPrice} />
        <Field label="Estimated slippage" value={mission.slippage} />
        <Field label="Estimated fee" value={mission.fee} />
        <Field label="Estimated total" value={mission.totalCost} />
        <Field label="Status" value={mission.status} />
        <Field label="Context" value={mission.executionContextId} />
      </dl>
    </div>
  );
}

function Explanation({ history }: { history: PaperMissionView[] }) {
  const mission = history[0];
  if (!mission) {
    return null;
  }
  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="text-sm font-medium">Why did KAIROS act?</h3>
      <div className="mt-3 space-y-2">
        {mission.stages.map((stage, index) => (
          <details key={stage.id} className="rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm">
              {index + 1}. {stage.title}
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{stage.body}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function PositionMonitor({ cycle }: { cycle: PaperCycleView }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Paper positions</h3>
          <p className="mt-1 text-xs text-muted">
            The mark is read from this book. A later paper cycle can hold, add, reduce, or exit only after risk. Equity {cycle.equity}. Cash {cycle.cash}.
          </p>
        </div>
        <p className="text-xs text-muted">{cycle.sizingPolicy}</p>
      </div>
      {cycle.positions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No open paper-cycle position.</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {cycle.positions.map((position) => (
            <article key={position.assetId} className="rounded-xl border border-line px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-lg">{position.asset}</h4>
                <p className="text-xs tracking-[0.14em] text-muted uppercase">Paper position</p>
              </div>
              <p className="mt-1 text-sm">
                Position {position.side} · {position.quantity} shares
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Field label="Entry" value={position.entry} />
                <Field label="Mark" value={position.current} />
                <Field label="Unrealized" value={position.unrealizedPnl} />
                <Field label="Realized" value={position.realizedPnl} />
                <Field label="Origin strategy" value={`${position.strategy} v${position.strategyVersion}`} />
                <Field label="Thesis" value={position.thesisState} />
                <Field label="Position manager" value={position.lastDecision} />
                <Field label="Exit class" value={position.exitClass} />
                <Field label="State" value={position.lifecycle} />
                <Field label="Adds / reduces" value={`${position.addCount} / ${position.reduceCount}`} />
              </dl>
              <p className="mt-3 text-sm text-muted">Why. {position.why || "No position decision has been recorded yet."}</p>
              <p className="mt-1 text-xs text-muted">Next review. Next agent cycle.</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1">{value}</dd>
    </div>
  );
}
