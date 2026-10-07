import { PageHeader } from "@/components/ui/page-header";
import { readOperatorConfig } from "@/operator/store";
import { formatPercentFromBps } from "@/lib/format";

export const metadata = { title: "Risk" };

export const dynamic = "force-dynamic";

export default function RiskPage() {
  const config = readOperatorConfig();
  const model = {
    owner: config.identity.userId,
    liveTrading: config.risk.liveTradingEnabled ? "Enabled" : "Disabled",
    paperTrading: config.risk.paperTradingEnabled ? "Enabled" : "Disabled",
    maxPosition: `${config.risk.maxPositionNotional} USDT`,
    maxAllocation: formatPercentFromBps(config.risk.maxAllocationBps).replace("+", ""),
    maxDailyLoss: `${config.risk.maxDailyLoss} USDT`,
    maxSlippage: formatPercentFromBps(config.risk.maxSlippageBps).replace("+", ""),
    allowedAssets: config.risk.allowedAssets,
  };

  return (
    <>
      <PageHeader
        kicker="User enforced"
        title="Risk"
        description="Hard limits for the local user. The validator lives outside any future model proposer."
      />
      <p className="phase-banner" role="status">
        Read-only operator risk policy, version {config.version}. Change it on the operator console. This screen does not approve a trade.
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
