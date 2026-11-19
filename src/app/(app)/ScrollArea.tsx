"use client";

import { useRef } from "react";

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest("input, textarea, select, button, a, label, [contenteditable]")
  );
}

// A horizontally scrollable region that also supports click-and-drag with a
// pointer. Native overflow scrolling is the primary mechanism (it keeps
// trackpad/touch physics and Shift+wheel); drag is an optional extra. Exposed
// as a labelled, keyboard-scrollable region so it can be reached and scrolled
// without a mouse.
export function ScrollArea({
  children,
  className = "",
  label = "Scrollable content",
}: {
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the scroll region. */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || isInteractive(e.target)) return;
    const el = ref.current;
    if (!el) return;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    let dragging = false;
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 3) dragging = true;
      if (dragging) {
        el!.scrollLeft = startLeft - dx;
        ev.preventDefault();
      }
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = previousSelect;
      el!.classList.remove("grabbing");
    }
    el.classList.add("grabbing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      className={"scroll-region cursor-grab overflow-x-auto " + className}
    >
      {children}
    </div>
  );
}
