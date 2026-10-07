import type { AgenticTokenBalance, AgenticWalletAccount } from "@/domain/agentic-wallet";
import { readOperatorTokenScope } from "@/wallet/agentic/token-scope";

export function WalletPanel({ account, balances }: { account: AgenticWalletAccount; balances: readonly AgenticTokenBalance[] }) {
  const connected = account.connectionStatus === "CONNECTED";
  const policy = account.securityPolicy;
  const usdt = balances.find((item) => item.symbol === "USDT");
  const bnb = balances.find((item) => (item.symbol ?? "").toUpperCase() === "BNB");
  const tokenScope = readOperatorTokenScope()?.provenance ?? "TOKEN_SCOPE_UNVERIFIED";
  return (
    <section className="panel">
      <p className="eyebrow">KAIROS decided · Binance wallet authorizes</p>
      <h2 className="mt-1 text-base font-medium">Agentic Wallet</h2>
      <p className="mt-3 text-sm">{connected ? "CONNECTED" : "DISCONNECTED"}</p>
      <ol className="mt-4 space-y-1 text-sm text-muted">
        <li>1. Create or prepare a Binance MPC wallet in the Binance App.</li>
        <li>2. Connect Agentic Wallet with the pairing URL the CLI returns.</li>
        <li>3. Set the Binance safety limits in the App. KAIROS cannot change them.</li>
        <li>4. Return to KAIROS.</li>
        <li>5. KAIROS reads `baw wallet status` before it treats the wallet as ready.</li>
      </ol>
      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <Item label="Address" value={account.walletAddress ?? "—"} />
        <Item label="Chain" value="BSC" />
        <Item label="USDT balance" value={usdt?.amount ?? "—"} />
        <Item label="BNB balance" value={bnb?.amount ?? "—"} />
        <Item label="Quota used" value={policy?.quotaUsed == null ? "—" : String(policy.quotaUsed)} />
        <Item label="Quota remaining" value={policy?.quotaLeft == null ? "—" : String(policy.quotaLeft)} />
        <Item label="Token-scope provenance" value={tokenScope} />
        <Item label="High-risk handling" value={policy?.highRiskHandling ?? "—"} />
      </dl>
      <p className="mt-4 text-sm text-muted">This wallet is separate from the simulated paper account. Signing material is not stored in KAIROS.</p>
      {balances.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {balances.map((item) => (
            <li key={`${item.contractAddress ?? "none"}:${item.symbol ?? "token"}`}>
              {item.symbol ?? "Token"} · {item.amount ?? "—"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No tokenized-stock holding is visible while the wallet is disconnected.</p>
      )}
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
