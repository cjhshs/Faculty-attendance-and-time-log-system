"use client";

import { useEffect, useMemo, useState } from "react";

export type PickerProgram = { code: string; name: string | null };
export type PickerCollege = { code: string; name: string; programs: PickerProgram[] };

// CET-exclusive attendance scope picker for attendance sheet generation.
// Department switching is removed as the system is strictly CET-exclusive.
export function AttendancePicker({
  colleges,
  selectedCodes,
}: {
  colleges: PickerCollege[];
  unassigned?: PickerProgram[];
  department?: string;
  selectedCodes: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedCodes));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with a new server-provided scope
    setChecked(new Set(selectedCodes));
  }, [selectedCodes]);

  useEffect(() => {
    function onRestore(event: Event) {
      const values = (event as CustomEvent<{ values?: Record<string, unknown> }>).detail?.values;
      if (!values) return;
      if (Array.isArray(values.programs)) {
        setChecked(new Set((values.programs as unknown[]).map(String)));
      }
    }
    window.addEventListener("fa:draft-restored", onRestore);
    return () => window.removeEventListener("fa:draft-restored", onRestore);
  }, []);

  const cetCollege = useMemo(
    () => colleges.find((c) => c.code.toUpperCase() === "CET") ?? colleges[0] ?? null,
    [colleges],
  );

  const departmentPrograms = useMemo(() => {
    if (cetCollege && cetCollege.programs.length > 0) return cetCollege.programs;
    return colleges.flatMap((c) => c.programs);
  }, [cetCollege, colleges]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="department" value="CET" />
      <input type="hidden" name="listed" value="1" />

      <div className="rounded-lg border border-line bg-slate-50 px-4 py-3 text-xs text-muted">
        <p>
          <strong className="text-ink">College of Engineering and Technology (CET)</strong>{" "}
          — Course-based attendance sheets for CET programs. Each program sheet includes faculty
          who teach its major/professional subjects, plus custom additions.
        </p>
        {departmentPrograms.length > 0 ? (
          <p className="mt-1">
            CET Programs:{" "}
            <span className="font-medium text-ink">
              {departmentPrograms.map((p) => p.code).join(", ")}
            </span>
          </p>
        ) : null}
      </div>

      {departmentPrograms.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="visually-hidden">Filter programs in CET</legend>
          <div className="flex flex-wrap items-center gap-3">
            <p className="label mb-0 text-xs">Filter programs in CET (optional):</p>
            <button
              type="button"
              className="text-xs underline text-navy"
              onClick={() =>
                setChecked(
                  new Set(
                    checked.size > 0 ? [] : departmentPrograms.map((p) => p.code),
                  ),
                )
              }
            >
              {checked.size > 0 ? "Clear selection" : "Select all"}
            </button>
            <span className="text-xs text-muted">
              {checked.size > 0 ? `${checked.size} selected` : "All programs included"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {departmentPrograms.map((p) => {
              const active = checked.has(p.code);
              return (
                <label
                  key={p.code}
                  className={
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition-colors " +
                    (active
                      ? "border-navy bg-navy/5 text-navy font-medium"
                      : "border-line bg-white hover:border-slate-300 text-ink")
                  }
                >
                  <input
                    type="checkbox"
                    name="programs"
                    value={p.code}
                    checked={active}
                    onChange={(e) => {
                      const next = new Set(checked);
                      if (e.target.checked) next.add(p.code);
                      else next.delete(p.code);
                      setChecked(next);
                    }}
                    className="mt-0.5 rounded border-line"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.code}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {p.name ?? "unnamed"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
