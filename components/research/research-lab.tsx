import Link from "next/link";
import { ResearchLifecyclePanel } from "@/components/strategies/strategy-memory";
import type { ResearchLabModel } from "@/research/lab";

export function ResearchLab({ lab, detailId }: { lab: ResearchLabModel; detailId?: string }) {
  const card = detailId ? lab.cards.find((item) => item.thesisId === detailId) : lab.cards[0];
  return (
    <div className="space-y-3">
      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">KAIROS research lab</p>
            <h2 className="mt-1 text-base font-medium">Paper experiments</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">{lab.notice}</p>
          </div>
          <LlmStatus lab={lab} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Experiments" value={String(lab.cards.reduce((sum, item) => sum + item.experiments.length, 0))} />
          <Stat label="Running" value={String(lab.running)} />
          <Stat label="Candidates" value={String(lab.candidates)} />
          <Stat label="Rejected" value={String(lab.rejected)} />
          <Stat label="Promoted" value={String(lab.promoted)} />
          <Stat label="Paper capital" value={lab.paperCapital} />
        </dl>
      </section>
      <SafetyPanel />
      <ResearchLifecyclePanel />
      {card ? <ThesisPanel card={card} linked={!detailId} /> : <p className="text-sm text-muted">No thesis is stored. Generate one, or open the mock lab.</p>}
    </div>
  );
}

