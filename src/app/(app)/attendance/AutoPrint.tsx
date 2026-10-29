"use client";

import { useEffect, useRef } from "react";

// Prints once after a specific page preview has rendered. Used by the "Print
// selected page" action; a normal Print All click still uses the fixed button.
export function AutoPrint({ enabled }: { enabled: boolean }) {
  const printed = useRef(false);
  useEffect(() => {
    if (!enabled || printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [enabled]);
  return null;
}
