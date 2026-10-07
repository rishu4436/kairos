import { KairosContextPanel } from "@/components/context/kairos-context";
import { GenerateThesisForm } from "@/components/research/generate-form";
import { EvidenceProvenance } from "@/components/research/evidence-provenance";
import { ResearchLab } from "@/components/research/research-lab";
import { PageHeader } from "@/components/ui/page-header";
import { DEMO_WATCH_TICKERS } from "@/domain/watchlist";
import { loadDemoObservationBoard } from "@/observation/load-board";
import { loadResearchLab } from "@/research/lab";

export const metadata = { title: "Paper Lab" };
export const dynamic = "force-dynamic";

export default async function PaperLabPage() {
  const lab = await loadResearchLab();
  const board = await loadDemoObservationBoard();
  return (
    <>
      <PageHeader
        kicker="Research brain"
        title="KAIROS Research Lab"
        description="The research brain writes a falsifiable thesis and a declarative proposal. Deterministic code validates it and runs a paper experiment. The research brain cannot directly execute trades."
        meta={
          <>
            <span className="pill pill-signal">PAPER EXPERIMENT</span>
            <span className="pill pill-loss">NOT REAL MONEY</span>
          </>
        }
      />
      <KairosContextPanel
        rows={board.rows}
        note="The research lab reads this KAIROS context. It does not build a separate interpretation of the market."
      />
      <div className="mt-3">
        <GenerateThesisForm tickers={DEMO_WATCH_TICKERS} />
      </div>
      <div className="mt-3">
        <EvidenceProvenance rows={board.rows} />
      </div>
      <div className="mt-3">
        <ResearchLab lab={lab} />
      </div>
    </>
  );
}
