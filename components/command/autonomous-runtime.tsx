import type { autonomousSnapshot } from "@/observation/autonomous-board";

type Snapshot = ReturnType<typeof autonomousSnapshot>;

/** Compact runtime face. It reads persisted cycle records. It does not start a loop. */
export function AutonomousRuntimePanel({ snapshot }: { snapshot: Snapshot }) {
  const latest = snapshot.cycles[0] ?? null;
  return (
    <section className="panel" aria-labelledby="autonomous-runtime-title">
      <p className="eyebrow">Kairos autonomous runtime</p>
      <h2 id="autonomous-runtime-title" className="mt-1 text-lg">Paper cycle</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        <Fact label="Autonomous runtime" value={snapshot.labels.autonomousRuntime} />
        <Fact label="State backend" value={snapshot.durable ? "REDIS · DURABLE" : snapshot.labels.stateBackend} />
        <Fact label="Agent identity" value={snapshot.labels.identity} />
        <Fact label="Operating wallet" value={snapshot.labels.operatingWallet} />
        <Fact label="Binance data" value={snapshot.labels.binanceData} />
        <Fact label="Binance skills" value={snapshot.labels.binanceSkills} />
        <Fact label="Qwen" value={snapshot.labels.qwen} />
        <Fact label="FMP" value={snapshot.labels.fmp} />
        <Fact label="Trading wallet" value={snapshot.labels.tradingWallet} />
        <Fact label="Paper readiness" value="READY" />
        <Fact label="Live execution" value={snapshot.labels.liveExecution} />
        <Fact label="Mode" value="PAPER" />
        <Fact label="Last status" value={latest?.status ?? "OFFLINE"} />
      </dl>
      <p className="mt-3 text-xs text-muted">Suggested next {snapshot.heartbeat.nextCycleAt ?? "after the next manual or polled cycle"}. No background loop is running.</p>
      <h3 className="mt-4 text-sm font-medium">Recent cycles</h3>
      {snapshot.cycles.length === 0 ? <p className="mt-2 text-sm text-muted">No cycle has been recorded.</p> : null}
      <ul className="mt-2 space-y-1 text-sm">
        {snapshot.cycles.map((cycle) => (
          <li key={cycle.cycleId}>
            {cycle.status} · {cycle.executionMode} · intents {cycle.createdIntentIds.length} · assets {cycle.assetResults.length}
          </li>
        ))}
      </ul>
      <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-3">
        <li>Private key access: denied</li>
        <li>Risk override: denied</li>
        <li>Unauthorized live execution: denied</li>
      </ul>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
