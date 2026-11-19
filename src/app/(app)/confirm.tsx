"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  /** Short heading, e.g. "Delete course". */
  title: string;
  /** The consequence, in one or two sentences. */
  message: ReactNode;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** `danger` styles the confirm button red. Defaults to `primary`. */
  tone?: "danger" | "primary";
};

export type AlertOptions = {
  title: string;
  message: ReactNode;
  /** Label for the dismiss button. Defaults to "OK". */
  okLabel?: string;
  /** `danger` tints the heading area red. Defaults to `info`. */
  tone?: "danger" | "info";
};

/**
 * Promise-based confirmation + alert built on the shared native <dialog> Modal.
 *
 *   const { confirm, alert, dialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ title, message, tone: "danger" }))) return;
 *   ...
 *   await alert({ title: "Could not save", message: err.message, tone: "danger" });
 *   ...
 *   return <>{dialog}...</>;
 *
 * This replaces window.confirm/window.alert with themed, focus-managed dialogs.
 * The safe action (Cancel/OK) is focused first and Esc/light-dismiss dismisses.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [notice, setNotice] = useState<AlertOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const alert = useCallback((opts: AlertOptions) => {
    setNotice(opts);
    return new Promise<void>((resolve) => {
      resolver.current = () => resolve();
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setOptions(null);
    setNotice(null);
    resolve?.(ok);
  }, []);

  const danger = options?.tone !== "primary";

  const dialog = options ? (
    <Modal open onClose={() => settle(false)} label={options.title} className="max-w-md">
      <h2 className="section-title">{options.title}</h2>
      <div className="mt-2 text-sm text-ink">{options.message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => settle(false)} autoFocus>
          {options.cancelLabel ?? "Cancel"}
        </button>
        <button
          type="button"
          className={danger ? "btn btn-danger" : "btn btn-primary"}
          onClick={() => settle(true)}
        >
          {options.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </Modal>
  ) : notice ? (
    <Modal open onClose={() => settle(true)} label={notice.title} className="max-w-md">
      <h2 className={"section-title " + (notice.tone === "danger" ? "text-red-700" : "")}>
        {notice.title}
      </h2>
      <div className="mt-2 text-sm text-ink">{notice.message}</div>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={() => settle(true)} autoFocus>
          {notice.okLabel ?? "OK"}
        </button>
      </div>
    </Modal>
  ) : null;

  return { confirm, alert, dialog };
}
