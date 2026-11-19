"use client";

import { useEffect, useMemo, useState } from "react";

export type FilterProgram = { code: string; name: string | null };
export type FilterCollege = { code: string; name: string; programs: FilterProgram[] };

// Course / Program selector for the CET-exclusive Faculty Attendance System.
// Department switching is removed because the system is strictly CET-exclusive.
// All programs shown are official CET programs.
export function CollegeCourseFilter({
  colleges,
  unassigned = [],
  college = "CET",
  program = "",
  showCounts = true,
  idPrefix = "scope",
}: {
  colleges: FilterCollege[];
  unassigned?: FilterProgram[];
  college?: string;
  program: string;
  includeUnassigned?: boolean;
  showCounts?: boolean;
  idPrefix?: string;
}) {
  const [selectedProgram, setSelectedProgram] = useState(program);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with a new server-provided URL scope
    setSelectedProgram(program);
  }, [program]);

  useEffect(() => {
    function onRestore(event: Event) {
      const values = (event as CustomEvent<{ values?: Record<string, unknown> }>).detail?.values;
      if (!values) return;
      if (typeof values.program === "string") setSelectedProgram(values.program);
    }
    window.addEventListener("fa:draft-restored", onRestore);
    return () => window.removeEventListener("fa:draft-restored", onRestore);
  }, []);

  const cetCollege = useMemo(
    () => colleges.find((c) => c.code.toUpperCase() === "CET") ?? colleges[0] ?? null,
    [colleges],
  );

  const programs: FilterProgram[] = useMemo(() => {
    if (cetCollege && cetCollege.programs.length > 0) return cetCollege.programs;
    return colleges.flatMap((c) => c.programs);
  }, [cetCollege, colleges]);

  return (
    <>
      <input type="hidden" name="college" value="CET" />
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
            All CET programs{showCounts && programs.length > 0 ? ` (${programs.length})` : ""}
          </option>
          {programs.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code}
              {p.name ? ` — ${p.name}` : ""}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
