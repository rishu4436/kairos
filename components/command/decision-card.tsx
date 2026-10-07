import type { ProductionDashboard } from "@/services/dashboard";

export function DecisionCard({ rows }: { rows: ProductionDashboard["arbitration"] }) {
  const headline = rows.find((row) => row.decision !== "—") ?? rows[0];
  return (
    <section className="panel decision-panel h-full" aria-labelledby="decision-title">
      <p className="eyebrow">Arbitration</p>
      <h2 id="decision-title" className="mt-3 text-2xl tracking-tight">
        {headline ? `${headline.ticker} · ${headline.decision}` : "No arbitration yet"}
      </h2>
      {headline ? (
        <p className="mt-2 text-sm text-muted">
          {headline.selectedStrategy} {headline.selectedAction} · {headline.reasons}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No arbitration record is stored for this cycle.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <caption className="sr-only">Arbitration decisions from the observation board</caption>
            <thead>
              <tr>
                <th scope="col">Ticker</th>
                <th scope="col">Decision</th>
                <th scope="col">Strategy</th>
                <th scope="col">Action</th>
                <th scope="col">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.ticker}:${row.decision}:${row.reasons}`}>
                  <th scope="row" className="text-left font-medium">
                    {row.ticker}
                  </th>
                  <td>{row.decision}</td>
                  <td>{row.selectedStrategy}</td>
                  <td>{row.selectedAction}</td>
                  <td className="text-sm text-muted">{row.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
