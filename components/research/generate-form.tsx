"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateThesisForm({ tickers }: { tickers: readonly string[] }) {
  const router = useRouter();
  const [assetId, setAssetId] = useState(tickers[0] ?? "NVDA");
  const [message, setMessage] = useState("Choose an asset. The server builds the context.");
  const [pending, setPending] = useState(false);

  async function submit(mode: "llm" | "mock") {
    setPending(true);
    setMessage("BUILDING CONTEXT · ANALYZING · VALIDATING");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user_demo", assetId, mode }),
      });
      const body = (await response.json()) as { stage?: string; message?: string; code?: string; sourceType?: string; dataSource?: string };
      const stage = body.stage ?? "FAILED";
      setMessage(`${stage}${body.message ? ` · ${body.message}` : ""}`);
      if (response.ok) {
        router.refresh();
      }
    } catch {
      setMessage("FAILED · The research request did not complete.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="panel" onSubmit={(event) => event.preventDefault()}>
      <p className="eyebrow">Generate thesis</p>
      <p className="mt-2 text-sm text-muted">The browser sends only the user and the asset. KAIROS builds the market context.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Asset
          <select className="mt-1 block rounded-md border border-line bg-ink px-2 py-1" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
            {tickers.map((ticker) => (
              <option key={ticker} value={ticker}>{ticker}</option>
            ))}
          </select>
        </label>
        <button className="rounded-md border border-line px-3 py-2 text-sm" type="button" disabled={pending} onClick={() => submit("llm")}>
          Generate thesis
        </button>
        <button className="rounded-md border border-line px-3 py-2 text-sm text-muted" type="button" disabled={pending} onClick={() => submit("mock")}>
          Open mock lab
        </button>
      </div>
      <p className="mt-3 text-sm">{message}</p>
    </form>
  );
}
