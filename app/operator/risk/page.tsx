import { OperatorConfigForm } from "@/components/operator/controls";
import { readOperatorConfig } from "@/operator/store";

export const metadata = { title: "Operator risk" };
export const dynamic = "force-dynamic";

export default function OperatorRiskPage() {
  const config = readOperatorConfig();
  return (
    <div>
      <p className="text-sm text-muted">Units are USDT decimals and basis points. Invalid saves keep the previous config.</p>
      <OperatorConfigForm
        action="risk"
        fields={[
          { name: "capital.maxCapitalNotional", label: "Max deployable capital (USDT)", defaultValue: config.capital.maxCapitalNotional },
          { name: "capital.maxPerTradeNotional", label: "Max per trade (USDT)", defaultValue: config.capital.maxPerTradeNotional },
          { name: "capital.reserveCapitalNotional", label: "Reserve capital (USDT)", defaultValue: config.capital.reserveCapitalNotional },
          { name: "risk.maxPositionNotional", label: "Max position (USDT)", defaultValue: config.risk.maxPositionNotional },
          { name: "risk.maxAllocationBps", label: "Max allocation (bps)", defaultValue: String(config.risk.maxAllocationBps) },
          { name: "risk.maxDailyLoss", label: "Max daily loss (USDT)", defaultValue: config.risk.maxDailyLoss },
          { name: "risk.maxSlippageBps", label: "Max slippage (bps)", defaultValue: String(config.risk.maxSlippageBps) },
          { name: "risk.allowedAssets", label: "Allowed assets (comma)", defaultValue: config.risk.allowedAssets.join(",") },
          { name: "risk.paperTradingEnabled", label: "Paper enabled", defaultValue: String(config.risk.paperTradingEnabled) },
          { name: "risk.liveTradingEnabled", label: "Live enabled", defaultValue: String(config.risk.liveTradingEnabled) },
        ]}
      />
    </div>
  );
}
