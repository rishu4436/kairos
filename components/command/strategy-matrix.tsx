import Link from "next/link";
import type { CommandCenterModel } from "@/services/command-center";
import type { ProductionDashboard } from "@/services/dashboard";

export function StrategyMatrix({
  catalog,
  evaluations,
}: {
  catalog: CommandCenterModel["strategies"];
  evaluations: ProductionDashboard["strategies"];
}) {
  return (
    <section className="panel" aria-labelledby="strategy-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Intelligence</p>
          <h2 id="strategy-title" className="mt-1 text-base font-medium tracking-tight">
            Strategy evaluations
          </h2>
        </div>
        <p className="text-xs text-muted">Analytical only. Not an order.</p>
      </div>
      {evaluations.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No momentum, mean-reversion, or weekend evaluation is stored on the current board.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <caption className="sr-only">Implemented strategy evaluations</caption>
            <thead>
              <tr>
                <th scope="col">Strategy</th>
                <th scope="col">Ticker</th>
                <th scope="col">Action</th>
                <th scope="col">Confidence</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((item) => (
                <tr key={`${item.strategyId}:${item.ticker}:${item.reason}`}>
                  <th scope="row" className="text-left font-medium">
                    {item.strategyName}
                  </th>
                  <td>{item.ticker}</td>
                  <td>{item.action}</td>
                  <td className="num">{item.confidence}</td>
                  <td className="text-sm text-muted">{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalog
          .filter((strategy) => strategy.status === "implemented")
          .map((strategy) => (
            <li key={strategy.id} className="strategy-tile">
              <h3 className="text-sm font-medium">
                <Link href={`/strategies/${strategy.id}`} className="hover:text-signal">
                  {strategy.name}
                </Link>
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted">{strategy.description}</p>
            </li>
          ))}
      </ul>
    </section>
  );
}
