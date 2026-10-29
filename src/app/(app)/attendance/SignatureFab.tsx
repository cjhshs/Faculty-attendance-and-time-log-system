"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SignatureValues } from "@/lib/print-signature";

// Floating signature editor. The button/modal are UI-only and are excluded from
// print output; the values are persisted per attendance scope.
export function SignatureFab({
  scopeKey,
  initial,
}: {
  scopeKey: string;
  initial: SignatureValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<SignatureValues>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function update(patch: Partial<SignatureValues>) {
    setValues((prev) => ({ ...prev, ...patch }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/print-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeKey, ...values }),
      });
      if (res.status === 401 || res.status === 403) {
        setMessage({
          ok: false,
          text: "Your session has expired or you no longer have permission. Sign in again; these signatory values are still in this form and have not been saved.",
        });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save signatories.");
      setValues(data.signature as SignatureValues);
      setMessage({ ok: true, text: "Saved for this sheet." });
      router.refresh();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Could not save signatories.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="no-print print:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-navy/90 text-white shadow-lg shadow-navy/30 backdrop-blur-sm transition hover:bg-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:bottom-24 sm:right-6"
        title="Edit Prepared by / Checked by"
        aria-label="Edit Prepared by and Checked by"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden>
          <path d="M13.72 2.47a2.25 2.25 0 013.18 3.18l-8.1 8.1a2.25 2.25 0 01-1.02.57l-2.9.8a.75.75 0 01-.92-.92l.8-2.9a2.25 2.25 0 01.57-1.02l8.39-8.39.02-.02zm2.12 1.06a.75.75 0 00-1.06 0L6.39 11.92a.75.75 0 00-.19.34l-.49 1.78 1.78-.49a.75.75 0 00.34-.19l8.39-8.39a.75.75 0 000-1.06l-.38-.38z" />
          <path d="M3.5 4.75c0-.69.56-1.25 1.25-1.25h4a.75.75 0 010 1.5h-3.75v10.75h10.75v-3.75a.75.75 0 011.5 0v4A1.25 1.25 0 0116 17.25H4.75A1.25 1.25 0 013.5 16V4.75z" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 backdrop-blur-[1px] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signature-title"
            className="w-full max-w-md rounded-xl border border-line bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="signature-title" className="section-title">
                  Signatories
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Printed in the Prepared by / Checked by section. Saved for this sheet so you
                  do not re-type them next time.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm h-8 px-2"
                onClick={() => setOpen(false)}
                aria-label="Close signatories"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="label">Prepared by</span>
                <input
                  className="input"
                  value={values.preparedBy}
                  maxLength={160}
                  onChange={(e) => update({ preparedBy: e.target.value })}
                  placeholder="Name of preparer"
                />
              </label>
              <label className="block">
                <span className="label">Designation (optional)</span>
                <input
                  className="input"
                  value={values.preparedDesignation}
                  maxLength={160}
                  onChange={(e) => update({ preparedDesignation: e.target.value })}
                  placeholder="e.g. College Secretary"
                />
              </label>
              <label className="block">
                <span className="label">Checked by</span>
                <input
                  className="input"
                  value={values.checkedBy}
                  maxLength={160}
                  onChange={(e) => update({ checkedBy: e.target.value })}
                  placeholder="Name of checker"
                />
              </label>
              <label className="block">
                <span className="label">Designation (optional)</span>
                <input
                  className="input"
                  value={values.checkedDesignation}
                  maxLength={160}
                  onChange={(e) => update({ checkedDesignation: e.target.value })}
                  placeholder="e.g. Dean"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save signatories"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Close
              </button>
              {message ? (
                <span
                  className={"text-xs " + (message.ok ? "text-green-700" : "text-red-700")}
                  role="status"
                >
                  {message.text}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
