import { AGENT_STATE_DETAIL, AGENT_STATE_LABEL, AGENT_STATES, nextStates } from "@/agent/states";
import { AutonomousRuntimePanel } from "@/components/command/autonomous-runtime";
import { AgentIdentitySections } from "@/components/command/agent-runtime";
import { PageHeader } from "@/components/ui/page-header";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { autonomousSnapshot } from "@/observation/autonomous-board";
import { getAgentPageModel } from "@/services/command-center";
import { loadProductionDashboard } from "@/services/dashboard";
import { buildRuntimeDashboard } from "@/studio/view";

export const metadata = { title: "Agent" };

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const model = getAgentPageModel();
  const dashboard = await loadProductionDashboard();
  const runtime = autonomousSnapshot();
  const allowed = nextStates(model.runtimeState).map((state) => AGENT_STATE_LABEL[state]);

  return (
    <>
      <PageHeader
        kicker="Runtime"
        title="Agent"
        description="Agent heartbeat for the operating runtime. Start and pause live in the operator console."
      />
      <PhaseBanner detail="Paper fills are not this page. Thesis tests stay in Paper Lab. Starting the agent is on /operator." />
      <div className="mb-4">
        <AutonomousRuntimePanel snapshot={runtime} />
      </div>
      <div className="mb-4">
        <AgentIdentitySections
          view={buildRuntimeDashboard({
            tradingConnected: dashboard.wallet.connected,
            market: dashboard.dataMode === "live" ? "LIVE_OK" : "PAPER_SAMPLE",
            researchLabel: "NOT CONFIGURED",
          })}
        />
      </div>
      <p className="eyebrow mb-3">Trading lifecycle</p>
      <section className="panel mb-4 max-w-3xl">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Runtime" value={dashboard.agent.status} />
          <Item label="Mode" value={dashboard.executionMode} />
          <Item label="User" value={model.user} />
          <Item label="Last heartbeat" value={dashboard.agent.lastHeartbeat} />
          <Item label="Wallet address" value={dashboard.wallet.address} />
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
