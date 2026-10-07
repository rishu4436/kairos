"use client";

import { useState } from "react";
import { OPERATOR_COOKIE } from "@/operator/guard";

function token(): string {
  const host = document.querySelector("[data-operator-token]") as HTMLElement | null;
  return host?.dataset.operatorToken ?? "";
}

function writeCsrfCookie(value: string): void {
  document.cookie = `${OPERATOR_COOKIE}=${value}; Path=/; SameSite=Strict`;
}

async function post(action: string, patch?: Record<string, unknown>) {
  const csrf = token();
  writeCsrfCookie(csrf);
  const response = await fetch("/api/operator", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kairos-operator": csrf,
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

export interface OperatorField {
  name: string;
  label: string;
  hint?: string;
  kind?: "text" | "number" | "toggle" | "select";
  defaultValue: string;
  options?: readonly string[];
  unit?: string;
}

export function OperatorConfigForm({
  fields,
  resetPatch,
}: {
  action?: string;
  fields: readonly OperatorField[];
  resetPatch?: Record<string, unknown>;
}) {
  const [message, setMessage] = useState("");
  function save(patch: Record<string, unknown>) {
    void post("CONFIG_PATCH", patch).then((result) => setMessage(result.ok ? "Saved" : result.reason ?? "rejected"));
  }
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const patch: Record<string, unknown> = {};
        for (const field of fields) {
          const raw = String(data.get(field.name) ?? "");
          setPath(patch, field.name, coerce(raw, field.kind));
        }
        save(patch);
      }}
    >
      {fields.map((field) => (
        <label key={field.name} className="block text-sm">
          <span className="text-muted">{field.label}</span>
          {field.hint ? <span className="mt-1 block text-xs text-faint">{field.hint}</span> : null}
          {field.kind === "toggle" ? (
            <select name={field.name} defaultValue={field.defaultValue} className="mt-1 w-full border border-line bg-transparent px-2 py-1">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : field.kind === "select" ? (
            <select name={field.name} defaultValue={field.defaultValue} className="mt-1 w-full border border-line bg-transparent px-2 py-1">
              {(field.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <span className="mt-1 flex items-center gap-2">
              <input
                name={field.name}
                type={field.kind === "number" ? "number" : "text"}
                step={field.kind === "number" ? "1" : undefined}
                defaultValue={field.defaultValue}
                className="w-full border border-line bg-transparent px-2 py-1"
              />
              {field.unit ? <span className="text-xs text-muted">{field.unit}</span> : null}
            </span>
          )}
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
          SAVE
        </button>
        {resetPatch ? (
          <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => save(resetPatch)}>
            RESET TO KAIROS DEFAULT
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}

function coerce(raw: string, kind?: OperatorField["kind"]): string | number | boolean {
  if (kind === "toggle") return raw === "true";
  if (kind === "number" && /^-?\d+$/.test(raw)) return Number(raw);
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
