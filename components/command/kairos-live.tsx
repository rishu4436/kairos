import type { ProductionDashboard } from "@/services/dashboard";

export function KairosLive({ wallet }: { wallet: ProductionDashboard["wallet"] }) {
  return (
    <section className="panel" aria-labelledby="kairos-live-title">
      <p className="eyebrow">Agentic Wallet</p>
      <h2 id="kairos-live-title" className="mt-1 text-base font-medium">
        {wallet.connected ? "CONNECTED" : "DISCONNECTED"}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Item label="Address" value={wallet.address} />
        <Item label="Chain" value={wallet.chain} />
        <Item label="USDT" value={wallet.usdt} />
        <Item label="BNB" value={wallet.bnb} />
        <Item label="Quota used" value={wallet.quotaUsed} />
        <Item label="Quota remaining" value={wallet.quotaRemaining} />
        <Item label="High-risk handling" value={wallet.highRiskHandling} />
        <Item label="Token-scope provenance" value={wallet.tokenScope} />
      </dl>
      <p className="mt-3 text-xs text-muted">Public wallet status only. Auth and session secrets are not shown.</p>
      <p className="mt-2 text-sm">NO TRANSACTION HAS BEEN BROADCAST</p>
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
