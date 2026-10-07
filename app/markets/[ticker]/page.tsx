import { AssetTerminal } from "@/components/markets/asset-terminal";
import { PageHeader } from "@/components/ui/page-header";
import { readDataMode } from "@/lib/mode";
import { loadDemoObservationBoard } from "@/observation/load-board";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default async function MarketAssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const mode = readDataMode();
  const board = await loadDemoObservationBoard();
  return (
    <>
      <PageHeader
        kicker="Asset"
        title={symbol}
        description={
          mode === "live"
            ? "Live observation, candle history, features, and strategy signals. No order is sent."
            : "Paper observation and a deterministic sample candle path. No order is sent."
        }
      />
      <AssetTerminal ticker={symbol} initialBoard={board} />
    </>
  );
}
