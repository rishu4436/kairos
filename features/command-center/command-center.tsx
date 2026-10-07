import { AutonomousRuntimePanel } from "@/components/command/autonomous-runtime";
import { RecordedIntelligenceEvidence } from "@/components/command/recorded-intelligence";
import { AgentRuntimePanel } from "@/components/command/agent-runtime";
import { ExternalIntelligencePanel } from "@/components/command/binance-intelligence";
import { AgentStatus } from "@/components/command/agent-status";
import { ExecutionReadiness } from "@/components/command/execution-readiness";
import { KairosLive } from "@/components/command/kairos-live";
import { LiveExecutionPreview } from "@/components/command/live-preview";
import { DecisionCard } from "@/components/command/decision-card";
import { KairosContextPanel } from "@/components/context/kairos-context";
import { MarketObserver } from "@/components/command/market-observer";
import { MissionsTable } from "@/components/command/missions-table";
import { PaperLabPreview } from "@/components/command/paper-lab";
import { PortfolioPanel } from "@/components/command/portfolio-panel";
import { RiskPanel } from "@/components/command/risk-panel";
import { StrategyMatrix } from "@/components/command/strategy-matrix";
import { StrategyMemoryStrip } from "@/components/strategies/strategy-memory";
import { PageHeader } from "@/components/ui/page-header";
import { autonomousSnapshot } from "@/observation/autonomous-board";
import { loadDemoObservationBoard } from "@/observation/load-board";
import { loadResearchLab } from "@/research/lab";
import { emptyLivePreview, executionReadiness } from "@/execution/preview";
import { resolveScopedWallet } from "@/domain/wallet-scope";
import { DEMO_USER_ID } from "@/domain/watchlist";
import { getCommandCenterModel } from "@/services/command-center";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { disconnectedAccount } from "@/wallet/agentic/parse";
import { buildSkillHealth } from "@/skills/health";
import { buildRuntimeDashboard } from "@/studio/view";

export async function CommandCenter() {
  const model = getCommandCenterModel();
  const board = await loadDemoObservationBoard();
  const runtime = autonomousSnapshot();
  const research = await loadResearchLab();
  const wallet = resolveScopedWallet(DEMO_USER_ID);
  const readiness = executionReadiness({
    strategy: model.agent.strategy,
    riskPass: false,
    quotePass: false,
    simulationPass: false,
    walletConfigured: wallet.ok,
  });
  const preview = emptyLivePreview();
  const walletAccount = await new CliAgenticWalletGateway()
    .getStatus(DEMO_USER_ID, "agent_demo")
    .catch(() => disconnectedAccount(DEMO_USER_ID, "agent_demo", new Date().toISOString()));

  return (
    <>
      <PageHeader
        kicker={model.dataMode === "live" ? "Market intelligence" : "Paper autonomous"}
        title="Command Center"
        description={
          model.dataMode === "live"
            ? "KAIROS observes the watchlist, evaluates strategies, and selects or rejects candidates. Orders are not sent."
            : "KAIROS can complete a paper decision loop from a selected strategy to a simulated position. This is simulated execution and does not broadcast blockchain transactions."
        }
        meta={
          model.dataMode === "live" ? (
            <>
              <span className="pill pill-gain">Live market data</span>
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
      <p className="mb-4 text-sm text-muted">{model.disclaimer}</p>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <AgentStatus agent={model.agent} />
        </div>
        <div className="xl:col-span-7">
          <PortfolioPanel portfolio={model.portfolio} />
        </div>
        <div className="xl:col-span-12">
          <AgentRuntimePanel
            view={buildRuntimeDashboard({
              tradingConnected: walletAccount.connectionStatus === "CONNECTED",
              market: model.dataMode === "live" ? (board.health.connection === "connected" ? "LIVE_OK" : "UNAVAILABLE") : "PAPER_SAMPLE",
              researchLabel: research.llmLabel,
            })}
          />
        </div>
        <div className="xl:col-span-12">
          <AutonomousRuntimePanel snapshot={runtime} />
        </div>
        <div className="xl:col-span-12">
          <RecordedIntelligenceEvidence />
        </div>
        <div className="xl:col-span-12">
          <MarketObserver dataMode={model.dataMode} initialBoard={board} />
        </div>
        <div className="xl:col-span-12">
          <KairosContextPanel rows={board.rows} />
        </div>
        <div className="xl:col-span-12">
          <ExternalIntelligencePanel rows={board.rows} health={buildSkillHealth(walletAccount.connectionStatus === "CONNECTED")} />
        </div>
        <div className="xl:col-span-12">
          <DecisionCard decision={model.decision} />
        </div>
        <div className="xl:col-span-12">
          <StrategyMemoryStrip />
        </div>
        <div className="xl:col-span-12">
          <StrategyMatrix strategies={model.strategies} />
        </div>
        <div className="xl:col-span-4">
          <RiskPanel risk={model.risk} />
        </div>
        <div className="xl:col-span-8">
          <MissionsTable missions={model.missions} />
        </div>
        <div className="xl:col-span-5">
          <ExecutionReadiness readiness={readiness} />
          <div className="mt-3">
            <KairosLive account={walletAccount} />
          </div>
        </div>
        <div className="xl:col-span-7">
          <LiveExecutionPreview preview={preview} />
        </div>
        <div className="xl:col-span-12">
          <PaperLabPreview lab={model.lab} research={research} />
        </div>
      </div>
    </>
  );
}
