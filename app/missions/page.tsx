import { Fragment } from "react";
import { LiveTradesPanel } from "@/components/command/live-trades";
import { PageHeader } from "@/components/ui/page-header";
import type { PaperMissionView } from "@/domain/paper-cycle-view";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { LIVE_MISSION_TRACK, PAPER_MISSION_TRACK } from "@/execution/preview";
import { readDataMode } from "@/lib/mode";
import { paperObservationBoard } from "@/observation/paper";
import { sessionPaperCapability } from "@/paper/run-cycle";
import { loadProductionDashboard } from "@/services/dashboard";

export const metadata = { title: "Missions" };
export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const dashboard = await loadProductionDashboard();
  const mode = readDataMode();
  const authority = mode === "paper" ? sessionPaperCapability() : null;
  const history = authority ? (paperObservationBoard(DEMO_USER_ID, { authority }).paperCycle?.history ?? []) : [];

  return (
    <>
      <PageHeader
        kicker="Execution history"
        title="Missions"
        description="Live trades are wallet submissions. Paper missions are simulated and never broadcast."
      />
      <div className="mb-4">
        <LiveTradesPanel trades={dashboard.liveTrades} />
      </div>
      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <article className="panel">
          <p className="eyebrow">Paper mission</p>
          <p className="mt-2 text-sm">{PAPER_MISSION_TRACK.join(" → ")}</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Live mission</p>
          <p className="mt-2 text-sm">{LIVE_MISSION_TRACK.join(" → ")}</p>
          <p className="mt-2 text-xs text-muted">Signing is disabled. No live preparation is stored for this session.</p>
        </article>
      </section>
      <p className="mb-4 text-sm text-muted">
        {mode === "paper" ? <span className="pill pill-signal">PAPER MODE</span> : <span className="pill pill-gain">LIVE DATA</span>}{" "}
        <span className="pill pill-loss">NO REAL FUNDS</span>
      </p>
      {mode !== "paper" ? (
        <p className="text-sm text-muted">Paper missions are available in paper mode. Live data does not create a fill.</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted">No paper-cycle mission has been recorded for this user.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[880px]">
            <caption className="sr-only">Paper cycle missions. None of these were broadcast.</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Asset</th>
                <th scope="col">Strategy</th>
                <th scope="col">Action</th>
                <th scope="col">Risk</th>
                <th scope="col">Simulation</th>
                <th scope="col">Fill</th>
                <th scope="col">PnL</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((mission) => (
                <Fragment key={mission.correlationId}>
                  <MissionRow mission={mission} />
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function MissionRow({ mission }: { mission: PaperMissionView }) {
  return (
    <>
      <tr>
        <td>
          <time dateTime={mission.time} className="num text-muted">
            {mission.stamp}
          </time>
        </td>
        <th scope="row" className="text-left font-medium">
          {mission.asset}
        </th>
        <td>{mission.strategy}</td>
        <td>{mission.action}</td>
        <td>{mission.risk}</td>
        <td>{mission.simulation}</td>
        <td>{mission.fill}</td>
        <td className="num">{mission.pnl}</td>
        <td>
          <span className="pill pill-aqua">{mission.status}</span>
        </td>
      </tr>
      <tr>
        <td colSpan={9}>
          <details>
            <summary className="cursor-pointer text-sm text-muted">Lifecycle {mission.correlationId}</summary>
            <div className="mt-2 space-y-2">
              {mission.stages.map((stage) => (
                <details key={stage.id}>
                  <summary className="cursor-pointer text-sm">{stage.title}</summary>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{stage.body}</p>
                </details>
              ))}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}
