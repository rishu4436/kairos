"use client";

import { useState } from "react";

function token(): string {
  const host = document.querySelector("[data-operator-token]") as HTMLElement | null;
  return host?.dataset.operatorToken ?? "";
}

async function post(action: string, patch?: Record<string, unknown>) {
  const response = await fetch("/api/operator", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kairos-operator": token(),
    },
    body: JSON.stringify({ action, patch }),
  });
  return response.json() as Promise<{ ok: boolean; reason?: string }>;
}

export function OperatorControls() {
  const [message, setMessage] = useState("");
  async function run(action: string) {
    const result = await post(action);
    setMessage(result.ok ? `${action} accepted` : result.reason ?? "rejected");
  }
  return (
    <div className="panel">
      <p className="eyebrow">Runtime controls</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void run("RUN")}>
          RUN
        </button>
        <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void run("PAUSE")}>
          PAUSE
        </button>
        <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void run("STOP")}>
          STOP
        </button>
        <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void run("ONE_CYCLE")}>
          RUN ONE CYCLE
        </button>
        <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => void run("EXECUTION_DISABLE")}>
          EMERGENCY DISABLE
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </div>
  );
}

export function OperatorConfigForm({ fields }: { action?: string; fields: { name: string; label: string; defaultValue: string }[] }) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="panel mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const patch: Record<string, unknown> = {};
        for (const field of fields) {
          const raw = String(data.get(field.name) ?? "");
          setPath(patch, field.name, coerce(raw));
        }
        void post("CONFIG_PATCH", patch).then((result) => setMessage(result.ok ? "Saved" : result.reason ?? "rejected"));
      }}
    >
      {fields.map((field) => (
        <label key={field.name} className="block text-sm">
          <span className="text-muted">{field.label}</span>
          <input name={field.name} defaultValue={field.defaultValue} className="mt-1 w-full border border-line bg-transparent px-2 py-1" />
        </label>
      ))}
      <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
        SAVE
      </button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}

function coerce(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]!;
    const next = cursor[key];
    if (typeof next !== "object" || next === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
}
