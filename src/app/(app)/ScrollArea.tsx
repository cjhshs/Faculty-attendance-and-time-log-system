"use client";

import { useEffect, useRef } from "react";

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest("input, textarea, select, button, a, label, [contenteditable]")
  );
}

export function ScrollArea({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.shiftKey) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el!.scrollLeft += delta;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      onPointerDown={onPointerDown}
      className={"cursor-grab overflow-x-auto " + className}
    >
      {children}
    </div>
  );
}
