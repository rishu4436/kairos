import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { newOperatorToken, operatorCookieHeader, operatorMutationsAllowed } from "@/operator/guard";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/operator", label: "Overview" },
  { href: "/operator/agent", label: "Agent" },
  { href: "/operator/brain", label: "Brain" },
  { href: "/operator/strategies", label: "Strategies" },
  { href: "/operator/risk", label: "Risk" },
  { href: "/operator/wallet", label: "Wallet" },
  { href: "/operator/research", label: "Research" },
  { href: "/operator/activity", label: "Activity" },
];

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  let token = jar.get("kairos_operator")?.value;
  if (!token) {
    token = newOperatorToken();
  }
  return (
    <div className="space-y-4" data-operator-token={token}>
      <section className="panel">
        <p className="eyebrow">LOCAL OPERATOR MODE</p>
        <h1 className="mt-1 text-xl">Self-hosted instance</h1>
        <p className="mt-2 text-sm text-muted">
          Owner control plane. Public dashboard stays read-only. Mutations require KAIROS_OPERATOR_ENABLED=true.
        </p>
        <p className="mt-2 text-xs text-muted">{operatorMutationsAllowed() ? "Operator mutations enabled" : "Operator mutations disabled"}</p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Operator">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </section>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.cookie=${JSON.stringify(operatorCookieHeader(token).split(";")[0] + "; Path=/; SameSite=Strict")}`,
        }}
      />
      {children}
    </div>
  );
}
