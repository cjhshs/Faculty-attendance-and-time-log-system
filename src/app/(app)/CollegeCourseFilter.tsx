"use client";

import { useMemo, useState } from "react";

export type FilterProgram = { code: string; name: string | null };
export type FilterCollege = { code: string; name: string; programs: FilterProgram[] };

// Dependent College → Program selectors shared by the schedule, attendance,
// summary and import screens. Picking a college narrows the program list and
// clears a program that is no longer valid; "All colleges" restores every
// program. The form still submits as a normal GET request.
export function CollegeCourseFilter({
  colleges,
  unassigned = [],
  college,
  program,
  includeUnassigned = true,
  showCounts = true,
  idPrefix = "scope",
}: {
  colleges: FilterCollege[];
  unassigned?: FilterProgram[];
  college: string;
  program: string;
  includeUnassigned?: boolean;
  showCounts?: boolean;
  idPrefix?: string;
}) {
  const [selectedCollege, setSelectedCollege] = useState(college);
  const [selectedProgram, setSelectedProgram] = useState(program);

  const activeCollege = useMemo(
    () => colleges.find((c) => c.code === selectedCollege) ?? null,
    [colleges, selectedCollege],
  );

  const programOptions = useMemo(() => {
    if (selectedCollege === "unassigned") return unassigned;
    if (activeCollege) return activeCollege.programs;
    return [
      ...colleges.flatMap((c) => c.programs.map((p) => ({ ...p, college: c.code }))),
      ...unassigned.map((p) => ({ ...p, college: "unassigned" })),
    ];
  }, [activeCollege, colleges, selectedCollege, unassigned]);

  const totalPrograms = colleges.reduce((n, c) => n + c.programs.length, 0) + unassigned.length;

  return (
    <>
      <div>
        <label className="label" htmlFor={`${idPrefix}-college`}>
          College / Department
        </label>
        <select
          id={`${idPrefix}-college`}
          name="college"
          className="input"
          value={selectedCollege}
          onChange={(e) => {
            setSelectedCollege(e.target.value);
            setSelectedProgram("");
          }}
        >
          <option value="">All colleges{showCounts ? ` (${totalPrograms})` : ""}</option>
          {colleges.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
              {showCounts ? ` (${c.programs.length})` : ""}
            </option>
          ))}
          {includeUnassigned && unassigned.length > 0 ? (
            <option value="unassigned">
              Unassigned programs{showCounts ? ` (${unassigned.length})` : ""}
            </option>
          ) : null}
        </select>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-program`}>
          Course / Program
        </label>
        <select
          id={`${idPrefix}-program`}
          name="program"
          className="input"
          value={selectedProgram}
          onChange={(e) => setSelectedProgram(e.target.value)}
        >
          <option value="">
            {selectedCollege === "unassigned"
              ? "All unassigned programs"
              : activeCollege
                ? `All programs in ${activeCollege.code}`
                : "All programs"}
          </option>
          {selectedCollege === "" && !activeCollege
            ? colleges.map((c) => (
                <optgroup key={c.code} label={`${c.code} — ${c.name}`}>
                  {c.programs.map((p) => (
                    <option key={`${c.code}-${p.code}`} value={p.code}>
                      {p.code}
                      {p.name ? ` — ${p.name}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))
            : null}
          {selectedCollege === "" && !activeCollege && includeUnassigned && unassigned.length > 0 ? (
            <optgroup label="Unassigned programs">
              {unassigned.map((p) => (
                <option key={`unassigned-${p.code}`} value={p.code}>
                  {p.code}
                  {p.name ? ` — ${p.name}` : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
          {selectedCollege !== "" || activeCollege
            ? programOptions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code}
                  {p.name ? ` — ${p.name}` : ""}
                </option>
              ))
            : null}
        </select>
      </div>
    </>
  );
}