function SafetyPanel() {
  const rows = [
    ["Read market context", true],
    ["Generate thesis", true],
    ["Generate strategy proposal", true],
    ["Run paper experiment", true],
    ["Create trade intent", false],
    ["Modify risk policy", false],
    ["Access wallet", false],
    ["Sign", false],
    ["Broadcast", false],
  ] as const;
  return (
    <section className="panel">
      <p className="eyebrow">LLM permissions</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, allowed]) => (
          <li key={label} className="text-sm">
            <span className={allowed ? "text-gain" : "text-loss"}>{allowed ? "✓" : "✕"}</span> {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LlmStatus({ lab }: { lab: ResearchLabModel }) {
  const connected = lab.llmLabel === "CONNECTED";
  const failed = lab.llmLabel === "ERROR" || lab.llmLabel === "TIMEOUT";
  return (
    <div className="text-sm">
      <p className={connected ? "pill pill-gain" : failed ? "pill pill-loss" : "pill"}>
        {connected ? "●" : "○"} LLM {lab.llmLabel}
      </p>
      <p className="mt-2 text-xs text-muted">
        Market data {lab.marketDataLabel}
        {lab.llmLabel === "NOT CONFIGURED" ? " · Mock lab available" : ""}
      </p>
      {lab.providerLabel ? (
        <p className="mt-2 text-xs text-muted">
          Provider {lab.providerLabel}
          <br />
          Model {lab.model || "—"}
          <br />
          Last request {lab.lastSuccessAt ?? "none"} · latency {lab.latencyMs === null ? "—" : `${lab.latencyMs} ms`}
        </p>
      ) : null}
    </div>
  );
}

function ThesisPanel({ card, linked }: { card: ResearchLabModel["cards"][number]; linked: boolean }) {
  const experiment = card.experiments[0];
  return (
    <>
      <section className="panel">
        <p className="eyebrow">Active thesis</p>
        <h2 className="mt-1 text-2xl tracking-tight">
          {linked ? <Link href={`/paper-lab/${card.thesisId}`} className="hover:text-signal">{card.title}</Link> : card.title}
        </h2>
        <p className="mt-2 text-sm text-muted">{card.summary}</p>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <Stat label="Status" value={card.status} />
          <Stat label="Asset" value={card.assetId} />
          <Stat label="Confidence" value={card.confidence} />
          <Stat label="Validation" value={card.validation} />
        </dl>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <Stat label="Source" value={card.sourceType} />
          <Stat label="Provider" value={card.provider || "—"} />
          <Stat label="Model" value={card.model || "—"} />
          <Stat label="Data" value={card.dataSource} />
        </dl>
        <p className="mt-3 text-xs text-faint">
          {card.sourceType === "LLM" ? "Model-backed thesis" : "Mock thesis"} · {card.provider} · prompt {card.promptVersion}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Evidence title="Evidence" items={card.supporting} />
          <Evidence title="Contradicting evidence" items={card.contradicting} />
        </div>
        <p className="mt-4 text-sm">Hypothesis: {card.hypothesis}</p>
        <p className="mt-2 text-sm text-muted">Required data: {card.requiredData.join(" · ") || "—"}</p>
        <p className="mt-2 text-sm text-muted">Invalidation conditions: {card.invalidation || "—"}</p>
      </section>
      <section className="panel">
        <p className="eyebrow">Strategy proposal</p>
        {card.proposal ? (
          <>
            <h2 className="mt-1 text-base font-medium">Action {card.proposal.action}</h2>
            <p className="mt-1 text-xs text-muted">Holding period {card.proposal.holdingPeriod}. Status {card.proposal.status}. This is not an implemented strategy.</p>
            <h3 className="mt-3 text-sm font-medium">Entry</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {card.proposal.conditions.map((condition) => (
                <li key={condition} className="num">{condition}</li>
              ))}
            </ul>
            <h3 className="mt-3 text-sm font-medium">Exit</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {card.proposal.exitConditions.length > 0 ? card.proposal.exitConditions.map((condition) => (
                <li key={condition} className="num">{condition}</li>
              )) : <li className="text-muted">None</li>}
            </ul>
            <p className="mt-3 text-sm text-muted">Invalidation: {card.proposal.invalidation.join(" · ")}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">No proposal was accepted.</p>
        )}
      </section>
      <section className="panel">
        <p className="eyebrow">Experiment</p>
        <h2 className="mt-1 text-base font-medium">PAPER EXPERIMENT · NOT REAL MONEY</h2>
        {experiment ? (
          <>
            <p className="mt-2 text-sm text-muted">Dataset {experiment.dataset}. Status {experiment.status}{experiment.reason ? ` · ${experiment.reason}` : ""}.</p>
            <dl className="mt-4 grid gap-3 md:grid-cols-2">
              <Stat label="Data source" value={experiment.dataSource} />
              <Stat label="Thesis source" value={experiment.thesisSource} />
            </dl>
            <dl className="mt-4 grid gap-3 md:grid-cols-3">
              <Stat label="Research window" value={experiment.researchWindow} />
              <Stat label="Validation window" value={experiment.validationWindow} />
              <Stat label="Out-of-sample window" value={experiment.outOfSampleWindow} />
            </dl>
            <p className="mt-3 text-xs text-muted">
              {experiment.outOfSampleClaim ? "The out-of-sample window was long enough to report." : "Out-of-sample validity is not claimed."}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Trades" value={experiment.trades ?? "—"} />
              <Stat label="Net PnL" value={experiment.netPnl ?? "—"} />
              <Stat label="Max drawdown bps" value={experiment.drawdown ?? "—"} />
              <Stat label="Win rate" value={experiment.winRate ?? "—"} />
              <Stat label="Baseline net PnL" value={experiment.baseline ?? "—"} />
              <Stat label="Difference" value={experiment.difference ?? "—"} />
            </dl>
            <p className="mt-3 text-xs text-muted">Net PnL is after the paper fee assumption. A positive number is not a promotion.</p>
            {experiment.warnings.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-signal">
                {experiment.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">No experiment was run.</p>
        )}
      </section>
    </>
  );
}

function Evidence({ title, items }: { title: string; items: readonly { kind: string; statement: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={`${item.kind}:${item.statement}`} className="text-sm text-muted">
            <span className="text-faint">{item.kind}</span> · {item.statement}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-sm">{value}</dd>
    </div>
  );
}
