import { StrategyControl } from "@/components/operator/strategy-control";
import { PageHeader } from "@/components/ui/page-header";
import { detectPosture } from "@/operator/posture";
import { readOperatorConfig } from "@/operator/store";

export const metadata = { title: "Strategy control" };
export const dynamic = "force-dynamic";

export default function OperatorStrategiesPage() {
  const config = readOperatorConfig();
  const posture = detectPosture(config);
  const m = config.strategies.momentum;
  const r = config.strategies["mean-reversion"];
  const w = config.strategies.weekend;
  const d = config.strategies.dca;
  return (
    <>
      <PageHeader
        kicker="How the agent acts"
        title="Strategy control"
        description="Auto picks a risk posture. Manual sets the numbers yourself. The strategy rules stay the same."
      />
      <StrategyControl
        posture={posture}
        manual={{
          momentumReturn: (m.minReturnBps / 100).toFixed(2),
          momentumVol: (m.maxVolatilityBps / 100).toFixed(2),
          momentumSize: m.maxTradeNotional,
          meanEntry: (r.entryBps / 100).toFixed(2),
          meanSize: r.maxTradeNotional,
          weekendBand: (w.minDeviationBps / 100).toFixed(2),
          dcaOn: d.enabled,
          dcaDip: (d.dipThresholdBps / 100).toFixed(2),
          dcaSize: (config.capital.dcaOrderBpsOfDeployable / 100).toFixed(2),
          dcaBudget: (config.capital.dcaMaxBudgetBpsOfDeployable / 100).toFixed(2),
        }}
      />
    </>
  );
}
