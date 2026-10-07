import { autonomousStore } from "@/runtime/store";
import { LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID } from "@/domain/watchlist";
import { formatClock } from "@/lib/format";

export const metadata = { title: "Operator activity" };
export const dynamic = "force-dynamic";

export default function OperatorActivityPage() {
  const events = autonomousStore().listAudits(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID).slice(-80).reverse();
  return (
    <section className="panel">
      <p className="eyebrow">Audit</p>
      {events.length === 0 ? <p className="mt-3 text-sm text-muted">No audit records yet.</p> : (
        <ol className="mt-3 space-y-2 text-sm">
          {events.map((item) => (
            <li key={item.id}>
              <time dateTime={item.at}>{formatClock(item.at)}</time> · {item.type} · {item.message}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
