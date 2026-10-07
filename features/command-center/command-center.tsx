import Link from "next/link";
import { RunFlow } from "@/components/operator/run-flow";
import { operatorMutationsAllowed } from "@/operator/guard";
import { buttonAvailability, controlFace, percentLabel, AUTO_PROFILES } from "@/operator/mandate";
import { detectPosture } from "@/operator/posture";
import { readOperatorConfig } from "@/operator/store";
import { autonomousStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { loadProductionDashboard } from "@/services/dashboard";

export async function CommandCenter() {
  const dashboard = await loadProductionDashboard();
  const posture = detectPosture(readOperatorConfig());
  const control = autonomousStore().readControl(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID);
  const buttons = buttonAvailability(controlFace(control, false), true);
  const capital = AUTO_PROFILES.MEDIUM;
  const mode = dashboard.executionMode === "LIVE" ? "LIVE" : dashboard.executionMode === "LIVE_PREVIEW" ? "LIVE PREVIEW" : "PAPER";
  const decisions = dashboard.arbitration.filter((row) => row.decision !== "—");
  const headline = decisions[0];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Desk</p>
          <h1 className="page-title">KAIROS</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="pill">{dashboard.agent.status}</span>
          <span className="pill">{mode}</span>
          <span className="pill">{posture === "MANUAL" ? "Manual" : posture}</span>
        </div>
      </header>

      {operatorMutationsAllowed() ? <div className="mb-3"><RunFlow buttons={buttons} /></div> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <Fact label="USDT" value={dashboard.wallet.usdt} />
        <Fact label="BNB" value={dashboard.wallet.bnb} />
        <Fact label="Next cycle" value={clock(dashboard.agent.nextCycle)} />
        <Fact label="Deployable" value={percentLabel(capital.deployableCapitalBps)} />
        <Fact label="Per trade" value={percentLabel(capital.perTradeBpsOfDeployable)} />
      </section>

      <section className="panel mt-3">
        <p className="eyebrow">Latest decision</p>
        <h2 className="mt-2 text-3xl tracking-tight">{headline ? `${headline.ticker} · ${headline.decision}` : "Waiting for a cycle"}</h2>
        {decisions.length > 1 ? (
          <ul className="mt-4 divide-y divide-line text-sm">
            {decisions.slice(0, 8).map((row) => (
              <li key={`${row.ticker}:${row.decision}`} className="flex justify-between gap-4 py-2">
                <span>{row.ticker}</span>
                <span className="text-muted">{row.decision}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="mt-4 text-sm">
        <Link href="/operator/strategies" className="text-signal">
          Strategy control
        </Link>
        <span className="text-muted"> · </span>
        <Link href="/operator" className="text-signal">
          Start agent
        </Link>
      </p>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-2 text-lg">{value === "—" ? "—" : value}</p>
    </div>
  );
}

function clock(value: string): string {
  if (!value || value === "—") {
    return "—";
  }
  const time = value.slice(11, 16);
  return time.length === 5 ? time : value;
}
