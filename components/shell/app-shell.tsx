import Link from "next/link";
import type { ReactNode } from "react";
import { ScopeMark } from "@/components/shell/scope-mark";
import { SideNav } from "@/components/shell/side-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-signal focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <aside className="flex flex-col border-b border-line bg-ink/90 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <Link href="/" className="flex items-center gap-3 px-4 py-4 lg:px-5">
          <ScopeMark />
          <span>
            <span className="block text-sm tracking-[0.22em]">KAIROS</span>
            <span className="block text-xs text-muted">Paper command</span>
          </span>
        </Link>
        <SideNav />
        <div className="mt-auto hidden border-t border-line px-5 py-4 lg:block">
          <p className="eyebrow">Mode</p>
          <p className="mt-1 text-sm">Paper</p>
          <p className="mt-4 eyebrow">Chain</p>
          <p className="mt-1 text-sm">Not connected</p>
        </div>
      </aside>
      <div id="content" className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {children}
      </div>
    </div>
  );
}
