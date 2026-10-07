import type { AgenticWalletAccount } from "@/domain/agentic-wallet";

export function KairosLive({ account }: { account: AgenticWalletAccount }) {
  const connected = account.connectionStatus === "CONNECTED";
  return (
    <section className="panel" aria-labelledby="kairos-live-title">
      <p className="eyebrow">KAIROS live</p>
      <h2 id="kairos-live-title" className="mt-1 text-base font-medium">
        {connected ? "Wallet connected" : "NOT CONFIGURED"}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Item label="Risk" value="NOT CHECKED" />
        <Item label="Binance wallet" value={connected ? "CONNECTED" : "NOT CONFIGURED"} />
        <Item label="Wallet policy" value={account.securityPolicy?.quotaLeft === null || account.securityPolicy === null ? "—" : `${account.securityPolicy.quotaLeft} remaining`} />
        <Item label="Quote" value="NOT RUN" />
        <Item label="Simulation" value="NOT RUN" />
        <Item label="Execution" value="NOT READY" />
      </dl>
      <p className="mt-3 text-xs text-muted">No live order has been submitted. The sample portfolio is not this wallet.</p>
      <p className="mt-2 text-sm">NO TRANSACTION HAS BEEN BROADCAST</p>
      <button className="mt-3 rounded-md border border-line px-3 py-2 text-sm text-muted" type="button" disabled>
        Authorize live trade
      </button>
    </section>
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
