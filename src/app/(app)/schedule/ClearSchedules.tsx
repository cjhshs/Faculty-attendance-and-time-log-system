"use client";

import { useEffect, useState, useTransition } from "react";
import {
  clearImportedSchedules,
  previewClearSchedules,
  type ClearPreview,
  type ClearState,
} from "./actions";

const initialState: ClearState = { ok: false, message: "" };

type BatchOption = { id: number; label: string };

export function ClearSchedules({
  selectedTerm,
  batches,
}: {
  selectedTerm: { schoolYear: string; semester: string } | null;
  batches: BatchOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"term" | "batch">(selectedTerm ? "term" : "batch");
  const [batchId, setBatchId] = useState("");
  const [preview, setPreview] = useState<ClearPreview | null>(null);
  const [result, setResult] = useState<ClearState["result"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirming(false);
  }

  function scopeForm(): FormData {
    const fd = new FormData();
    if (mode === "batch") {
      fd.set("mode", "batch");
      fd.set("batchId", batchId);
    } else if (selectedTerm) {
      fd.set("mode", "term");
      fd.set("schoolYear", selectedTerm.schoolYear);
      fd.set("semester", selectedTerm.semester);
    }
    return fd;
  }

  function runPreview() {
    setError(null);
    setResult(null);
    setPreview(null);
    startTransition(async () => {
      const state = await previewClearSchedules(initialState, scopeForm());
      if (!state.ok || !state.preview) {
        setError(state.message || "Could not build a preview.");
        return;
      }
      setPreview(state.preview);
    });
  }

  function runClear() {
    setError(null);
    startTransition(async () => {
      const state = await clearImportedSchedules(initialState, scopeForm());
      setConfirming(false);
      if (!state.ok) {
        setError(state.message);
        return;
      }
      setResult(state.result ?? null);
      setPreview(null);
    });
  }

  const canPreview =
    !pending && (mode === "term" ? !!selectedTerm : batchId !== "");

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Clear imported schedules</h2>
          <p className="text-sm text-muted">
            Remove schedules from one semester or a single import batch so a corrected file can be
            imported. Schedules with attendance history are always kept.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen((v) => !v);
            reset();
          }}
        >
          {open ? "Close" : "Clear imported schedules"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <fieldset className="space-y-2">
            <legend className="label">What should be cleared?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="clear-scope"
                checked={mode === "term"}
                disabled={!selectedTerm}
                onChange={() => {
                  setMode("term");
                  reset();
                }}
              />
              <span>
                This semester —{" "}
                {selectedTerm ? (
                  <strong>
                    {selectedTerm.schoolYear} · {selectedTerm.semester}
                  </strong>
                ) : (
                  <span className="text-muted">select a single semester first</span>
                )}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="clear-scope"
                checked={mode === "batch"}
                disabled={batches.length === 0}
                onChange={() => {
                  setMode("batch");
                  reset();
                }}
              />
              <span>
                A specific import batch{" "}
                {batches.length === 0 ? (
                  <span className="text-muted">(no tracked imports yet)</span>
                ) : null}
              </span>
            </label>
          </fieldset>

          {mode === "batch" ? (
            <div>
              <label className="label req" htmlFor="clear-batch">
                Import batch
              </label>
              <select
                id="clear-batch"
                className="input max-w-xl"
                value={batchId}
                onChange={(e) => {
                  setBatchId(e.target.value);
                  reset();
                }}
              >
                <option value="">Select an import batch…</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button type="button" className="btn btn-primary" onClick={runPreview} disabled={!canPreview}>
            {pending ? "Checking…" : "Preview what will be cleared"}
          </button>

          {error ? (
            <p role="alert" className="alert alert-error block">
              {error}
            </p>
          ) : null}

          {result ? (
            <p role="status" className="alert alert-success block">
              {result.cleared} schedule(s) cleared.
              {result.retained > 0
                ? ` ${result.retained} kept because they have attendance history.`
                : ""}
            </p>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-lg border border-line bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Scope" value={preview.scopeLabel} />
                <Stat label="In scope" value={String(preview.total)} />
                <Stat label="Will be cleared" value={String(preview.clearable)} tone="red" />
                <Stat label="Retained (attendance)" value={String(preview.retained)} tone="amber" />
              </div>

              {preview.schoolYear || preview.semester ? (
                <p className="text-sm text-muted">
                  Academic year{" "}
                  <strong>{preview.schoolYear ?? "—"}</strong> · semester{" "}
                  <strong>{preview.semester ?? "—"}</strong>
                  {preview.batchId ? ` · import batch #${preview.batchId}` : ""}
                </p>
              ) : null}

              <p className="text-sm">
                {preview.clearable > 0 ? (
                  <>
                    This will permanently delete <strong>{preview.clearable}</strong> schedule(s)
                    from <strong>{preview.scopeLabel}</strong>. Faculty, programs, rooms and
                    attendance are not affected.
                  </>
                ) : (
                  <>There are no schedules that can be safely removed in this scope.</>
                )}
              </p>

              {preview.retained > 0 ? (
                <div className="alert alert-warn block">
                  <div>
                    <strong>{preview.retained}</strong> schedule(s) will be kept because they have
                    attendance history and can&apos;t be safely removed. Edit them individually instead.
                    {preview.retainedSample.length > 0 ? (
                      <ul className="mt-1 list-inside list-disc text-xs">
                        {preview.retainedSample.map((r) => (
                          <li key={r.id}>
                            CN {r.cn} — {r.subject} ({r.attendance} record
                            {r.attendance === 1 ? "" : "s"})
                          </li>
                        ))}
                        {preview.retained > preview.retainedSample.length ? (
                          <li>…and {preview.retained - preview.retainedSample.length} more</li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn-danger"
                disabled={preview.clearable === 0 || pending}
                onClick={() => setConfirming(true)}
              >
                Clear {preview.clearable} schedule(s)…
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {confirming && preview ? (
        <ConfirmModal
          preview={preview}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={runClear}
        />
      ) : null}
    </div>
  );
}

function ConfirmModal({
  preview,
  pending,
  onCancel,
  onConfirm,
}: {
  preview: ClearPreview;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm clearing schedules"
      >
        <h2 className="section-title">Clear imported schedules</h2>
        <p className="mt-2 text-sm">
          You are about to permanently delete <strong>{preview.clearable}</strong> schedule(s) from{" "}
          <strong>{preview.scopeLabel}</strong>.
        </p>
        <ul className="mt-3 list-inside list-disc text-sm text-muted">
          <li>Attendance history is never deleted.</li>
          <li>
            {preview.retained > 0
              ? `${preview.retained} schedule(s) with attendance will be retained.`
              : "No schedule in this scope has attendance history."}
          </li>
          <li>Other semesters, faculty, programs and rooms are not affected.</li>
        </ul>
        <p className="mt-3 alert alert-error block">This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Clearing…" : `Yes, clear ${preview.clearable} schedule(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "amber";
}) {
  const toneClass =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-navy";
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
