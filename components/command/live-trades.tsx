import { EmptyState } from "@/components/ui/empty-state";
import type { ProductionDashboard } from "@/services/dashboard";

export function LiveTradesPanel({ trades }: { trades: ProductionDashboard["liveTrades"] }) {
  return (
    <section className="panel" aria-labelledby="live-trades-title">
      <p className="eyebrow">On-chain</p>
      <h2 id="live-trades-title" className="mt-1 text-base font-medium tracking-tight">
        Live trades
      </h2>
      {trades.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No live trades yet." body="KAIROS has not submitted a wallet order. When trades exist they will show order ID, transaction hash, explorer link, asset, side, amount, and status." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[800px]">
            <caption className="sr-only">Live wallet trades</caption>
            <thead>
              <tr>
                <th scope="col">Order ID</th>
                <th scope="col">Tx</th>
                <th scope="col">Asset</th>
                <th scope="col">Side</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.orderId}>
                  <td className="num">{trade.orderId}</td>
                  <td>
                    <a href={trade.explorerUrl} className="text-signal">
                      {trade.txHash}
                    </a>
                  </td>
                  <td>{trade.asset}</td>
                  <td>{trade.side}</td>
                  <td className="num">{trade.amount}</td>
                  <td>{trade.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
