"use client";

import { useEffect, useRef } from "react";

// Prints once after the preview has fully rendered. Used by the "Print selected
// page" action; a normal Print All click still uses the fixed button.
//
// A fixed delay is fragile: fonts and logos may still be loading when the print
// dialog opens, producing a preview that differs from the screen. Instead we
// wait for fonts, two animation frames, and any pending images (with a ceiling
// so a broken image can never block printing).
export function AutoPrint({ enabled }: { enabled: boolean }) {
  const printed = useRef(false);

  useEffect(() => {
    if (!enabled || printed.current) return;
    printed.current = true;
    let cancelled = false;

    const waitForImages = () => {
      const pending = Array.from(document.images).filter((img) => !img.complete);
      if (pending.length === 0) return Promise.resolve();
      return Promise.race([
        Promise.all(
          pending.map(
            (img) =>
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
        ),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    };

    const run = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // Font loading API unavailable; continue.
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await waitForImages();
      if (!cancelled) window.print();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
