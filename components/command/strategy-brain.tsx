import { decisionLabel } from "@/arbitration/labels";
import type { ArbitrationDecision, StrategyCandidate } from "@/domain/arbitration";

export function StrategyBrain({ decision }: { decision: ArbitrationDecision | null }) {
  if (!decision) {
    return null;
  }
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-[0.68rem] tracking-[0.14em] text-muted uppercase">Kairos decision</p>
      <p className="mt-1 text-sm tracking-[0.06em]">{decisionLabel(decision.decision, decision.selectedStrategyName)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted uppercase tracking-[0.12em]">Candidate action</dt>
          <dd className="num mt-1">{decision.selectedAction ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted uppercase tracking-[0.12em]">Score</dt>
          <dd className="num mt-1">{decision.score === null ? "—" : decision.score.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted uppercase tracking-[0.12em]">Confidence</dt>
          <dd className="num mt-1">{decision.confidence === null ? "—" : `${Math.round(decision.confidence * 100)}%`}</dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-1">
        {decision.candidates.map((candidate) => (
          <li key={candidate.strategyId} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span>{candidate.strategyName}</span>
            <span className="num text-muted">
              {candidate.action} · {candidate.score > 0 ? candidate.score.toFixed(2) : candidate.candidateStatus.replaceAll("_", " ")}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[0.68rem] text-faint">Analytical selection. Not an order. Loop is waiting for risk.</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs tracking-[0.12em] text-signal uppercase">Why</summary>
        <Why decision={decision} />
      </details>
    </div>
  );
}

function Why({ decision }: { decision: ArbitrationDecision }) {
  return (
    <div className="mt-2 space-y-3 text-xs">
      <p>{decision.evidence.summary}</p>
      {decision.evidence.supports.length > 0 ? (
        <div>
          <p className="text-muted uppercase tracking-[0.12em]">Supports</p>
          <ul className="mt-1 space-y-1">
            {decision.evidence.supports.map((item) => (
              <li key={item}>+ {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {decision.evidence.penalties.length > 0 ? (
        <div>
          <p className="text-muted uppercase tracking-[0.12em]">Penalties</p>
          <ul className="mt-1 space-y-1">
            {decision.evidence.penalties.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {decision.evidence.rejected.length > 0 ? (
        <div>
          <p className="text-muted uppercase tracking-[0.12em]">Rejected</p>
          <ul className="mt-1 space-y-1">
            {decision.evidence.rejected.map((item) => (
              <li key={item.strategyId}>
                {item.strategyName}. {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {decision.conflicts.map((conflict) => (
        <p key={`${conflict.leftStrategyId}:${conflict.rightStrategyId}`}>{conflict.summary}</p>
      ))}
      <CandidateMath candidates={decision.candidates} />
    </div>
  );
}

function CandidateMath({ candidates }: { candidates: readonly StrategyCandidate[] }) {
  return (
    <ul className="space-y-2">
      {candidates.map((candidate) => (
        <li key={`${candidate.strategyId}:math`}>
          <p>
            {candidate.strategyName} · {candidate.candidateStatus.replaceAll("_", " ")}
            {candidate.rejectionReason ? ` · ${candidate.rejectionReason}` : ""}
          </p>
          <p className="num text-muted">
            strength {candidate.components.signalStrength.toFixed(2)} · regime {candidate.components.regimeFit.toFixed(2)} · session{" "}
            {candidate.components.sessionFit.toFixed(2)} · data {candidate.components.dataQuality.toFixed(2)} · evidence{" "}
            {candidate.components.evidenceQuality.toFixed(2)} · health {candidate.components.strategyHealth.toFixed(2)}
          </p>
        </li>
      ))}
    </ul>
  );
}
