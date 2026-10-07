import { Pnl } from "@/components/ui/pnl";
import { Sparkline } from "@/components/ui/sparkline";
import type { CommandCenterModel } from "@/services/command-center";

export function PortfolioPanel({ portfolio }: { portfolio: CommandCenterModel["portfolio"] }) {
  return (
    <section className="panel h-full" aria-labelledby="portfolio-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Sample ledger</p>
          <h2 id="portfolio-title" className="mt-1 text-base font-medium tracking-tight">
            Portfolio
          </h2>
          <p className="mt-1 text-xs text-muted">Fixture book. The paper cycle uses a separate simulated account.</p>
        </div>
        <Sparkline values={portfolio.sparkline} label="Simulated equity path ending at the current paper equity" />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
        <Metric label="Total equity" value={portfolio.equity} />
        <Metric label="Available USDT" value={portfolio.cash} />
        <Metric label="Invested" value={portfolio.invested} />
        <div>
          <dt className="text-xs text-muted">Today&apos;s PnL</dt>
          <dd className="mt-1 text-sm sm:text-base">
            <Pnl value={portfolio.todayPnl} direction={portfolio.todayDirection} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Total PnL</dt>
          <dd className="mt-1 text-sm sm:text-base">
            <Pnl value={portfolio.totalPnl} direction={portfolio.totalDirection} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-sm sm:text-base">{value}</dd>
    </div>
  );
}
