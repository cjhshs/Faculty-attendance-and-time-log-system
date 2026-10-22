"use client";

import { useState } from "react";

export type PickerProgram = { code: string; name: string | null };
export type PickerCollege = { code: string; name: string; programs: PickerProgram[] };

// College + per-program checkboxes for the printable attendance sheets. Choosing
// a college checks all of its programs, which is the common "print one college"
// action; individual programs can still be unchecked before submitting.
export function AttendancePicker({
  colleges,
  unassigned,
  college,
  selectedCodes,
}: {
  colleges: PickerCollege[];
  unassigned: PickerProgram[];
  college: string;
  selectedCodes: string[];
}) {
  const [selectedCollege, setSelectedCollege] = useState(college);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedCodes));

  const visible =
    selectedCollege === ""
      ? [
          ...colleges.flatMap((c) =>
            c.programs.map((p) => ({ ...p, collegeCode: c.code, collegeName: c.name })),
          ),
          ...unassigned.map((p) => ({
            ...p,
            collegeCode: "unassigned",
            collegeName: "Unassigned",
          })),
        ]
      : selectedCollege === "unassigned"
        ? unassigned.map((p) => ({
            ...p,
            collegeCode: "unassigned",
            collegeName: "Unassigned",
          }))
        : (colleges.find((c) => c.code === selectedCollege)?.programs ?? []).map((p) => ({
            ...p,
            collegeCode: selectedCollege,
            collegeName: colleges.find((c) => c.code === selectedCollege)?.name ?? "",
          }));

  function chooseCollege(value: string) {
    setSelectedCollege(value);
    const next =
      value === ""
        ? [
            ...colleges.flatMap((c) => c.programs.map((p) => p.code)),
            ...unassigned.map((p) => p.code),
          ]
        : value === "unassigned"
          ? unassigned.map((p) => p.code)
          : colleges.find((c) => c.code === value)?.programs.map((p) => p.code) ?? [];
    setChecked(new Set(next));
  }

  const allVisibleChecked = visible.length > 0 && visible.every((p) => checked.has(p.code));

  return (
    <div className="space-y-2">
      <div>
        <label className="label" htmlFor="print-college">
          College / Department
        </label>
        <select
          id="print-college"
          name="college"
          className="input"
          value={selectedCollege}
          onChange={(e) => chooseCollege(e.target.value)}
        >
          <option value="">All colleges ({colleges.reduce((n, c) => n + c.programs.length, 0) + unassigned.length})</option>
          {colleges.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name} ({c.programs.length})
            </option>
          ))}
          {unassigned.length > 0 ? (
            <option value="unassigned">Unassigned programs ({unassigned.length})</option>
          ) : null}
        </select>
      </div>

      <input type="hidden" name="listed" value="1" />

      <div className="flex items-center gap-3">
        <p className="label mb-0">Programs</p>
        <button
          type="button"
          className="text-xs underline"
          onClick={() =>
            setChecked(
              allVisibleChecked ? new Set() : new Set(visible.map((p) => p.code)),
            )
          }
        >
          {allVisibleChecked ? "Uncheck all" : "Check all"}
        </button>
        <span className="text-xs text-muted">
          {visible.filter((p) => checked.has(p.code)).length} of {visible.length} selected
        </span>
      </div>

      <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-auto rounded border border-line p-2">
        {visible.map((p) => (
          <label key={p.code} className="flex items-center gap-1 text-sm">
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
            <span title={p.collegeName}>{p.code}</span>
          </label>
        ))}
        {visible.length === 0 ? (
          <span className="text-sm text-muted">No programs in this college yet.</span>
        ) : null}
      </div>
    </div>
  );
}
