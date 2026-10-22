"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  RESET_CONFIRMATION_PHRASE,
  totalOperational,
  type OperationalCounts,
  type PreservedCounts,
} from "@/lib/reset";
import {
  resetOperationalData,
  restoreDefaultReferenceData,
  type ResetState,
  type RestoreState,
} from "./actions";

const initialReset: ResetState = { ok: false, message: "" };
const initialRestore: RestoreState = { ok: false, message: "" };

function num(value: number) {
  return value.toLocaleString("en-US");
}

const OPERATIONAL_ROWS: { key: keyof OperationalCounts; label: string }[] = [
  { key: "attendance", label: "Attendance records" },
  { key: "sessions", label: "Attendance sessions" },
  { key: "scheduleSlots", label: "Schedule slots" },
  { key: "importBatches", label: "Import batches" },
  { key: "repairFindings", label: "Repair findings" },
  { key: "repairSources", label: "Repair sources" },
];

const PRESERVED_ROWS: { key: keyof PreservedCounts; label: string }[] = [
  { key: "faculty", label: "Faculty" },
  { key: "courses", label: "Programs" },
  { key: "rooms", label: "Rooms" },
  { key: "holidays", label: "Holidays" },
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "auditLogs", label: "Audit log entries" },
];

export function ResetClient({
  operational,
  preserved,
  backupDir,
}: {
  operational: OperationalCounts;
  preserved: PreservedCounts;
  backupDir: string;
}) {
  const [resetState, resetAction, resetPending] = useActionState(resetOperationalData, initialReset);
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreDefaultReferenceData,
    initialRestore,
  );
  const [resetOpen, setResetOpen] = useState(false);
  const total = totalOperational(operational);

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Operational data</h2>
            <p className="mt-1 text-sm text-muted">
              Attendance, schedules, import history and repair analysis. These records are removed;
              master lists, users, settings, holidays and the audit log are kept.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setResetOpen(true)}
            disabled={resetPending || total === 0}
          >
            Reset operational data…
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CountTable
            title="Will be deleted"
            tone="danger"
            rows={OPERATIONAL_ROWS.map((row) => ({
              label: row.label,
              value: operational[row.key],
            }))}
            total={total}
          />
          <CountTable
            title="Will be kept"
            tone="safe"
            rows={PRESERVED_ROWS.map((row) => ({
              label: row.label,
              value: preserved[row.key],
            }))}
            total={Object.values(preserved).reduce((sum, n) => sum + n, 0)}
          />
        </div>

        <p className="mt-4 text-xs text-muted">
          A compressed database backup is written to <code>{backupDir}</code> before anything is
          deleted. If the backup fails, the reset is cancelled.
        </p>

        {resetState.message ? (
          <div
            role={resetState.ok ? "status" : "alert"}
            className={`mt-4 block ${resetState.ok ? "alert alert-success" : "alert alert-error"}`}
          >
            <div>
              <p>{resetState.message}</p>
              {resetState.backupFile ? (
                <p className="mt-1 text-xs break-all">Backup file: {resetState.backupFile}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="section-title">Default reference data</h2>
        <p className="mt-1 text-sm text-muted">
          Ensures the built-in roles (Dean, Staff, Dean&apos;s Assistant), the permission catalog and
          missing default settings exist. This action only adds or updates defaults — it never
          deletes roles, users, or settings added by an administrator.
        </p>

        <form action={restoreAction} className="mt-4">
          <button type="submit" className="btn btn-primary" disabled={restorePending}>
            {restorePending ? "Restoring…" : "Restore default reference data"}
          </button>
        </form>

        {restoreState.message ? (
          <div
            role={restoreState.ok ? "status" : "alert"}
            className={`mt-4 block ${restoreState.ok ? "alert alert-success" : "alert alert-error"}`}
          >
            <div>
              <p>{restoreState.message}</p>
              {restoreState.stats ? (
                <p className="mt-1 text-xs">
                  {restoreState.stats.permissions} permissions · {restoreState.stats.roles} roles ·{" "}
                  {restoreState.stats.rolePermissionsAdded} role permission(s) added ·{" "}
                  {restoreState.stats.settingsAdded} setting(s) added
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {resetOpen ? (
        <ResetModal
          total={total}
          pending={resetPending}
          state={resetState}
          onCancel={() => setResetOpen(false)}
          onConfirm={resetAction}
        />
      ) : null}
    </div>
  );
}

function CountTable({
  title,
  tone,
  rows,
  total,
}: {
  title: string;
  tone: "danger" | "safe";
  rows: { label: string; value: number }[];
  total: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col" className="text-right">
              Rows
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="text-right tabular-nums">{num(row.value)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td>Total</td>
            <td className={`text-right tabular-nums ${tone === "danger" ? "text-red-700" : ""}`}>
              {num(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ResetModal({
  total,
  pending,
  state,
  onCancel,
  onConfirm,
}: {
  total: number;
  pending: boolean;
  state: ResetState;
  onCancel: () => void;
  onConfirm: (formData: FormData) => void;
}) {
  const [phrase, setPhrase] = useState("");
  const submitted = useRef(false);
  const matches = phrase.trim() === RESET_CONFIRMATION_PHRASE;

  useEffect(() => {
    if (submitted.current && !pending && state.ok) onCancel();
  }, [state.ok, pending, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  if (typeof document === "undefined") return null;

  const content = (
    <ModalShell onCancel={pending ? undefined : onCancel} label="Confirm operational data reset">
      <h2 className="section-title">Reset operational data</h2>
      <p className="mt-2 text-sm">
        This permanently deletes <strong>{num(total)}</strong> operational record(s): attendance,
        schedules, import batches and repair analysis. Faculty, programs, rooms, users, settings and
        holidays are kept.
      </p>
      <ul className="mt-3 list-inside list-disc text-sm text-muted">
        <li>A database backup is created first; the reset is cancelled if it fails.</li>
        <li>The whole reset runs in one transaction and can be retried safely.</li>
        <li>The deletion is recorded in the audit log.</li>
      </ul>

      <form
        action={onConfirm}
        className="mt-4 space-y-3"
        onSubmit={() => {
          submitted.current = true;
        }}
      >
        <label className="label req" htmlFor="reset-confirmation">
          Type {RESET_CONFIRMATION_PHRASE} to confirm
        </label>
        <input
          id="reset-confirmation"
          name="confirmation"
          className="input font-mono"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={RESET_CONFIRMATION_PHRASE}
        />
        {state.message && !state.ok ? (
          <p role="alert" className="alert alert-error block">
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!matches || pending}>
            {pending ? "Backing up and resetting…" : "Reset operational data"}
          </button>
        </div>
      </form>
    </ModalShell>
  );

  return createPortal(content, document.body);
}

function ModalShell({
  children,
  label,
  onCancel,
}: {
  children: ReactNode;
  label: string;
  onCancel?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
