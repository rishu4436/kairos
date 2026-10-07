import type { CommandCenterModel } from "@/services/command-center";

export function DecisionCard({ decision }: { decision: CommandCenterModel["decision"] }) {
  const end = Math.max(0, Math.min(100, decision.momentumPercent));
  const start = Math.min(50, end);
  const width = Math.abs(end - 50);

  return (
    <section className="panel decision-panel h-full" aria-labelledby="decision-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Current decision</p>
          <h2 id="decision-title" className="mt-3 text-4xl tracking-tight">
            {decision.symbol}
          </h2>
          <p className="mt-1 text-sm text-signal">{decision.posture}</p>
          <p className="mt-1 text-xs text-muted">{decision.name}</p>
        </div>
        <p className="decision-action">{decision.action}</p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <Factor label="Momentum" value={decision.momentum} />
        <Factor label="Liquidity" value={decision.liquidity} />
        <Factor label="Volatility" value={decision.volatility} />
        <Factor label="Event risk" value={decision.eventRisk} />
      </dl>

      <div className="mt-4" role="img" aria-label={`Momentum ${decision.momentum} on a scale from minus one to plus one`}>
        <div className="relative h-1.5 rounded-full bg-white/10">
          <span className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
          <span
            className="absolute inset-y-0 rounded-full bg-aqua"
            style={{ left: `${start}%`, width: `${width}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">Risk check</span>
        <span className="pill pill-gain">{decision.riskCheck}</span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span>Agent confidence</span>
          <span className="num">{decision.confidence}</span>
        </div>
        <div
          className="meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={decision.confidencePercent}
          aria-label="Agent confidence"
        >
          <span className="meter-fill" style={{ width: `${decision.confidencePercent}%` }} />
        </div>
      </div>

      <p className="mt-5 text-sm text-muted">{decision.note}</p>
    </section>
  );
}

function Factor({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1">{value}</dd>
    </div>
  );
}
