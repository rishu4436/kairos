"use client";

import { useState } from "react";
import { OPERATOR_COOKIE } from "@/operator/guard";
import type { ButtonAvailability } from "@/operator/mandate";

async function post(body: Record<string, unknown>) {
  const host = document.querySelector("[data-operator-token]") as HTMLElement | null;
  const token = host?.dataset.operatorToken ?? "";
  document.cookie = `${OPERATOR_COOKIE}=${token}; Path=/; SameSite=Strict`;
  const response = await fetch("/api/operator", {
    method: "POST",
    headers: { "content-type": "application/json", "x-kairos-operator": token },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<{ ok: boolean; reason?: string }>;
}

export function RunFlow({ buttons }: { buttons: ButtonAvailability }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function act(action: string) {
    const result = await post({ action });
    setMessage(result.ok ? `${action} accepted` : result.reason ?? "rejected");
  }

  return (
    <section className="panel">
      <p className="eyebrow">Agent</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!buttons.run} className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-40" onClick={() => setOpen(true)}>
          RUN
        </button>
        <button type="button" disabled={!buttons.stop} className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-40" onClick={() => void act("STOP")}>
          STOP
        </button>
        <button type="button" disabled={!buttons.oneCycle} className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-40" onClick={() => void act("ONE_CYCLE")}>
          RUN ONE CYCLE
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      {open ? (
        <div className="mt-4 border-t border-line pt-4">
          <h2 className="text-base font-medium">How should KAIROS operate?</h2>
          <p className="mt-1 text-sm text-muted">AUTO chooses inside your risk mandate. MANUAL uses the assets and settings you pick. Neither one is a paper trading mode.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["LOW", "MEDIUM", "HIGH"] as const).map((profile) => (
              <button key={profile} type="button" className="pill" onClick={() => void post({ action: "SET_MANDATE", mode: "AUTO", profile }).then((result) => setMessage(result.ok ? `AUTO ${profile} saved` : result.reason ?? "rejected"))}>
                AUTO {profile}
              </button>
            ))}
            <button type="button" className="pill" onClick={() => void post({ action: "SET_MANDATE", mode: "MANUAL" }).then((result) => setMessage(result.ok ? "MANUAL saved" : result.reason ?? "rejected"))}>
              MANUAL
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
