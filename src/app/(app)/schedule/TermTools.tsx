"use client";

import { useActionState, useState } from "react";
import { copySchedulesToTerm, type ScheduleEditState } from "./actions";

const initialState: ScheduleEditState = { ok: false, message: "" };

export function TermTools({
  sourceYear,
  sourceSemester,
  years,
}: {
  sourceYear: string;
  sourceSemester: string;
  years: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(copySchedulesToTerm, initialState);

  const nextYear = (() => {
    const match = /^(\d{4})-(\d{4})$/.exec(sourceYear);
    if (!match) return years[0] ?? sourceYear;
    const start = Number(match[1]) + 1;
    return `${start}-${start + 1}`;
  })();

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Copy schedule to another semester</h2>
          <p className="text-sm text-muted">
            Copies the schedule structure from <strong>{sourceYear}</strong> ·{" "}
            <strong>{sourceSemester}</strong> into a new semester. Attendance records are never
            copied.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Copy schedules"}
        </button>
      </div>

      {open ? (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4">
          <input type="hidden" name="sourceSchoolYear" value={sourceYear} />
          <input type="hidden" name="sourceSemester" value={sourceSemester} />

          <div>
            <label className="label req" htmlFor="targetSchoolYear">
              Target academic year
            </label>
            <input
              id="targetSchoolYear"
              name="targetSchoolYear"
              list="term-years"
              className="input"
              defaultValue={nextYear}
              placeholder="e.g. 2027-2028"
              required
            />
            <datalist id="term-years">
              {years.map((y) => (
                <option key={y} value={y} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label req" htmlFor="targetSemester">
              Target semester
            </label>
            <select id="targetSemester" name="targetSemester" className="select" defaultValue="2nd Semester">
              <option value="1st Semester">1st Semester</option>
              <option value="2nd Semester">2nd Semester</option>
              <option value="Summer">Summer</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Copying…" : "Copy schedules"}
          </button>

          {state.message ? (
            <p
              role="status"
              className={`alert block w-full ${state.ok ? "alert-success" : "alert-error"}`}
            >
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
