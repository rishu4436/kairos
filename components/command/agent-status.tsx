import type { ProductionDashboard } from "@/services/dashboard";

export function AgentStatus({ agent }: { agent: ProductionDashboard["agent"] }) {
  return (
    <section className="panel flex h-full flex-col" aria-labelledby="agent-status-title">
      <p className="eyebrow">Agent status</p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h2 id="agent-status-title" className="text-[1.7rem] tracking-[0.18em]">
            KAIROS
          </h2>
          <p className="mt-1 text-xs tracking-[0.22em] text-muted">CANONICAL RUNTIME</p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-2 text-sm tracking-[0.16em]">
            <span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
            {agent.status}
          </p>
          <p className="mt-1 text-xs text-muted">{agent.executionMode}</p>
        </div>
      </div>
      <dl className="mt-6 space-y-3 text-sm">
        <StatusRow label="Runtime face" value={agent.status} />
        <StatusRow label="Control" value={agent.runtimeStatus} />
        <StatusRow label="Execution mode" value={agent.executionMode} />
        <StatusRow label="Last heartbeat" value={agent.lastHeartbeat} />
        <StatusRow label="Last completed cycle" value={agent.lastCompletedCycle} />
        <StatusRow label="Last cycle status" value={agent.lastCycleStatus} />
        <StatusRow label="Next cycle" value={agent.nextCycle} />
      </dl>
      <p className="mt-auto pt-5 text-xs text-muted">
        Read-only view of persisted heartbeat and cycle records. This panel does not start a cycle.
      </p>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all text-right text-xs">{value}</dd>
    </div>
  );
}
