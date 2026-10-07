"use client";

import { useState, type FormEvent } from "react";
import { OPERATOR_COOKIE } from "@/operator/guard";
import { POSTURE_COPY, type RiskPosture } from "@/operator/posture";

function csrf(): string {
  const host = document.querySelector("[data-operator-token]") as HTMLElement | null;
  return host?.dataset.operatorToken ?? "";
}

async function post(body: Record<string, unknown>) {
  const token = csrf();
  document.cookie = `${OPERATOR_COOKIE}=${token}; Path=/; SameSite=Strict`;
  const response = await fetch("/api/operator", {
    method: "POST",
    headers: { "content-type": "application/json", "x-kairos-operator": token },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<{ ok: boolean; reason?: string }>;
}

export function StrategyControl({
  posture,
  manual,
  choices,
}: {
  posture: RiskPosture | "MANUAL";
  choices: { strategies: string[]; assets: string[]; supportedAssets: string[] };
  manual: {
    momentumReturn: string;
    momentumVol: string;
    momentumSize: string;
    meanEntry: string;
    meanSize: string;
    weekendBand: string;
    dcaOn: boolean;
    dcaDip: string;
    dcaSize: string;
    dcaBudget: string;
  };
}) {
  const [mode, setMode] = useState<"AUTO" | "MANUAL">(posture === "MANUAL" ? "MANUAL" : "AUTO");
  const [message, setMessage] = useState("");

  async function choose(id: RiskPosture) {
    const result = await post({ action: "POSTURE", posture: id });
    setMessage(result.ok ? `${id} saved. The next cycle uses it.` : result.reason ?? "rejected");
    if (result.ok) {
      window.location.reload();
    }
  }

  async function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dip = Number(data.get("dcaDip"));
    const selectedStrategies = data.getAll("strategy").map(String);
    const selectedAssets = data.getAll("asset").map(String);
    const result = await post({
      action: "CONFIG_PATCH",
      patch: {
        strategies: {
          momentum: {
            minReturnBps: Math.round(Number(data.get("momentumReturn")) * 100),
            maxVolatilityBps: Math.round(Number(data.get("momentumVol")) * 100),
            maxTradeNotional: String(data.get("momentumSize") ?? ""),
          },
          "mean-reversion": {
            entryBps: Math.round(Number(data.get("meanEntry")) * 100),
            maxTradeNotional: String(data.get("meanSize") ?? ""),
          },
          weekend: { minDeviationBps: Math.round(Number(data.get("weekendBand")) * 100) },
          dca: {
            enabled: data.get("dcaOn") === "on",
            mode: "DIP_BASED",
            dipThresholdBps: Math.round(dip * 100),
          },
        },
        capital: {
          dcaOrderBpsOfDeployable: Math.round(Number(data.get("dcaSize")) * 100),
          dcaMaxBudgetBpsOfDeployable: Math.round(Number(data.get("dcaBudget")) * 100),
        },
        mandate: {
          operatorMode: "MANUAL",
          autoProfile: null,
          autoProfileVersion: null,
          selectedManualStrategies: selectedStrategies,
          selectedManualAssets: selectedAssets,
        },
      },
    });
    setMessage(result.ok ? "Manual settings saved." : result.reason ?? "rejected");
    if (result.ok) {
      window.location.reload();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" className={mode === "AUTO" ? "pill pill-signal" : "pill"} onClick={() => setMode("AUTO")}>
          Auto
        </button>
        <button type="button" className={mode === "MANUAL" ? "pill pill-signal" : "pill"} onClick={() => setMode("MANUAL")}>
          Manual
        </button>
        <span className="pill">{posture === "MANUAL" ? "Custom" : posture}</span>
      </div>
      {mode === "AUTO" ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {POSTURE_COPY.map((item) => (
            <article key={item.id} className={posture === item.id ? "panel panel-risk" : "panel"}>
              <h2 className="text-base font-medium">{item.title}</h2>
              <p className="mt-1 text-sm text-muted">{item.summary}</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>Momentum. {item.momentum}</li>
                <li>Mean reversion. {item.meanReversion}</li>
                <li>Weekend. {item.weekend}</li>
                <li>DCA. {item.dca}</li>
              </ul>
              <button type="button" className="mt-4 rounded-md border border-line px-3 py-2 text-sm" onClick={() => void choose(item.id)}>
                Use {item.title}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <form className="panel space-y-4" onSubmit={(event) => void saveManual(event)}>
          <fieldset>
            <legend className="text-sm font-medium">Strategies</legend>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {["momentum", "mean-reversion", "weekend", "dca"].map((id) => (
                <label key={id} className="flex items-center gap-2">
                  <input type="checkbox" name="strategy" value={id} defaultChecked={choices.strategies.includes(id)} />
                  {id}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Assets</legend>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {choices.supportedAssets.map((ticker) => (
                <label key={ticker} className="flex items-center gap-2">
                  <input type="checkbox" name="asset" value={ticker} defaultChecked={choices.assets.includes(ticker)} />
                  {ticker}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Momentum</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field name="momentumReturn" label="Minimum move" unit="%" defaultValue={manual.momentumReturn} />
              <Field name="momentumVol" label="Maximum volatility" unit="%" defaultValue={manual.momentumVol} />
              <Field name="momentumSize" label="Max trade" unit="USDT" defaultValue={manual.momentumSize} />
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Mean reversion</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field name="meanEntry" label="Distance from average" unit="%" defaultValue={manual.meanEntry} />
              <Field name="meanSize" label="Max trade" unit="USDT" defaultValue={manual.meanSize} />
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Weekend / off-hours</legend>
            <p className="mt-1 text-xs text-muted">Observation only. It never sends a buy or sell.</p>
            <div className="mt-2">
              <Field name="weekendBand" label="Gap to note" unit="%" defaultValue={manual.weekendBand} />
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">DCA</legend>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input name="dcaOn" type="checkbox" defaultChecked={manual.dcaOn} />
              Enable dip buying
            </label>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field name="dcaDip" label="Buy after each dip" unit="%" defaultValue={manual.dcaDip} />
              <Field name="dcaSize" label="Each buy" unit="% of deployable" defaultValue={manual.dcaSize} />
              <Field name="dcaBudget" label="DCA budget" unit="% of deployable" defaultValue={manual.dcaBudget} />
            </div>
          </fieldset>
          <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
            Save manual settings
          </button>
        </form>
      )}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}

function Field({ name, label, unit, defaultValue }: { name: string; label: string; unit: string; defaultValue: string }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input name={name} defaultValue={defaultValue} className="w-full border border-line bg-transparent px-2 py-1" />
        <span className="text-xs text-muted">{unit}</span>
      </span>
    </label>
  );
}
