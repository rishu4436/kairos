import { CliAgenticWalletGateway } from "@/wallet/agentic/cli";
import { persistWalletSnapshot, readWalletSnapshot } from "@/operator/snapshots";
import { readOperatorTokenScope } from "@/wallet/agentic/token-scope";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";
import { operatorMutationsAllowed } from "@/operator/guard";

export const metadata = { title: "Operator wallet" };
export const dynamic = "force-dynamic";

export default async function OperatorWalletPage() {
  if (operatorMutationsAllowed()) {
    const gateway = new CliAgenticWalletGateway();
    const account = await gateway.getStatus(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID).catch(() => null);
    const balances = account?.connectionStatus === "CONNECTED" ? await gateway.getBalances(LOCAL_RUNTIME_USER_ID, "56").catch(() => []) : [];
    const usdt = balances.find((item) => item.symbol === "USDT")?.amount ?? null;
    const bnb = balances.find((item) => (item.symbol ?? "").toUpperCase() === "BNB")?.amount ?? null;
    persistWalletSnapshot({
      connectionStatus: account?.connectionStatus === "CONNECTED" ? "CONNECTED" : "UNCONNECTED",
      address: account?.walletAddress ?? null,
      chainId: "56",
      bnb,
      usdt,
      tokens: balances.filter((item) => item.amount).map((item) => ({ symbol: item.symbol ?? "Token", amount: item.amount ?? "—" })),
      quotaUsed: account?.securityPolicy?.quotaUsed == null ? null : String(account.securityPolicy.quotaUsed),
      quotaRemaining: account?.securityPolicy?.quotaLeft == null ? null : String(account.securityPolicy.quotaLeft),
      highRiskHandling: account?.securityPolicy?.highRiskHandling ?? null,
      tokenScope: readOperatorTokenScope() ? "OPERATOR_ATTESTED" : "TOKEN_SCOPE_UNVERIFIED",
      observedAt: new Date().toISOString(),
      stale: false,
    });
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
