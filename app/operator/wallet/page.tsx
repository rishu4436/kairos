import { readWalletSnapshot } from "@/operator/snapshots";
import { publishWalletSnapshot } from "@/operator/wallet-publish";
import { operatorMutationsAllowed } from "@/operator/guard";

export const metadata = { title: "Operator wallet" };
export const dynamic = "force-dynamic";

export default async function OperatorWalletPage() {
  if (operatorMutationsAllowed()) {
    await publishWalletSnapshot().catch(() => undefined);
  }
  const snap = readWalletSnapshot();
  return (
    <section className="panel">
      <p className="eyebrow">Agentic Wallet</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Item label="Status" value={snap.connectionStatus} />
        <Item label="Address" value={snap.address ?? "—"} />
        <Item label="Chain" value={snap.chainId} />
        <Item label="USDT" value={snap.usdt ?? "—"} />
        <Item label="BNB" value={snap.bnb ?? "—"} />
        <Item label="Quota used" value={snap.quotaUsed ?? "—"} />
        <Item label="Quota remaining" value={snap.quotaRemaining ?? "—"} />
        <Item label="High-risk" value={snap.highRiskHandling ?? "—"} />
        <Item label="Token-scope provenance" value={snap.tokenScope} />
        <Item label="Observed" value={snap.observedAt} />
      </dl>
      <p className="mt-3 text-xs text-muted">Operator-attested scope is not a Binance CLI allowlist proof. Wallet settings are not changed here.</p>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-all text-sm">{value}</dd>
    </div>
  );
}
