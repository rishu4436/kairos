import { notFound } from "next/navigation";
import { ResearchLab } from "@/components/research/research-lab";
import { PageHeader } from "@/components/ui/page-header";
import { loadResearchLab } from "@/research/lab";

export const dynamic = "force-dynamic";

export default async function ThesisPage({ params }: { params: Promise<{ thesisId: string }> }) {
  const { thesisId } = await params;
  const lab = await loadResearchLab();
  const card = lab.cards.find((item) => item.thesisId === thesisId);
  if (!card) {
    notFound();
  }
  return (
    <>
      <PageHeader
        kicker="Why did KAIROS think of this?"
        title={card.title}
        description="Observed facts, model inferences, and the hypothesis stay labeled. This page does not place an order."
        meta={
          <>
            <span className="pill pill-signal">PAPER EXPERIMENT</span>
            <span className="pill pill-loss">NOT REAL MONEY</span>
          </>
        }
      />
      <ResearchLab lab={lab} detailId={thesisId} />
    </>
  );
}
