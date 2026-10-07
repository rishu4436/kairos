import { OperatorControls } from "@/components/operator/controls";
import { readOperatorConfig } from "@/operator/store";
import { commandState } from "@/operator/actions";
import { readRuntimeSnapshot, readWalletSnapshot } from "@/operator/snapshots";
import { autonomousStore } from "@/runtime/store";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";

export const metadata = { title: "Operator" };
export const dynamic = "force-dynamic";

export default function OperatorHome() {
  const config = readOperatorConfig();
  const runtime = readRuntimeSnapshot();
  const wallet = readWalletSnapshot();
  const control = commandState();
  const latest = autonomousStore().listCycles(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID).at(-1);
  return (
    <div className="space-y-3">
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
