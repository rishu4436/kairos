import Link from "next/link";
import { PhaseBanner } from "@/components/ui/phase-banner";
import { PageHeader } from "@/components/ui/page-header";
import { StrategyComparison } from "@/components/strategies/strategy-memory";
import { getStrategyPageModel } from "@/services/command-center";

export const metadata = { title: "Strategies" };

export const dynamic = "force-dynamic";

export default function StrategiesPage() {
  const rows = getStrategyPageModel();

  return (
    <>
      <PageHeader
        kicker="Library"
        title="Strategies"
        description="Built-in strategies stay in the catalog. Research candidates stay on a separate lifecycle and cannot become live on their own."
      />
      <PhaseBanner detail="Editing a built-in strategy creates a new version. It does not overwrite the current one." />
      <StrategyComparison />
      <div className="overflow-x-auto">
        <table className="data-table min-w-[760px]">
          <caption className="sr-only">Strategy catalog. Coming soon rows cannot be evaluated.</caption>
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Status</th>
              <th scope="col">Risk</th>
              <th scope="col">Data</th>
              <th scope="col">Assets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="text-left font-medium">
                  <Link href={`/strategies/${row.id}`} className="hover:text-signal">
                    {row.name}
                  </Link>
                  <span className="mt-1 block max-w-md text-xs font-normal text-muted">{row.description}</span>
                </th>
                <td>
                  <span className={row.status === "implemented" ? "pill pill-gain" : "pill"}>
                    {row.status === "implemented" ? "Implemented" : "Coming soon"}
                  </span>
                </td>
                <td className="capitalize">{row.riskLevel}</td>
                <td className="text-muted">{row.requiredData}</td>
                <td className="num text-muted">{row.supportedAssets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
