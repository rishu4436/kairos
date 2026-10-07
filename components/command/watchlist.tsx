import { EmptyState } from "@/components/ui/empty-state";
import type { WatchStatus } from "@/domain/models";
import { cn } from "@/lib/cn";
import type { CommandCenterModel } from "@/services/command-center";

const LABEL: Record<WatchStatus, string> = {
  WATCHING: "Watching",
  OPPORTUNITY: "Opportunity",
  NO_ACTION: "No action",
  RISK_BLOCKED: "Risk blocked",
  PAPER_TEST: "Paper test",
};

const TONE: Record<WatchStatus, string> = {
  WATCHING: "pill",
  OPPORTUNITY: "pill pill-signal",
  NO_ACTION: "pill",
  RISK_BLOCKED: "pill pill-loss",
  PAPER_TEST: "pill pill-aqua",
};

export function Watchlist({ rows }: { rows: CommandCenterModel["watchlist"] }) {
  return (
    <section className="panel h-full" aria-labelledby="watchlist-title">
      <p className="eyebrow">Mock marks</p>
      <h2 id="watchlist-title" className="mt-1 text-base font-medium tracking-tight">
        Active watchlist
      </h2>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No names on the watchlist" body="The sample watchlist is empty." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <caption className="sr-only">Sample watchlist of tokenized equities</caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Token</th>
                <th scope="col">Price</th>
                <th scope="col">24h</th>
                <th scope="col">Agent</th>
                <th scope="col">Signal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticker}>
                  <th scope="row" className="pr-3 text-left font-medium">
                    {row.ticker}
                    <span className="mt-0.5 block text-xs font-normal text-muted">{row.name}</span>
                  </th>
                  <td className="num text-muted">{row.tokenizedSymbol}</td>
                  <td className="num">{row.price}</td>
                  <td
                    className={cn(
                      "num",
                      row.direction === "up" && "text-gain",
                      row.direction === "down" && "text-loss",
                    )}
                  >
                    {row.change}
                  </td>
                  <td>
                    <span className={TONE[row.status]}>{LABEL[row.status]}</span>
                  </td>
                  <td className="text-muted">{row.signal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Token symbols are placeholders. Official BNB identifiers are not connected.
      </p>
    </section>
  );
}
