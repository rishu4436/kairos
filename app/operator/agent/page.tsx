import { OperatorControls, OperatorConfigForm } from "@/components/operator/controls";
import { readOperatorConfig } from "@/operator/store";
import { readRuntimeSnapshot } from "@/operator/snapshots";

export const metadata = { title: "Operator agent" };
export const dynamic = "force-dynamic";

export default function OperatorAgentPage() {
  const config = readOperatorConfig();
  const runtime = readRuntimeSnapshot();
  return (
    <div className="space-y-3">
      <OperatorControls />
      <p className="text-sm">Heartbeat {runtime.lastHeartbeat ?? "UNAVAILABLE"} · next {runtime.nextScheduledCycle ?? "—"}</p>
      <OperatorConfigForm
        action="runtime"
        fields={[
          { name: "runtime.executionMode", label: "Execution mode", kind: "select", options: ["PAPER", "LIVE_PREVIEW", "LIVE"], defaultValue: config.runtime.executionMode },
          { name: "runtime.cycleIntervalMs", label: "Cycle interval", kind: "number", unit: "ms", defaultValue: String(config.runtime.cycleIntervalMs) },
          { name: "runtime.enabled", label: "Runtime enabled", kind: "toggle", defaultValue: String(config.runtime.enabled) },
          { name: "confirmLive", label: "Type LIVE to confirm LIVE mode", defaultValue: "" },
        ]}
      />
      <p className="text-xs text-muted">LIVE requires a second confirmation in this form by typing LIVE. Browser cannot mint execution authority.</p>
    </div>
  );
}
