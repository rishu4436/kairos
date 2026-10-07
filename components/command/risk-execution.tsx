import type { ProductionDashboard } from "@/services/dashboard";

export function RiskExecutionPanel({
  rows,
  executionMode,
}: {
  rows: ProductionDashboard["riskExecution"];
  executionMode: ProductionDashboard["executionMode"];
}) {
  return (
    <section className="panel" aria-labelledby="risk-exec-title">
      <p className="eyebrow">Risk / execution</p>
      <h2 id="risk-exec-title" className="mt-1 text-base font-medium tracking-tight">
        {executionMode}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No risk or execution state is stored for the latest cycle.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[480px]">
            <caption className="sr-only">Latest cycle risk and execution state</caption>
            <thead>
              <tr>
                <th scope="col">Ticker</th>
                <th scope="col">Risk</th>
                <th scope="col">Execution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.ticker}:${row.executionState}`}>
                  <th scope="row" className="text-left font-medium">
                    {row.ticker}
                  </th>
                  <td>{row.riskState}</td>
                  <td>{row.executionState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Quote, build, and simulation appear only when a preparation record exists.</p>
    </section>
  );
}
