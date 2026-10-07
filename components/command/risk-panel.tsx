import type { CommandCenterModel } from "@/services/command-center";

export function RiskPanel({ risk }: { risk: CommandCenterModel["risk"] }) {
  return (
    <section className="panel panel-risk h-full" aria-labelledby="risk-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">User enforced</p>
          <h2 id="risk-title" className="mt-1 text-base font-medium tracking-tight">
            Risk
          </h2>
        </div>
        <LockIcon />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        These limits belong to the user. Deterministic code enforces them. The agent cannot override them.
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <RiskRow label="Max position" value={risk.maxPosition} />
        <RiskRow label="Max daily loss" value={risk.maxDailyLoss} />
        <RiskRow label="Max slippage" value={risk.maxSlippage} />
        <div className="border-t border-line pt-3">
          <dt className="text-muted">Allowed assets</dt>
          <dd className="mt-1">{risk.allowedAssets}</dd>
        </div>
        <div className="border-t border-line pt-3">
          <dt className="text-muted">Trading status</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            <span className="pill pill-loss">Live {risk.liveTrading}</span>
            <span className="pill pill-aqua">Paper {risk.paperTrading}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RiskRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
      <dt className="text-muted">{label}</dt>
      <dd className="num text-right">{value}</dd>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="mt-1 text-signal">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
