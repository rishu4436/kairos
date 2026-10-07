import Link from "next/link";
import type { CommandCenterModel } from "@/services/command-center";

export function StrategyMatrix({ strategies }: { strategies: CommandCenterModel["strategies"] }) {
  return (
    <section className="panel" aria-labelledby="strategy-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Library</p>
          <h2 id="strategy-title" className="mt-1 text-base font-medium tracking-tight">
            Strategy matrix
          </h2>
        </div>
        <p className="text-xs text-muted">No strategy is selected for execution.</p>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {strategies.map((strategy) => {
          const soon = strategy.status !== "implemented";
          const label = strategy.status === "research_candidate" ? "Research candidate" : strategy.status === "coming_soon" ? "Coming soon" : "Implemented";
          return (
            <li key={strategy.id} className={soon ? "strategy-tile strategy-soon" : "strategy-tile"}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">
                  <Link href={`/strategies/${strategy.id}`} className="hover:text-signal">
                    {strategy.name}
                  </Link>
                </h3>
                <span className={soon ? "pill" : "pill pill-gain"}>{label}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{strategy.description}</p>
              <p className="mt-3 text-[0.68rem] tracking-[0.12em] text-faint uppercase">{strategy.riskLevel} risk</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
