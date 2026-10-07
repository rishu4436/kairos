import { EmptyState } from "@/components/ui/empty-state";
import type { ProductionDashboard } from "@/services/dashboard";

export function Watchlist({ rows }: { rows: ProductionDashboard["watchlist"] }) {
  return (
    <section className="panel h-full" aria-labelledby="watchlist-title">
      <p className="eyebrow">Configured representations</p>
      <h2 id="watchlist-title" className="mt-1 text-base font-medium tracking-tight">
        Watchlist
      </h2>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No representations" body="The observation board has no rows yet." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[920px]">
            <caption className="sr-only">Watchlist representations from live observation</caption>
            <thead>
              <tr>
                <th scope="col">Ticker</th>
                <th scope="col">Token</th>
                <th scope="col">Platform</th>
                <th scope="col">Chain</th>
                <th scope="col">Contract</th>
                <th scope="col">Price</th>
                <th scope="col">Session</th>
                <th scope="col">Regime</th>
                <th scope="col">Quality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.representationId}>
                  <th scope="row" className="text-left font-medium">
                    {row.ticker}
                  </th>
                  <td>{row.tokenizedSymbol}</td>
                  <td>{row.platform}</td>
                  <td>{row.chain}</td>
                  <td className="num break-all text-xs">{row.contract}</td>
                  <td className="num">{row.price}</td>
                  <td>{row.session}</td>
                  <td>{row.regime}</td>
                  <td>{row.dataQuality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
