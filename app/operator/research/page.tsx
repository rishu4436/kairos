import { loadResearchLab } from "@/research/lab";
import { publicLlmStatus, readLlmConfig } from "@/research/llm-config";
import { readLlmAttempt } from "@/research/llm-status";
import { readOperatorConfig } from "@/operator/store";

export const metadata = { title: "Operator research" };
export const dynamic = "force-dynamic";

export default async function OperatorResearchPage() {
  const lab = await loadResearchLab();
  const attempt = readLlmAttempt();
  const llm = publicLlmStatus(readLlmConfig(), attempt ? { at: attempt.completedAt, latencyMs: attempt.latencyMs } : null);
  const config = readOperatorConfig();
  return (
    <section className="panel space-y-3">
      <p className="eyebrow">Research / Thesis</p>
      <p className="text-sm">{llm.configured ? "LLM CONFIGURED" : "LLM NOT CONFIGURED"}</p>
      {llm.configured ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Provider" value={llm.providerLabel} />
          <Item label="Model" value={llm.model} />
          <Item label="Last success" value={llm.lastSuccessAt ?? "—"} />
          <Item label="Latency" value={llm.latencyMs == null ? "—" : `${llm.latencyMs} ms`} />
        </dl>
      ) : (
        <p className="text-sm text-muted">Set the research provider and API key in your local environment file (see README) to enable thesis generation.</p>
      )}
      <p className="text-xs text-muted">
        Thesis generation stays paper-first. LLM cannot enable LIVE, change risk, or sign. Operator research flags: llm {String(config.research.llmResearchEnabled)}, paper thesis {String(config.research.paperThesisGenerationEnabled)}.
      </p>
      <p className="text-sm">Lab status {lab.llmLabel}. Latest {lab.latestTitle}</p>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
