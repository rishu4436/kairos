import type { ProductionDashboard } from "@/services/dashboard";

export function ActivityFeed({ events }: { events: ProductionDashboard["activity"] }) {
  return (
    <section className="panel h-full" aria-labelledby="activity-title">
      <p className="eyebrow">Canonical runtime</p>
      <h2 id="activity-title" className="mt-1 text-base font-medium tracking-tight">
        Activity
      </h2>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No cycle or audit events are stored yet.</p>
      ) : (
        <ol className="mt-4 max-h-80 overflow-auto">
          {events.map((event) => (
            <li key={event.id} className="grid grid-cols-[4.6rem_minmax(0,1fr)] gap-3 border-l border-line py-2.5 pl-3">
              <time dateTime={event.at} className="num text-xs text-muted">
                {event.clock}
              </time>
              <p className="text-sm leading-5">
                <span className="text-muted">{event.kind}</span> · {event.message}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
