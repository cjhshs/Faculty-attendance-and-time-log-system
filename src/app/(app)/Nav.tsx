"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
};

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeHref = items
    .filter((item) => matches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-t border-white/10 pt-2 pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors " +
              (active
                ? "bg-white text-navy shadow-sm"
                : "text-slate-200 hover:bg-white/10 hover:text-white")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
