export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Desk",
    items: [
      { href: "/", label: "Desk" },
      { href: "/operator/strategies", label: "Strategy control" },
      { href: "/wallet", label: "Wallet" },
      { href: "/operator", label: "Start agent" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/operator/brain", label: "Decision detail" },
      { href: "/markets", label: "Markets" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/paper-lab", label: "Thesis lab" },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => [...group.items]);

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/operator") {
    return pathname === "/operator";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
