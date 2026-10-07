import type { ExecutionReadinessModel } from "@/execution/preview";

export function ExecutionReadiness({ readiness }: { readiness: ExecutionReadinessModel }) {
  return (
    <section className="panel" aria-labelledby="readiness-title">
      <p className="eyebrow">Execution readiness</p>
      <h2 id="readiness-title" className="mt-1 text-base font-medium tracking-tight">
        {readiness.final}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Item label="Strategy" value={readiness.strategy} />
        <Item label="Risk" value={readiness.risk} />
        <Item label="Quote" value={readiness.quote} />
        <Item label="Simulation" value={readiness.simulation} />
        <Item label="Wallet" value={readiness.wallet} />
        <Item label="Final" value={readiness.final} />
      </dl>
      <p className="mt-3 text-xs text-muted">Signing is disabled. No transaction has been broadcast.</p>
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
