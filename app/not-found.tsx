import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel max-w-xl">
      <p className="eyebrow">404</p>
      <h1 className="page-title">This route is not part of KAIROS</h1>
      <p className="mt-3 text-sm text-muted">The address does not match a command, market, strategy, or account screen.</p>
      <Link href="/" className="mt-5 inline-block text-sm text-signal">
        Return to the command center
      </Link>
    </div>
  );
}
