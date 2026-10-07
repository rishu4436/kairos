import Link from "next/link";
import { OperatorConfigForm } from "@/components/operator/controls";
import { readOperatorConfig } from "@/operator/store";
import { MEAN_REVERSION_PARAMS, MOMENTUM_PARAMS, WEEKEND_PARAMS } from "@/strategies/parameters";

export const metadata = { title: "Operator strategies" };
export const dynamic = "force-dynamic";

export default function OperatorStrategiesPage() {
  const config = readOperatorConfig();
  const m = config.strategies.momentum;
  const r = config.strategies["mean-reversion"];
  const w = config.strategies.weekend;
  const d = config.strategies.dca;
  return (
    <div className="space-y-4">
      <section className="panel">
        <h2 className="text-base font-medium">Momentum</h2>
        <p className="text-xs text-muted">KAIROS default min return {(MOMENTUM_PARAMS.minReturnBps / 100).toFixed(2)}%</p>
        <OperatorConfigForm
          action="momentum"
          fields={[
            { name: "strategies.momentum.enabled", label: "Enabled", defaultValue: String(m.enabled) },
            { name: "strategies.momentum.minReturnBps", label: "Minimum return (bps)", defaultValue: String(m.minReturnBps) },
            { name: "strategies.momentum.momentumBars", label: "Momentum bars", defaultValue: String(m.momentumBars) },
            { name: "strategies.momentum.trendPeriod", label: "Trend period", defaultValue: String(m.trendPeriod) },
            { name: "strategies.momentum.maxVolatilityBps", label: "Max volatility (bps)", defaultValue: String(m.maxVolatilityBps) },
            { name: "strategies.momentum.minCandles", label: "Minimum candles", defaultValue: String(m.minCandles) },
            { name: "strategies.momentum.maxTradeNotional", label: "Max trade USDT (blank = none)", defaultValue: m.maxTradeNotional },
          ]}
        />
      </section>
      <section className="panel">
        <h2 className="text-base font-medium">Mean reversion</h2>
        <p className="text-xs text-muted">KAIROS default entry {(MEAN_REVERSION_PARAMS.entryBps / 100).toFixed(2)}%</p>
        <OperatorConfigForm
          action="mean-reversion"
          fields={[
            { name: "strategies.mean-reversion.enabled", label: "Enabled", defaultValue: String(r.enabled) },
            { name: "strategies.mean-reversion.entryBps", label: "Entry deviation (bps)", defaultValue: String(r.entryBps) },
            { name: "strategies.mean-reversion.period", label: "Lookback period", defaultValue: String(r.period) },
            { name: "strategies.mean-reversion.minCandles", label: "Minimum history", defaultValue: String(r.minCandles) },
            { name: "strategies.mean-reversion.maxTradeNotional", label: "Max trade USDT", defaultValue: r.maxTradeNotional },
          ]}
        />
      </section>
      <section className="panel">
        <h2 className="text-base font-medium">Weekend / off-hours</h2>
        <p className="text-xs text-muted">OBSERVATION / DISLOCATION STRATEGY. Default band {(WEEKEND_PARAMS.minDeviationBps / 100).toFixed(2)}%. HOLD only.</p>
        <OperatorConfigForm
          action="weekend"
          fields={[
            { name: "strategies.weekend.enabled", label: "Enabled", defaultValue: String(w.enabled) },
            { name: "strategies.weekend.minDeviationBps", label: "Minimum reference deviation (bps)", defaultValue: String(w.minDeviationBps) },
          ]}
        />
      </section>
      <section className="panel">
        <h2 className="text-base font-medium">DCA</h2>
        <p className="text-xs text-muted">Position-management owned by DCA. Default disabled. DIP_BASED 5% / 5 USDT / 50 USDT / 10 tranches.</p>
        <OperatorConfigForm
          action="dca"
          fields={[
            { name: "strategies.dca.enabled", label: "Enabled", defaultValue: String(d.enabled) },
            { name: "strategies.dca.mode", label: "Mode TIME_BASED | DIP_BASED", defaultValue: d.mode },
            { name: "strategies.dca.dipThresholdBps", label: "Dip threshold (bps)", defaultValue: String(d.dipThresholdBps) },
            { name: "strategies.dca.baseOrderNotional", label: "Base order (USDT)", defaultValue: d.baseOrderNotional },
            { name: "strategies.dca.maxBudgetNotional", label: "Strategy budget (USDT)", defaultValue: d.maxBudgetNotional },
            { name: "strategies.dca.maxTranches", label: "Max tranches", defaultValue: String(d.maxTranches) },
            { name: "strategies.dca.intervalMs", label: "Time interval (ms)", defaultValue: String(d.intervalMs) },
            { name: "strategies.dca.reference", label: "Reference LAST_DCA_FILL | INITIAL_REFERENCE", defaultValue: d.reference },
          ]}
        />
      </section>
      <p className="text-sm">
        <Link href="/operator/brain" className="text-signal">
          Open brain view
        </Link>
      </p>
    </div>
  );
}
