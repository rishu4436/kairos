"use client";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="panel max-w-xl" role="alert">
      <p className="eyebrow">Error</p>
      <h1 className="page-title">The command center could not render</h1>
      <p className="mt-3 text-sm text-muted">{error.message || "An unexpected error stopped this view."}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 rounded-full bg-signal px-4 py-2 text-sm text-ink"
      >
        Try again
      </button>
    </div>
  );
}
