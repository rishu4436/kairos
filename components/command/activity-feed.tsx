import type { CommandCenterModel } from "@/services/command-center";

export function ActivityFeed({ events }: { events: CommandCenterModel["events"] }) {
  return (
    <section className="panel h-full" aria-labelledby="activity-title">
      <p className="eyebrow">Sample feed</p>
      <h2 id="activity-title" className="mt-1 text-base font-medium tracking-tight">
        Live agent activity
      </h2>
      <ol className="mt-4">
        {events.map((event) => (
          <li key={event.id} className="grid grid-cols-[4.6rem_minmax(0,1fr)] gap-3 border-l border-line py-2.5 pl-3">
            <time dateTime={event.at} className="num text-xs text-muted">
              {event.clock}
            </time>
            <p className="text-sm leading-5">{event.message}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">Stored paper activity. No activity appears until a cycle runs.</p>
    </section>
  );
}
