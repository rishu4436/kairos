import { listStrategyCandidates } from "@/lifecycle/candidates";
import { strategyMemory } from "@/lifecycle/store";
import { DEMO_USER_ID } from "@/domain/watchlist";

const BUILT_IN = ["momentum", "mean-reversion", "weekend"] as const;

export function StrategyMemoryStrip() {
  const rows = BUILT_IN.map((id) => summary(DEMO_USER_ID, id));
  return (
    <section className="panel">
      <p className="eyebrow">Strategy health</p>
      <ul className="mt-3 grid gap-2 md:grid-cols-3">
        {rows.map((row) => (
          <li key={row.strategyId} className="rounded-xl border border-line px-3 py-2 text-sm">
            <p className="font-medium">{row.strategyId}</p>
            <p className="mt-1 text-xs text-muted">Historical {row.status}</p>
            <p className="text-xs text-muted">Sample {row.sampleSize}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StrategyHealthPanel({ strategyId }: { strategyId: string }) {
  const health = strategyMemory().getHealth(DEMO_USER_ID, strategyId, "1", "PAPER");
  return (
    <section className="panel">
      <p className="eyebrow">Health</p>
      <p className="mt-2 text-sm">Overall {health.status}</p>
      <p className="mt-1 text-xs text-muted">Sample {health.sampleSize} · {health.sampleState}</p>
      <p className="mt-1 text-xs text-muted">Expectancy {health.expectancy ?? "—"} · Drawdown {health.drawdown ?? "—"}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Coverage title="By regime" rows={health.regimeCoverage.map((row) => `${row.regime} ${row.status}`)} empty="No regime has a measured outcome." />
        <Coverage title="By session" rows={health.sessionCoverage.map((row) => `${row.session} ${row.status}`)} empty="No session has a measured outcome." />
      </div>
      {health.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-muted">{warning}</p>
      ))}
    </section>
  );
}

export function StrategyComparison() {
  const rows = BUILT_IN.map((id) => {
    const record = strategyMemory().get(DEMO_USER_ID, id, "1", "PAPER", { assetId: null, regime: null, session: null });
    const health = strategyMemory().getHealth(DEMO_USER_ID, id, "1", "PAPER");
    return {
      id,
      version: "1",
      sample: record?.sampleSize ?? 0,
      expectancy: record?.expectancy ?? "—",
      drawdown: record?.maxDrawdown ?? "—",
      winRate: record?.winRate ?? "—",
      status: health.status,
    };
  });
  return (
    <section className="panel mt-3">
      <p className="eyebrow">Comparison</p>
      <p className="mt-1 text-xs text-muted">Rank is not by PnL. Sample size and health stay visible.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Version</th>
              <th>Sample</th>
              <th>Expectancy</th>
              <th>Drawdown</th>
              <th>Win rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.version}</td>
                <td>{row.sample}</td>
                <td>{row.expectancy}</td>
                <td>{row.drawdown}</td>
                <td>{row.winRate}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ResearchLifecyclePanel() {
  const candidates = listStrategyCandidates(DEMO_USER_ID);
  return (
    <section className="panel">
      <p className="eyebrow">Strategy lifecycle</p>
      <p className="mt-2 text-xs tracking-[0.08em] text-muted uppercase">Candidate → Experiment → Result → Shadow → Paper → Live eligible</p>
      {candidates.length === 0 ? <p className="mt-3 text-sm text-muted">No research candidate is stored.</p> : null}
      <ul className="mt-3 grid gap-3">
        {candidates.map((candidate) => {
          const record = strategyMemory().get(candidate.userId, candidate.strategyId, candidate.strategyVersion, "EXPERIMENT", {
            assetId: null,
            regime: null,
            session: null,
          });
          return (
            <li key={candidate.candidateId} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-medium">{candidate.strategyId}</p>
              <p className="mt-1 text-xs text-muted">Status {candidate.status}</p>
              <p className="text-xs text-muted">Sample {record?.sampleSize ?? 0}</p>
              <p className="text-xs text-muted">Expectancy {record?.expectancy ?? "—"} · Drawdown {record?.maxDrawdown ?? "—"}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function summary(userId: string, strategyId: string) {
  const health = strategyMemory().getHealth(userId, strategyId, "1", "PAPER");
  return { strategyId, status: health.status, sampleSize: health.sampleSize };
}

function Coverage({ title, rows, empty }: { title: string; rows: readonly string[]; empty: string }) {
  return (
    <div>
      <p className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{title}</p>
      {rows.length === 0 ? <p className="mt-1 text-xs text-muted">{empty}</p> : null}
      <ul className="mt-1 space-y-1 text-xs">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}
