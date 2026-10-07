export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Command Center" },
  { href: "/markets", label: "Markets" },
  { href: "/strategies", label: "Strategies" },
  { href: "/missions", label: "Missions" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/wallet", label: "Wallet" },
  { href: "/paper-lab", label: "Paper Lab" },
  { href: "/risk", label: "Risk" },
  { href: "/agent", label: "Agent" },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
