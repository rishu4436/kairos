export function PhaseBanner({ detail }: { detail: string }) {
  return (
    <p className="phase-banner" role="status">
      <span className="font-medium text-paper">Coming in next build phase.</span> {detail}
    </p>
  );
}
