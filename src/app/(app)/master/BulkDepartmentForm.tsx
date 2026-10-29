"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionResult } from "./actions";

type FacultyOption = {
  id: number;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
};

// Bulk department assignment for a roster that may contain hundreds of rows.
// It never guesses a department and never creates a faculty member: each selected
// roster row is updated explicitly, and rows that already have a department are
// skipped unless the reviewer ticks "overwrite".
export function BulkDepartmentForm({
  action,
  faculty,
  departments,
  unassignedCount,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  faculty: FacultyOption[];
  departments: { id: number; code: string; name: string }[];
  unassignedCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );
  const [query, setQuery] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [overwrite, setOverwrite] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faculty.filter((f) => {
      if (onlyUnassigned && f.departmentCode) return false;
      if (!q) return true;
      return (
        f.fullName.toLowerCase().includes(q) ||
        (f.departmentCode ?? "").toLowerCase().includes(q) ||
        (f.departmentName ?? "").toLowerCase().includes(q)
      );
    });
  }, [faculty, onlyUnassigned, query]);

  const visibleSelected = visible.filter((f) => selected.has(f.id)).length;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of visible) next.add(f.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <form action={formAction} className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label className="label" htmlFor="bulk-faculty-query">
            Find faculty
          </label>
          <input
            id="bulk-faculty-query"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or current department"
          />
        </div>
        <div className="min-w-56">
          <label className="label req" htmlFor="bulk-department">
            Set department to
          </label>
          <select id="bulk-department" name="departmentId" className="input" defaultValue="" required>
            <option value="">Choose department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={(e) => setOnlyUnassigned(e.target.checked)}
          />
          Only unassigned
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            name="overwrite"
            value="1"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Overwrite existing
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">
          {visible.length} shown · {visibleSelected} selected · {unassignedCount} without a
          department in total
        </span>
        <button type="button" className="btn btn-sm" onClick={selectAllVisible}>
          Select all shown
        </button>
        <button type="button" className="btn btn-sm" onClick={clearSelection}>
          Clear
        </button>
      </div>

      <div className="mt-2 max-h-64 overflow-auto rounded border border-line">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              <th scope="col" className="w-8">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col">Faculty</th>
              <th scope="col">Current department</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.id}>
                <td>
                  <input
                    type="checkbox"
                    name="facultyIds"
                    value={f.id}
                    checked={selected.has(f.id)}
                    onChange={() => toggle(f.id)}
                    aria-label={`Select ${f.fullName}`}
                  />
                </td>
                <td>{f.fullName}</td>
                <td className="whitespace-nowrap text-xs">
                  {f.departmentCode ? (
                    `${f.departmentCode} — ${f.departmentName ?? ""}`
                  ) : (
                    <span className="badge bg-amber-100 text-amber-800">No department</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  {onlyUnassigned
                    ? "Every registered faculty member already has a department."
                    : "No faculty match this search."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Assigning…" : `Assign ${selected.size || ""} selected`}
        </button>
        <span className="text-xs text-muted">
          {overwrite
            ? "Existing departments will be replaced for the selected rows."
            : "Only faculty without a department will be changed."}
        </span>
        {state ? (
          <span
            role="status"
            className={
              "rounded-lg border px-2.5 py-1.5 text-xs " +
              (state.ok
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700")
            }
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
