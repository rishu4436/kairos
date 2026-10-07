import { OperatorControls } from "@/components/operator/controls";
import { StartChecklist } from "@/components/operator/start-checklist";
import { readOperatorConfig } from "@/operator/store";
import { commandState } from "@/operator/actions";
import { readRuntimeSnapshot, readWalletSnapshot } from "@/operator/snapshots";
import { publishWalletSnapshot } from "@/operator/wallet-publish";
import { operatorMutationsAllowed } from "@/operator/guard";
import { autonomousStore } from "@/runtime/store";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";
import { loadProductionDashboard } from "@/services/dashboard";

export const metadata = { title: "Operator" };
export const dynamic = "force-dynamic";

export default async function OperatorHome() {
  if (operatorMutationsAllowed()) {
    await publishWalletSnapshot().catch(() => undefined);
  }
  const dashboard = await loadProductionDashboard();
  const config = readOperatorConfig();
  const runtime = readRuntimeSnapshot();
  const wallet = readWalletSnapshot();
  const control = commandState();
  const latest = autonomousStore().listCycles(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID).at(-1);
  return (
    <div className="space-y-3">
      <StartChecklist dashboard={dashboard} control={control.control} showControls />
      <OperatorControls />
      <section className="panel">
        <p className="eyebrow">Canonical runtime</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Item label="Control" value={control.control} />
          <Item label="Snapshot" value={runtime.status} />
          <Item label="Execution mode" value={config.runtime.executionMode} />
          <Item label="Config version" value={String(config.version)} />
          <Item label="Last cycle" value={latest?.status ?? "—"} />
          <Item label="Wallet" value={wallet.connectionStatus} />
        </dl>
      </section>
    </div>
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
