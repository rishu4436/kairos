import type { LivePreviewModel } from "@/execution/preview";

export function LiveExecutionPreview({ preview }: { preview: LivePreviewModel }) {
  return (
    <section className="panel" aria-labelledby="live-preview-title">
      <p className="eyebrow">Live execution preview</p>
      <h2 id="live-preview-title" className="mt-1 text-base font-medium tracking-tight">
        {preview.side} {preview.asset}
      </h2>
      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <Item label="Notional" value={preview.notional} />
        <Item label="Expected price" value={preview.expectedPrice ?? "—"} />
        <Item label="Slippage" value={preview.slippage ?? "—"} />
        <Item label="Fee" value={preview.fee ?? "—"} />
        <Item label="Route" value={preview.route ?? "—"} />
        <Item label="Quote" value={preview.quote} />
        <Item label="Build" value={preview.build} />
        <Item label="Simulation" value={preview.simulation} />
        <Item label="Status" value={preview.status} />
      </dl>
      <p className="mt-4 text-sm">{preview.signing}</p>
      <p className="mt-1 text-sm text-muted">No transaction has been broadcast.</p>
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
