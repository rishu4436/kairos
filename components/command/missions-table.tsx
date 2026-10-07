import { EmptyState } from "@/components/ui/empty-state";
import type { CommandCenterModel } from "@/services/command-center";

export function MissionsTable({ missions }: { missions: CommandCenterModel["missions"] }) {
  return (
    <section className="panel h-full" aria-labelledby="missions-title">
      <p className="eyebrow">Paper records</p>
      <h2 id="missions-title" className="mt-1 text-base font-medium tracking-tight">
        Recent missions
      </h2>
      {missions.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No paper missions" body="The sample ledger has no fills." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <caption className="sr-only">Recent paper missions. None of these are chain transactions.</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Asset</th>
                <th scope="col">Action</th>
                <th scope="col">Strategy</th>
                <th scope="col">Size</th>
                <th scope="col">Result</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <tr key={mission.id}>
                  <td>
                    <time dateTime={mission.time} className="num text-muted">
                      {mission.stamp}
                    </time>
                  </td>
                  <th scope="row" className="text-left font-medium">
                    {mission.asset}
                  </th>
                  <td>{mission.action}</td>
                  <td>{mission.strategy}</td>
                  <td className="num">{mission.size}</td>
                  <td className="num">{mission.result}</td>
                  <td>
                    <span className="pill pill-aqua">{mission.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
