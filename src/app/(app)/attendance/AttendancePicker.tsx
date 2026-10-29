"use client";

import { useEffect, useMemo, useState } from "react";

export type PickerProgram = { code: string; name: string | null };
export type PickerCollege = { code: string; name: string; programs: PickerProgram[] };

// Department-first scope picker for attendance generation. Selecting a
// department includes its registered faculty across every program they teach;
// the student program no longer decides whose columns appear.
export function AttendancePicker({
  colleges,
  unassigned,
  department,
  selectedCodes,
}: {
  colleges: PickerCollege[];
  unassigned: PickerProgram[];
  department: string;
  selectedCodes: string[];
}) {
  const [selectedDepartment, setSelectedDepartment] = useState(department);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedCodes));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with a new server-provided scope
    setSelectedDepartment(department);
    setChecked(new Set(selectedCodes));
  }, [department, selectedCodes]);

  useEffect(() => {
    function onRestore(event: Event) {
      const values = (event as CustomEvent<{ values?: Record<string, unknown> }>).detail?.values;
      if (!values) return;
      if (typeof values.department === "string") setSelectedDepartment(values.department);
      if (Array.isArray(values.programs)) {
        setChecked(new Set((values.programs as unknown[]).map(String)));
      }
    }
    window.addEventListener("fa:draft-restored", onRestore);
    return () => window.removeEventListener("fa:draft-restored", onRestore);
  }, []);

  const departmentPrograms = useMemo(() => {
    if (!selectedDepartment || selectedDepartment === "unassigned") return [];
    return colleges.find((c) => c.code === selectedDepartment)?.programs ?? [];
  }, [colleges, selectedDepartment]);

  const totalPrograms =
    colleges.reduce((n, c) => n + c.programs.length, 0) + unassigned.length;

  return (
    <div className="space-y-2">
      <div>
        <label className="label" htmlFor="print-department">
          Department (faculty roster)
        </label>
        <select
          id="print-department"
          name="department"
          className="input"
          value={selectedDepartment}
          onChange={(e) => setSelectedDepartment(e.target.value)}
        >
          <option value="">All departments / all programs</option>
          {colleges.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
          {unassigned.length > 0 ? (
            <option value="unassigned">Faculty without a department</option>
          ) : null}
        </select>
      </div>

      <input type="hidden" name="listed" value="1" />

      {selectedDepartment ? (
        <div className="rounded-lg border border-line bg-slate-50 px-4 py-3 text-xs text-muted">
          <p>
            <strong className="text-ink">
              {selectedDepartment === "unassigned"
                ? "Faculty without a registered department"
                : selectedDepartment}
            </strong>{" "}
            — every program taught by these faculty is included, even when the subject belongs to
            another student course. Non-department teachers are excluded.
          </p>
          {departmentPrograms.length > 0 ? (
            <p className="mt-1">
              Programs linked to this department:{" "}
              {departmentPrograms.map((p) => p.code).join(", ")}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="label mb-0">Optional program filter</p>
            <button
              type="button"
              className="text-xs underline"
              onClick={() =>
                setChecked(
                  new Set(
                    checked.size > 0
                      ? []
                      : Array.from(
                          new Set([
                            ...colleges.flatMap((c) => c.programs.map((p) => p.code)),
                            ...unassigned.map((p) => p.code),
                          ]),
                        ),
                  ),
                )
              }
            >
              {checked.size > 0 ? "Clear" : "Select all"}
            </button>
            <span className="text-xs text-muted">{checked.size} selected</span>
          </div>
          <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-2 overflow-auto rounded-lg border border-line bg-white px-3 py-2">
            {colleges
              .flatMap((c) => c.programs)
              .concat(unassigned)
              .map((p) => (
                <label key={p.code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="programs"
                    value={p.code}
                    checked={checked.has(p.code)}
                    onChange={(e) => {
                      const next = new Set(checked);
                      if (e.target.checked) next.add(p.code);
                      else next.delete(p.code);
                      setChecked(next);
                    }}
                  />
                  <span>{p.code}</span>
                </label>
              ))}
            {totalPrograms === 0 ? (
              <span className="text-sm text-muted">No programs on file yet.</span>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            Leave every program unchecked to print all programs. This legacy filter only narrows
            the sheets; faculty membership still comes from the registered department.
          </p>
        </div>
      )}
    </div>
  );
}
