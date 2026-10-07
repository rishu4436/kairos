import type { RuntimeDashboard } from "@/studio/view";

export function AgentRuntimePanel({ view }: { view: RuntimeDashboard }) {
  return (
    <section className="panel">
      <p className="eyebrow">Agent runtime</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg">Kairos</h2>
        <p className="text-xs tracking-[0.14em] text-muted uppercase">
          <span className="text-faint">○</span> {view.runtimeState}
        </p>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Agent Studio is the runtime. KAIROS decides. The operating wallet is not the trading wallet.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-line p-3">
          <h3 className="text-sm">Operating wallet</h3>
          <p className="mt-1 text-xs text-muted">Agent Studio identity and x402. Not user trading capital.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Identity" value={view.identity} />
            <Row label="Runtime" value={view.runtimeMode} />
            <Row label="Heartbeat" value={view.heartbeat} />
            <Row label="Next cycle" value={view.nextCycle} />
            <Row label="Address" value={view.operatingWallet} />
            <Row label="Balance" value={view.operatingBalance} />
            <Row label="x402" value="NOT USED" />
          </dl>
        </article>
        <article className="rounded-xl border border-aqua/40 p-3">
          <h3 className="text-sm">Trading wallet</h3>
          <p className="mt-1 text-xs text-muted">Agentic Wallet for authorized tokenized-stock trades. The model cannot sign.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Status" value={view.tradingWallet} />
            <Row label="Capital" value="User trading capital" />
            <Row label="Boundary" value="KAIROS risk, then wallet policy" />
          </dl>
        </article>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <p className="text-[0.68rem] tracking-[0.14em] text-muted uppercase">Health · {view.overall}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {view.checks.map((check) => (
              <li key={check.label} className="flex items-baseline justify-between gap-3">
                <span>
                  {check.mark} {check.label}
                </span>
                <span className="text-xs text-muted">{check.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[0.68rem] tracking-[0.14em] text-muted uppercase">Last cycle</p>
          <ul className="mt-2 space-y-1 text-sm">
            {view.steps.map((step) => (
              <li key={step.label} className="flex items-baseline justify-between gap-3">
                <span>{step.label}</span>
                <span className="text-xs text-muted">{step.mark}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function AgentIdentitySections({ view }: { view: RuntimeDashboard }) {
  return (
    <div className="grid gap-3">
      <AgentRuntimePanel view={view} />
      <section className="panel">
        <p className="eyebrow">Capabilities</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {view.capabilities.map((item) => (
            <li key={item} className="text-sm">
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.68rem] tracking-[0.14em] text-muted uppercase">Not granted</p>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {view.denied.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-faint">Wallet signing is delegated. Risk override is false. Private key access is false.</p>
      </section>
      <section className="panel">
        <p className="eyebrow">Security boundary</p>
        <p className="mt-2 text-sm text-muted">
          One Studio runtime would hold the agent operating key. KAIROS does not read that key. User trading stays on the Agentic Wallet, per user. A studio failure cannot create a trade.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
