import { notFound } from "next/navigation";
import { StrategyHealthPanel } from "@/components/strategies/strategy-memory";
import { StrategyTerminal } from "@/components/strategies/strategy-terminal";
import { PageHeader } from "@/components/ui/page-header";
import { loadDemoObservationBoard } from "@/observation/load-board";
import { getStrategyMetadata } from "@/strategies/catalog";
import { MEAN_REVERSION_PARAMS, MOMENTUM_PARAMS, WEEKEND_PARAMS } from "@/strategies/parameters";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ strategyId: string }> }) {
  const { strategyId } = await params;
  return { title: getStrategyMetadata(strategyId)?.name ?? "Strategy" };
}

export default async function StrategyDetailPage({ params }: { params: Promise<{ strategyId: string }> }) {
  const { strategyId } = await params;
  const strategy = getStrategyMetadata(strategyId);
  if (!strategy) {
    notFound();
  }
  const board = strategy.status === "implemented" ? await loadDemoObservationBoard() : null;
  return (
    <>
      <PageHeader
        kicker="Strategy"
        title={strategy.name}
        description="Deterministic evaluation over the current watchlist. External evidence is context for the arbitrator. This page does not place an order."
      />
      {strategy.status === "implemented" ? (
        <div className="mb-3">
          <StrategyHealthPanel strategyId={strategy.id} />
        </div>
      ) : null}
      <StrategyTerminal strategy={strategy} parameters={parametersFor(strategy.id)} initialBoard={board} />
    </>
  );
}

function parametersFor(id: string): { name: string; value: string }[] {
  const source = id === "momentum" ? MOMENTUM_PARAMS : id === "mean-reversion" ? MEAN_REVERSION_PARAMS : id === "weekend" ? WEEKEND_PARAMS : null;
  if (!source) {
    return [];
  }
  return Object.entries(source).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? value.join(", ") : String(value),
  }));
}
