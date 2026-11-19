"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

export type NavItem = {
  href: string;
  label: string;
};

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav({ items, className = "" }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLUListElement>(null);
  const activeHref = items
    .filter((item) => matches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // A native popover does not close itself when a link inside is activated, so
  // dismiss it after choosing a destination.
  const closeMenu = () => {
    const menu = menuRef.current;
    if (menu?.matches(":popover-open")) menu.hidePopover();
  };

  // The current page is marked with aria-current and styled via that attribute,
  // never by colour alone (WCAG 1.4.1).
  const linkClass = (active: boolean) =>
    "block rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:px-2.5 lg:py-1.5 " +
    (active
      ? "bg-white text-navy shadow-sm"
      : "text-slate-200 hover:bg-white/10 hover:text-white");

  return (
    <nav aria-label="Primary" className={"min-w-0 " + className}>
      {/* Below lg there are too many items to lay out in one row, so they
          collapse into a labelled popover menu instead of a tall wrapped stack. */}
      <div className="lg:hidden">
        <button
          type="button"
          className="nav-menu-button btn border-white/25 bg-white/10 text-white hover:bg-white/20"
          popoverTarget="app-nav-menu"
          popoverTargetAction="toggle"
          aria-controls="app-nav-menu"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M3 5.75A.75.75 0 013.75 5h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 5.75zm0 4.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10zm.75 3.5a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H3.75z" />
          </svg>
          Menu
        </button>
        <ul
          id="app-nav-menu"
          ref={menuRef}
          popover="auto"
          className="nav-menu w-72 rounded-xl border border-line bg-white p-2 text-ink shadow-xl"
        >
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeMenu}
                  aria-current={active ? "page" : undefined}
                  className={linkClass(active)}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* lg+: the inline navigation, on its own full-width row. */}
      <ul className="hidden w-full flex-wrap items-center gap-1 lg:flex">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={linkClass(active)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
