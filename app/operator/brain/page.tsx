import { loadProductionDashboard } from "@/services/dashboard";
import { readOperatorConfig } from "@/operator/store";

export const metadata = { title: "Operator brain" };
export const dynamic = "force-dynamic";

export default async function OperatorBrainPage() {
  const dashboard = await loadProductionDashboard();
  const config = readOperatorConfig();
  return (
    <div className="space-y-4">
      <section className="panel">
        <p className="eyebrow">WHAT KAIROS SEES</p>
        <div className="mt-3 overflow-x-auto">
          <table className="data-table min-w-[800px]">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Token</th>
                <th>Chain</th>
                <th>Contract</th>
                <th>Price</th>
                <th>Session</th>
                <th>Regime</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.watchlist.map((row) => (
                <tr key={row.representationId}>
                  <td>{row.ticker}</td>
                  <td>{row.tokenizedSymbol}</td>
                  <td>{row.chain}</td>
                  <td className="text-xs">{row.contract}</td>
                  <td>{row.price}</td>
                  <td>{row.session}</td>
                  <td>{row.regime}</td>
                  <td>{row.dataQuality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <p className="eyebrow">WHAT EACH STRATEGY THINKS</p>
        <p className="mt-2 text-xs text-muted">Config v{config.version}. Disabled strategies are not evaluated.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {dashboard.strategies.map((item) => (
            <li key={`${item.strategyId}:${item.ticker}`}>
              {item.strategyName} · {item.ticker} · {item.action} · {item.confidence} · {item.reason}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <p className="eyebrow">ARBITRATION</p>
        <ul className="mt-3 space-y-2 text-sm">
          {dashboard.arbitration.map((row) => (
            <li key={`${row.ticker}:${row.decision}`}>
              {row.ticker} · {row.decision} · {row.selectedStrategy} {row.selectedAction} · {row.reasons}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <p className="eyebrow">RISK / EXECUTION</p>
        <p className="mt-2 text-sm">Mode {dashboard.executionMode}. Quote {dashboard.preview.quote}. Build {dashboard.preview.build}. Sim {dashboard.preview.simulation}.</p>
        <ul className="mt-3 space-y-1 text-sm">
          {dashboard.riskExecution.map((row) => (
            <li key={`${row.ticker}:${row.executionState}`}>
              {row.ticker} · risk {row.riskState} · {row.executionState}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
