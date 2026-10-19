"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
};

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors " +
              (active ? "bg-blue-900 text-white" : "text-zinc-600 hover:bg-zinc-200")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
