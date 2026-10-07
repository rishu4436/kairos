"use client";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#07080b", color: "#f3efe4", fontFamily: "sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
          <p style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12 }}>KAIROS</p>
          <h1 style={{ fontSize: 32, fontWeight: 500 }}>The application failed to start</h1>
          <p style={{ color: "#c9c2b4" }}>The root layout could not render. No trading action was taken.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, background: "#e4b15a", color: "#1a1408", border: 0, borderRadius: 999, padding: "8px 16px" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
