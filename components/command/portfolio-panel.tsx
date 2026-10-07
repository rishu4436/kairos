import type { ProductionDashboard } from "@/services/dashboard";

export function PortfolioPanel({ live }: { live: ProductionDashboard["livePortfolio"] }) {
  return (
    <section className="panel h-full" aria-labelledby="portfolio-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Agentic Wallet</p>
          <h2 id="portfolio-title" className="mt-1 text-base font-medium tracking-tight">
            Live portfolio
          </h2>
          <p className="mt-1 text-xs text-muted">Wallet balances on BSC 56. This is not the paper ledger.</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <Metric label="Address" value={live.address} />
        <Metric label="USDT" value={live.usdt} />
        <Metric label="BNB" value={live.bnb} />
      </dl>
      {live.holdings.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No wallet holdings are visible.</p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {live.holdings.map((item, index) => (
            <li key={`${item.symbol}:${index}`}>
              {item.symbol} · {item.amount}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 break-all text-sm sm:text-base">{value}</dd>
    </div>
  );
}
