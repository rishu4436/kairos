import { PageHeader } from "@/components/ui/page-header";
import { getRiskPageModel } from "@/services/command-center";

export const metadata = { title: "Risk" };

export const dynamic = "force-dynamic";

export default function RiskPage() {
  const model = getRiskPageModel();

  return (
    <>
      <PageHeader
        kicker="User enforced"
        title="Risk"
        description="Hard limits for the local user. The validator lives outside any future model proposer."
      />
      <p className="phase-banner" role="status">
        Policy editing is not available. The values below are the local user&apos;s configured paper policy. The paper cycle sends intents through the same risk engine. This screen does not approve a trade.
      </p>
      <section className="panel panel-risk max-w-3xl">
        <p className="text-sm text-muted">Owner · {model.owner}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Item label="Live trading" value={model.liveTrading} />
          <Item label="Paper ledger" value={model.paperTrading} />
          <Item label="Max position" value={model.maxPosition} />
          <Item label="Max allocation" value={model.maxAllocation} />
          <Item label="Max daily loss" value={model.maxDailyLoss} />
          <Item label="Max slippage" value={model.maxSlippage} />
        </dl>
        <h2 className="mt-6 text-sm font-medium">Allowed assets</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {model.allowedAssets.map((asset) => (
            <li key={asset} className="pill">
              {asset}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1">{value}</dd>
    </div>
  );
}
