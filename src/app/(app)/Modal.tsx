"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A thin wrapper around the native <dialog> element. The browser provides the
// modal semantics (inert background, focus containment, Esc, top layer and
// focus return to the invoker), so we must NOT add role="dialog", aria-modal,
// a focus trap or an Esc handler here.
export function Modal({
  open,
  onClose,
  labelledBy,
  label,
  children,
  className = "",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the visible heading inside the dialog. */
  labelledBy?: string;
  /** Accessible name when there is no visible heading. */
  label?: string;
  children: ReactNode;
  className?: string;
  /** When false, Esc and light dismiss are blocked (for example while saving). */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={"modal " + className}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (!dismissible) return;
        // Light dismiss: only when the pointer is actually outside the panel,
        // not on the dialog's own padding.
        const dialog = ref.current;
        if (!dialog || e.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        const outside =
          e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
