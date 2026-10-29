"use client";

import { useState } from "react";

type Props = {
  summary: string;
  children: React.ReactNode;
  variant?: "warn" | "error" | "info";
  className?: string;
};

export function CollapsibleAlert({ summary, children, variant = "warn", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const variantClass =
    variant === "error"
      ? "alert-collapsible-error"
      : variant === "info"
        ? "border-line bg-slate-50 text-ink"
        : "alert-collapsible-warn";

  return (
    <details
      className={`no-print ${className}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className={`alert-collapsible cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden ${variantClass}`}
      >
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          aria-hidden
        >
          <path d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" />
        </svg>
        <span className="flex-1 truncate font-medium">{summary}</span>
      </summary>
      <div
        className={`mt-1 rounded-md border px-3 py-2 text-xs ${
          variant === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : variant === "info"
              ? "border-line bg-slate-50 text-ink"
              : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {children}
      </div>
    </details>
  );
}
