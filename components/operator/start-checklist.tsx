import Link from "next/link";
import type { ProductionDashboard } from "@/services/dashboard";

export function StartChecklist({
  dashboard,
  control,
  showControls,
}: {
  dashboard: Pick<ProductionDashboard, "dataMode" | "executionMode" | "wallet" | "agent" | "stateBackend">;
  control: string;
  showControls: boolean;
}) {
  const walletReady = dashboard.wallet.connected && dashboard.wallet.address !== "—";
  const scopeReady = dashboard.wallet.tokenScope === "OPERATOR_ATTESTED";
  const liveData = dashboard.dataMode === "live";
  const preview = dashboard.executionMode === "LIVE_PREVIEW" || dashboard.executionMode === "LIVE";
  const steps = [
    { ok: liveData, label: "Market data", value: liveData ? "live" : "paper (set KAIROS_DATA_MODE=live)" },
    { ok: walletReady, label: "Agentic Wallet", value: walletReady ? dashboard.wallet.address : "No snapshot yet. Open Operator wallet after the CLI is connected." },
    { ok: scopeReady, label: "Token scope", value: dashboard.wallet.tokenScope },
    { ok: preview, label: "Execution", value: dashboard.executionMode },
    { ok: control === "RUNNING", label: "Agent", value: `control ${control} · last cycle ${dashboard.agent.lastCycleStatus}` },
  ];
  return (
    <section className="panel">
      <p className="eyebrow">Live test</p>
      <h2 className="mt-1 text-base font-medium">Wallet, then start the agent</h2>
      <p className="mt-2 text-sm text-muted">
        Paper is only for thesis generation and paper experiments. This checklist is the operating path. LIVE_PREVIEW quotes and simulates. It does not sign or broadcast.
      </p>
      <ol className="mt-4 space-y-2 text-sm">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start justify-between gap-3 border-t border-line pt-2">
            <span>
              {index + 1}. {step.label}
              <span className="mt-1 block text-xs text-muted">{step.value}</span>
            </span>
            <span className={step.ok ? "pill pill-gain" : "pill"}>{step.ok ? "Ready" : "Waiting"}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted">State backend {dashboard.stateBackend}. Chain BSC 56. USDT {dashboard.wallet.usdt}. BNB {dashboard.wallet.bnb}.</p>
      {showControls ? (
        <p className="mt-3 text-sm">
          Connect the wallet in the Binance CLI, open <Link href="/operator/wallet" className="text-signal">Operator wallet</Link> to publish the snapshot, then press RUN. The persistent process is <span className="num">npm run kairos:runner</span>.
        </p>
      ) : (
        <p className="mt-3 text-sm">
          Start the agent from <Link href="/operator" className="text-signal">Operator</Link>. This page cannot enable LIVE.
        </p>
      )}
    </section>
  );
}
