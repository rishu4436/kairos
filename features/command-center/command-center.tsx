import { AutonomousRuntimePanel } from "@/components/command/autonomous-runtime";
import { AgentRuntimePanel } from "@/components/command/agent-runtime";
import { ExternalIntelligencePanel } from "@/components/command/binance-intelligence";
import { AgentStatus } from "@/components/command/agent-status";
import { ActivityFeed } from "@/components/command/activity-feed";
import { ExecutionReadiness } from "@/components/command/execution-readiness";
import { KairosLive } from "@/components/command/kairos-live";
import { LiveExecutionPreview } from "@/components/command/live-preview";
import { LiveTradesPanel } from "@/components/command/live-trades";
import { DecisionCard } from "@/components/command/decision-card";
import { KairosContextPanel } from "@/components/context/kairos-context";
import { MarketObserver } from "@/components/command/market-observer";
import { MissionsTable } from "@/components/command/missions-table";
import { PaperLabPreview } from "@/components/command/paper-lab";
import { PortfolioPanel } from "@/components/command/portfolio-panel";
import { RiskPanel } from "@/components/command/risk-panel";
import { RiskExecutionPanel } from "@/components/command/risk-execution";
import { StrategyMatrix } from "@/components/command/strategy-matrix";
import { Watchlist } from "@/components/command/watchlist";
import { StrategyMemoryStrip } from "@/components/strategies/strategy-memory";
import { PageHeader } from "@/components/ui/page-header";
import { autonomousSnapshot } from "@/observation/autonomous-board";
import { loadResearchLab } from "@/research/lab";
import { executionReadiness } from "@/execution/preview";
import { buildSkillHealth } from "@/skills/health";
import { buildRuntimeDashboard } from "@/studio/view";
import { loadProductionDashboard } from "@/services/dashboard";

export async function CommandCenter() {
  const dashboard = await loadProductionDashboard();
  const board = dashboard.board;
  const runtime = autonomousSnapshot();
  const research = await loadResearchLab();
  const readiness = executionReadiness({
    strategy: dashboard.preview.asset,
    riskPass: dashboard.riskExecution.some((row) => row.riskState === "PASSED"),
    quotePass: dashboard.preview.quote === "VALID",
    simulationPass: dashboard.preview.simulation === "PASS",
    walletConfigured: dashboard.wallet.connected,
  });

  return (
    <>
      <PageHeader
        kicker={dashboard.dataMode === "live" ? "Market intelligence" : "Paper autonomous"}
        title="Command Center"
        description={
          dashboard.dataMode === "live"
            ? "Read-only view of the canonical runtime, watchlist, and Agentic Wallet. Orders are not sent from this dashboard."
            : "Paper observation and simulated ledger. This dashboard does not enable LIVE execution."
        }
        meta={
          dashboard.dataMode === "live" ? (
            <>
              <span className="pill pill-gain">Live market data</span>
              <span className="pill">{dashboard.executionMode}</span>
              <span className="pill pill-loss">Live trading off</span>
            </>
          ) : (
            <>
              <span className="pill pill-signal">PAPER MODE</span>
              <span className="pill pill-loss">NO REAL FUNDS</span>
            </>
          )
        }
      />
      <p className="mb-4 text-sm text-muted">{dashboard.disclaimer}</p>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <AgentStatus agent={dashboard.agent} />
        </div>
        <div className="xl:col-span-7">
          <PortfolioPanel live={dashboard.livePortfolio} />
        </div>
        <div className="xl:col-span-12">
          <AgentRuntimePanel
            view={buildRuntimeDashboard({
              tradingConnected: dashboard.wallet.connected,
              market: dashboard.dataMode === "live" ? (board.health.connection === "connected" ? "LIVE_OK" : "UNAVAILABLE") : "PAPER_SAMPLE",
              researchLabel: research.llmLabel,
            })}
          />
        </div>
        <div className="xl:col-span-12">
          <AutonomousRuntimePanel snapshot={runtime} />
        </div>
        <div className="xl:col-span-12">
          <Watchlist rows={dashboard.watchlist} />
        </div>
        <div className="xl:col-span-12">
          <MarketObserver dataMode={dashboard.dataMode} initialBoard={board} />
        </div>
        <div className="xl:col-span-12">
          <KairosContextPanel rows={board.rows} />
        </div>
        <div className="xl:col-span-12">
          <ExternalIntelligencePanel rows={board.rows} health={buildSkillHealth(dashboard.wallet.connected)} />
        </div>
        <div className="xl:col-span-12">
          <DecisionCard rows={dashboard.arbitration} />
        </div>
        <div className="xl:col-span-12">
          <StrategyMemoryStrip />
        </div>
        <div className="xl:col-span-12">
          <StrategyMatrix catalog={dashboard.paper.strategies} evaluations={dashboard.strategies} />
        </div>
        <div className="xl:col-span-4">
          <RiskPanel risk={dashboard.paper.risk} />
        </div>
        <div className="xl:col-span-8">
          <RiskExecutionPanel rows={dashboard.riskExecution} executionMode={dashboard.executionMode} />
        </div>
        <div className="xl:col-span-5">
          <ExecutionReadiness readiness={readiness} />
          <div className="mt-3">
            <KairosLive wallet={dashboard.wallet} />
          </div>
        </div>
        <div className="xl:col-span-7">
          <LiveExecutionPreview preview={dashboard.preview} />
        </div>
        <div className="xl:col-span-6">
          <ActivityFeed events={dashboard.activity} />
        </div>
        <div className="xl:col-span-6">
          <LiveTradesPanel trades={dashboard.liveTrades} />
        </div>
        <div className="xl:col-span-12">
          <MissionsTable missions={dashboard.paper.missions} />
        </div>
        <div className="xl:col-span-12">
          <PaperLabPreview lab={dashboard.paper.lab} research={research} />
        </div>
      </div>
    </>
  );
}
