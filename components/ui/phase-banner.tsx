export function PhaseBanner({ detail }: { detail: string }) {
  return (
    <p className="phase-banner" role="status">
      <span className="font-medium text-paper">Not available.</span> {detail}
    </p>
  );
}
