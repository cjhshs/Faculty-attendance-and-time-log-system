"use client";

import { useState } from "react";
import type { ImportPlan, CommitResult } from "@/lib/import";
import { WEEKDAY_SHORT } from "@/lib/dates";

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPlan(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/schedule/preview", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed.");
      setPlan(data.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!file) return;
    if (
      !window.confirm(
        "Save these changes to the schedule? Existing records are updated, never deleted.",
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/schedule/commit", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setResult(data.result);
      setPlan(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label" htmlFor="schedule-file">
          Schedule Excel file (.xlsx)
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <input
            id="schedule-file"
            type="file"
            accept=".xlsx,.xls"
            className="input max-w-md"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPlan(null);
              setResult(null);
              setError(null);
            }}
          />
          <button className="btn btn-primary" onClick={preview} disabled={!file || loading}>
            {loading ? "Working…" : "Preview import"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Columns are matched by header name. Nothing is saved until you confirm.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Import complete: {result.created} added, {result.updated} updated, {result.unchanged}{" "}
          unchanged. {result.facultyCreated} new faculty, {result.programsCreated} new program(s),{" "}
          {result.roomsCreated} new room(s).
        </div>
      ) : null}

      {plan ? <PlanView plan={plan} onConfirm={commit} loading={loading} /> : null}
    </div>
  );
}

function PlanView({
  plan,
  onConfirm,
  loading,
}: {
  plan: ImportPlan;
  onConfirm: () => void;
  loading: boolean;
}) {
  const s = plan.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Rows read" value={s.rowsRead} />
        <Stat label="Importable" value={s.importable} />
        <Stat label="New slots" value={s.newSlots} tone="green" />
        <Stat label="Updated" value={s.updatedSlots} tone="blue" />
        <Stat label="Unchanged" value={s.unchangedSlots} />
        <Stat label="New faculty" value={s.newFaculty} tone="green" />
        <Stat label="Errors" value={s.errors} tone={s.errors ? "red" : undefined} />
      </div>

      {plan.errors.length ? (
        <Section title={`Errors (${plan.errors.length})`} tone="red">
          <ul className="space-y-1">
            {plan.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs">Row {e.row}</span> — {e.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.warnings.length ? (
        <Section title={`Warnings (${plan.warnings.length})`} tone="amber">
          <ul className="space-y-1">
            {plan.warnings.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs">Row {e.row}</span> — {e.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.duplicateFacultyNames.length ? (
        <Section
          title={`Possible duplicate faculty names (${plan.duplicateFacultyNames.length})`}
          tone="amber"
        >
          <ul className="space-y-1">
            {plan.duplicateFacultyNames.map((d, i) => (
              <li key={i}>
                Row {d.row}: <strong>{d.name}</strong> looks similar to existing{" "}
                <strong>{d.similarTo}</strong>. Confirm before merging.
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.unassigned.length ? (
        <Section title={`Unassigned instructors / TBA (${plan.unassigned.length})`} tone="amber">
          <ul className="space-y-1">
            {plan.unassigned.map((u, i) => (
              <li key={i}>
                Row {u.row}: CN {u.cn} ({u.subject}) has no faculty assigned.
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Parsed schedule slots (${plan.slots.length})`}>
        <div className="max-h-96 overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>CN</th>
                <th>Subject</th>
                <th>Program</th>
                <th>Day</th>
                <th>Time</th>
                <th>Room</th>
                <th>Faculty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.slots.slice(0, 500).map((slot, i) => (
                <tr key={i}>
                  <td>{slot.rowNumber}</td>
                  <td className="font-mono text-xs">{slot.cn}</td>
                  <td>{slot.subject}</td>
                  <td>{slot.courseCode}</td>
                  <td>{WEEKDAY_SHORT[slot.weekday]}</td>
                  <td className="whitespace-nowrap">
                    {slot.start}–{slot.end}
                  </td>
                  <td>{slot.roomCode}</td>
                  <td>{slot.facultyName ?? <span className="text-zinc-400">TBA</span>}</td>
                  <td>
                    <span className={"badge " + (SPAN_STATUS[slot.status] ?? "")}>{slot.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.slots.length > 500 ? (
          <p className="mt-2 text-xs text-zinc-500">
            Showing the first 500 of {plan.slots.length} slots.
          </p>
        ) : null}
      </Section>

      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={loading || s.importable === 0}
        >
          {loading ? "Importing…" : `Confirm import (${s.importable} changes)`}
        </button>
      </div>
    </div>
  );
}

const SPAN_STATUS: Record<string, string> = {
  new: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  unchanged: "bg-zinc-100 text-zinc-600",
  error: "bg-red-100 text-red-800",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "blue" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "blue"
        ? "text-blue-700"
        : tone === "red"
          ? "text-red-700"
          : "text-zinc-900";
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={"mt-1 text-xl font-bold " + toneClass}>{value}</p>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "red" | "amber";
  children: React.ReactNode;
}) {
  const cls =
    tone === "red"
      ? "border-red-300 bg-red-50 text-red-800"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-zinc-200 bg-white";
  return (
    <div className={"rounded-lg border p-4 text-sm " + cls}>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </div>
  );
}
