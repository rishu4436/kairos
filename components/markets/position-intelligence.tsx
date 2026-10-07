import type { KAIROSContext } from "@/context/types";
import { captureCycleSnapshot, changedLines, diffPositionContext } from "@/position/diff";
import { explainAction } from "@/position/explain";

/** Presentational position reading. It does not decide or execute. */
export function PositionIntelligence({ context }: { context: KAIROSContext }) {
  const position = context.positionContext.value;
  if (!position || position.state === "NO_POSITION" || position.state === "CLOSED") {
    return null;
  }
  const current = captureCycleSnapshot(context);
  const diff = diffPositionContext({
    entry: position.entry,
    previous: position.previousSnapshot,
    current,
  });
  const changes = changedLines(diff);
  const entry = position.entry;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="eyebrow">Position intelligence</p>
      <p className="mt-1 text-xs text-muted">Paper research view. This block does not create an order.</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Block
          label="Entry context"
          value={
            entry
              ? `${entry.entryStrategySignal.strategyId} ${entry.entryStrategySignal.action} · ${entry.entryRegime ?? "—"} · ${entry.entryPrice}`
              : "No entry snapshot"
          }
        />
        <Block
          label="Current context"
          value={`${current.strategyAction ?? "—"} · ${current.regime ?? "—"} · ${current.price ?? "—"}`}
        />
        <Block label="Thesis state" value={position.thesisState ?? "—"} />
        <Block label="Next action" value={explainAction(position.lastDecision)} />
      </dl>
      <div className="mt-3">
        <p className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">What changed</p>
        {changes.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No difference from the entry snapshot.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
