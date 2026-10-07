"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, NAV_GROUPS } from "@/lib/navigation";

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="contents lg:block">
          <p className="hidden px-3 pt-3 text-[0.65rem] tracking-[0.16em] text-faint uppercase lg:block">{group.label}</p>
          {group.items.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "nav-link nav-link-active" : "nav-link"}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
