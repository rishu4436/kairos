import Link from "next/link";
import type { CommandCenterModel } from "@/services/command-center";
import type { ResearchLabModel } from "@/research/lab";

export function PaperLabPreview({ lab, research }: { lab: CommandCenterModel["lab"]; research: ResearchLabModel }) {
  return (
    <section className="panel panel-lab" aria-labelledby="lab-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">KAIROS research</p>
          <h2 id="lab-title" className="mt-1 text-base font-medium tracking-tight">
            Research brain
          </h2>
        </div>
        <Link href="/paper-lab" className="text-xs text-aqua hover:text-signal">
          Open the lab
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <LabStat label="Provider" value={research.productName} />
        <LabStat label="Status" value={research.llmLabel} />
        <LabStat label="Latest thesis" value={research.latestTitle} />
        <LabStat label="Source" value={research.latestSource} />
        <LabStat label="Data" value={research.latestData} />
        <LabStat label="Running" value={String(research.running)} />
      </dl>
      <p className="mt-4 text-xs text-muted">
        Paper experiment. Not real money. The sample ledger still reports {lab.activeExperiments} fixture experiments and {lab.underEvaluation} records under evaluation. Best recent fixture result {lab.bestRecent}.
      </p>
    </section>
  );
}

function LabStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-lg">{value}</dd>
    </div>
  );
}
