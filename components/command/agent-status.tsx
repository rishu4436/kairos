import type { CommandCenterModel } from "@/services/command-center";

export function AgentStatus({ agent }: { agent: CommandCenterModel["agent"] }) {
  return (
    <section className="panel flex h-full flex-col" aria-labelledby="agent-status-title">
      <p className="eyebrow">Agent status</p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h2 id="agent-status-title" className="text-[1.7rem] tracking-[0.18em]">
            KAIROS
          </h2>
          <p className="mt-1 text-xs tracking-[0.22em] text-muted">INTELLIGENCE</p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-2 text-sm tracking-[0.16em]">
            <span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
            SAMPLE
          </p>
          <p className="mt-1 text-xs text-muted">No orders</p>
        </div>
      </div>
      <dl className="mt-6 space-y-3 text-sm">
        <StatusRow label="Current mode" value={agent.mode} />
        <StatusRow label="Runtime" value={agent.runtimeLabel} />
        <StatusRow label="Current strategy" value={agent.strategy} />
        <StatusRow label="Last decision" value={agent.lastDecision} />
        <StatusRow label="Next evaluation" value={agent.nextEvaluation} />
      </dl>
      <p className="mt-auto pt-5 text-xs text-muted">
        Sample runtime. Market data is separate. This card does not place orders.
      </p>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
