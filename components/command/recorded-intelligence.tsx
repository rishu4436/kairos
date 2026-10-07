import market from "@/docs/evidence/phase-17i-market.json";
import qwen from "@/docs/evidence/phase-17i-qwen.json";

/** A recorded provider read is evidence, never a fresh quote or wallet balance. */
export function RecordedIntelligenceEvidence() {
  return (
    <section className="panel" aria-labelledby="recorded-intelligence-title">
      <p className="eyebrow">Recorded real provider evidence</p>
      <h2 id="recorded-intelligence-title" className="mt-1 text-lg">{market.row.ticker} · {market.row.tokenSymbol} · BSC</h2>
      <p className="mt-2 text-xs text-muted">Captured {market.timestamp}. This replay does not refresh provider data.</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <Fact label="Market source" value="BINANCE · RECORDED REAL RESPONSE" />
        <Fact label="Token price at capture" value={`$${market.row.price}`} />
        <Fact label="Regime" value={market.row.regime} />
        <Fact label="Arbitration" value={market.row.arbitration?.decision ?? "CONTEXT BLOCKED"} />
        <Fact label="Qwen" value={qwen.result.ok ? `RECORDED REAL RESPONSE · ${qwen.semanticValidation}` : qwen.httpStatus === null ? "REQUEST FAILED · NO RESPONSE" : `REQUEST FAILED · HTTP ${qwen.httpStatus}`} />
        <Fact label="Requested model" value={qwen.requestedModel} />
        <Fact label="FMP" value="NOT CONFIGURED · NEWS / EARNINGS UNAVAILABLE" />
        <Fact label="Context replay" value={`REDIS · VERIFIED AT CAPTURE · ${market.replay}`} />
        <Fact label="Trading wallet / execution" value="NOT CONNECTED · BLOCKED" />
      </dl>
      <p className="mt-3 break-all text-xs text-muted">Context {market.contextId}</p>
      <p className="mt-2 text-xs text-muted">Reference price is Binance&apos;s per-share token conversion. No official exchange stock quote or wallet equity is shown here.</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1">{value}</dd></div>;
}
