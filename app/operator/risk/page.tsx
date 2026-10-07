import { OperatorConfigForm } from "@/components/operator/controls";
import { defaultOperatorConfig } from "@/operator/config";
import { readOperatorConfig } from "@/operator/store";

export const metadata = { title: "Operator risk" };
export const dynamic = "force-dynamic";

export default function OperatorRiskPage() {
  const config = readOperatorConfig();
  const defaults = defaultOperatorConfig();
  return (
    <div>
      <p className="text-sm text-muted">Units are USDT decimals and basis points. Invalid saves keep the previous config.</p>
      <OperatorConfigForm
        resetPatch={{ capital: defaults.capital, risk: defaults.risk }}
        fields={[
          { name: "capital.maxCapitalNotional", label: "Max deployable capital", unit: "USDT", defaultValue: config.capital.maxCapitalNotional },
          { name: "capital.maxPerTradeNotional", label: "Max per trade", unit: "USDT", defaultValue: config.capital.maxPerTradeNotional },
          { name: "capital.reserveCapitalNotional", label: "Reserve capital", unit: "USDT", defaultValue: config.capital.reserveCapitalNotional },
          { name: "risk.maxPositionNotional", label: "Max position", unit: "USDT", defaultValue: config.risk.maxPositionNotional },
          { name: "risk.maxAllocationBps", label: "Max allocation", kind: "number", unit: "bps", hint: "2500 = 25%", defaultValue: String(config.risk.maxAllocationBps) },
          { name: "risk.maxDailyLoss", label: "Max daily loss", unit: "USDT", defaultValue: config.risk.maxDailyLoss },
          { name: "risk.maxSlippageBps", label: "Max slippage", kind: "number", unit: "bps", hint: "50 = 0.50%", defaultValue: String(config.risk.maxSlippageBps) },
          { name: "risk.allowedAssets", label: "Allowed assets", hint: "Comma-separated tickers", defaultValue: config.risk.allowedAssets.join(",") },
          { name: "risk.paperTradingEnabled", label: "Paper", kind: "toggle", defaultValue: String(config.risk.paperTradingEnabled) },
          { name: "risk.liveTradingEnabled", label: "Live admission", kind: "toggle", defaultValue: String(config.risk.liveTradingEnabled) },
        ]}
      />
    </div>
  );
}
