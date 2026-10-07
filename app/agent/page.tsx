import { AGENT_STATE_DETAIL, AGENT_STATE_LABEL, AGENT_STATES, nextStates } from "@/agent/states";
import { AutonomousRuntimePanel } from "@/components/command/autonomous-runtime";
import { AgentIdentitySections } from "@/components/command/agent-runtime";
import { PageHeader } from "@/components/ui/page-header";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { readDataMode } from "@/lib/mode";
import { autonomousSnapshot, runManualPaperCycle } from "@/observation/autonomous-board";
import { getAgentPageModel } from "@/services/command-center";
import { buildRuntimeDashboard } from "@/studio/view";
import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { disconnectedAccount } from "@/wallet/agentic/parse";
import { DEMO_USER_ID } from "@/domain/watchlist";

export const metadata = { title: "Agent" };

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const model = getAgentPageModel();
  if (readDataMode() === "paper") {
    runManualPaperCycle();
  }
  const runtime = autonomousSnapshot();
  const trading = await new CliAgenticWalletGateway()
    .getStatus(DEMO_USER_ID, "agent_demo")
    .catch(() => disconnectedAccount(DEMO_USER_ID, "agent_demo", new Date().toISOString()));
  const allowed = nextStates(model.runtimeState).map((state) => AGENT_STATE_LABEL[state]);

  return (
    <>
      <PageHeader
        kicker="Runtime"
        title="Agent"
        description="The runtime state is separate from the trading lifecycle. Agent Studio is configured and undeployed; the operating wallet is configured and unfunded."
      />
      <PhaseBanner detail="The local runtime is not scheduled. Start, pause, and deploy controls are not available." />
      <div className="mb-4">
        <AutonomousRuntimePanel snapshot={runtime} />
      </div>
      <div className="mb-4">
        <AgentIdentitySections
          view={buildRuntimeDashboard({
            tradingConnected: trading.connectionStatus === "CONNECTED",
            market: "PAPER_SAMPLE",
            researchLabel: "NOT CONFIGURED",
          })}
        />
      </div>
      <p className="eyebrow mb-3">Trading lifecycle</p>
      <section className="panel mb-4 max-w-3xl">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Runtime" value={model.runtimeLabel} />
          <Item label="Mode" value={model.mode} />
          <Item label="User" value={model.user} />
          <Item label="Account" value={model.account} />
          <Item label="Wallet address" value={model.address} />
          <Item label="Legal next states" value={allowed.join(" · ")} />
        </dl>
      </section>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_STATES.map((state) => {
          const current = state === model.runtimeState;
          return (
            <li key={state} className={current ? "state-card state-current" : "state-card"}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">{AGENT_STATE_LABEL[state]}</h2>
                {current ? <span className="pill pill-signal">Current</span> : null}
              </div>
              <p className="mt-2 text-sm text-muted">{AGENT_STATE_DETAIL[state]}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
