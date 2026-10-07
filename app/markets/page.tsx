import Link from "next/link";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { PageHeader } from "@/components/ui/page-header";
import { DEMO_WATCH_TICKERS } from "@/domain/watchlist";

export const metadata = { title: "Markets" };

export default function MarketsPage() {
  return (
    <>
      <PageHeader
        kicker="Market data"
        title="Markets"
        description="The command center polls the observation board. This page does not start a second request."
      />
      <PhaseBanner detail="Each ticker opens the asset terminal. History is collected only for the demo watchlist. This index does not scan the market." />
      <ul className="grid gap-2 sm:grid-cols-3">
        {DEMO_WATCH_TICKERS.map((ticker) => (
          <li key={ticker}>
            <Link href={`/markets/${ticker}`} className="panel block hover:border-signal">
              <p className="text-lg tracking-tight">{ticker}</p>
              <p className="mt-1 text-xs text-muted">Asset terminal</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
