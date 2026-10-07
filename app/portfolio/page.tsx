import { EmptyState } from "@/components/ui/empty-state";
import { LiveTradesPanel } from "@/components/command/live-trades";
import { PortfolioPanel } from "@/components/command/portfolio-panel";
import { PageHeader } from "@/components/ui/page-header";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { readDataMode } from "@/lib/mode";
import { paperObservationBoard } from "@/observation/paper";
import { sessionPaperCapability } from "@/paper/run-cycle";
import { getPortfolioPageModel } from "@/services/command-center";
import { loadProductionDashboard } from "@/services/dashboard";

export const metadata = { title: "Portfolio" };

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const dashboard = await loadProductionDashboard();
  const model = getPortfolioPageModel();
  const mode = readDataMode();
  const authority = mode === "paper" ? sessionPaperCapability() : null;
  const cycle = authority ? (paperObservationBoard(DEMO_USER_ID, { authority }).paperCycle ?? null) : null;

  return (
    <>
      <PageHeader
        kicker="Agentic Wallet"
        title="Portfolio"
        description="Live balances come from the Agentic Wallet on BSC 56. The paper ledger is a separate simulated section."
      />
      <PhaseBanner detail="This page is read-only. It does not sign, broadcast, or enable LIVE." />
      <div className="mb-4">
        <PortfolioPanel live={dashboard.livePortfolio} />
      </div>
      <div className="mb-6">
        <LiveTradesPanel trades={dashboard.liveTrades} />
      </div>
      <h2 className="mb-3 text-base font-medium">Paper / Strategy Lab ledger</h2>
      <p className="mb-4 text-sm text-muted">Simulated paper account. Not wallet balances.</p>
      <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Summary label="Total equity" value={model.equity} />
        <Summary label="Available USDT" value={model.cash} />
        <Summary label="Invested" value={model.invested} />
        <Summary label="Realized PnL" value={model.realized} />
        <Summary label="Unrealized PnL" value={model.unrealized} />
        <Summary label="Total PnL" value={model.totalPnl} />
      </dl>
      {model.positions.length === 0 ? (
        <EmptyState title="No open paper positions" body="The current paper account has no positions." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[680px]">
            <caption className="sr-only">Open paper positions</caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Quantity</th>
                <th scope="col">Entry</th>
                <th scope="col">Mark</th>
                <th scope="col">Unrealized</th>
                <th scope="col">Strategy</th>
              </tr>
            </thead>
            <tbody>
              {model.positions.map((position) => (
                <tr key={position.symbol}>
                  <th scope="row" className="text-left font-medium">
                    {position.symbol}
                  </th>
                  <td className="num">{position.quantity}</td>
                  <td className="num">{position.entry}</td>
                  <td className="num">{position.mark}</td>
                  <td className="num">{position.pnl}</td>
                  <td>{position.strategy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="mt-6" aria-labelledby="cycle-book-title">
        <h2 id="cycle-book-title" className="text-base font-medium">
          Paper cycle book
        </h2>
        <p className="mt-1 text-sm text-muted">
          Paper cycle book. Live execution is a separate closed path and does not appear in this table.
        </p>
        {!cycle ? (
          <p className="mt-3 text-sm text-muted">The paper cycle runs in paper mode only.</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Summary label="Cycle equity" value={cycle.equity} />
              <Summary label="Cycle cash" value={cycle.cash} />
              <Summary label="Cycle unrealized" value={cycle.unrealizedPnl} />
            </dl>
            {cycle.positions.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No open paper-cycle position.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="data-table min-w-[1100px]">
                  <caption className="sr-only">Paper cycle positions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col">State</th>
                      <th scope="col">Origin</th>
                      <th scope="col">Version</th>
                      <th scope="col">Entry context</th>
                      <th scope="col">Thesis</th>
                      <th scope="col">Last decision</th>
                      <th scope="col">Adds</th>
                      <th scope="col">Reduces</th>
                      <th scope="col">Unrealized</th>
                      <th scope="col">Realized</th>
                      <th scope="col">Regime</th>
                      <th scope="col">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycle.positions.map((position) => (
                      <tr key={position.assetId}>
                        <th scope="row" className="text-left font-medium">
                          {position.asset}
                        </th>
                        <td>{position.lifecycle}</td>
                        <td>{position.strategy}</td>
                        <td>{position.strategyVersion}</td>
                        <td>{position.entryContextId}</td>
                        <td>{position.thesisState}</td>
                        <td>{position.lastDecision}</td>
                        <td className="num">{position.addCount}</td>
                        <td className="num">{position.reduceCount}</td>
                        <td className="num">{position.unrealizedPnl}</td>
                        <td className="num">{position.realizedPnl}</td>
                        <td>{position.regime}</td>
                        <td>{position.session}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-2 text-sm">{value}</dd>
    </div>
  );
}
