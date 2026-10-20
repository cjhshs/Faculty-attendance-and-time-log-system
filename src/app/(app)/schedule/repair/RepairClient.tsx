"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { analyzeRepairWorkbook, type RepairAnalyzeState } from "./actions";

const initialState: RepairAnalyzeState = { ok: false, message: "" };

export function RepairClient({
  defaultSchoolYear,
  defaultSemester,
}: {
  defaultSchoolYear: string;
  defaultSemester: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(analyzeRepairWorkbook, initialState);

  useEffect(() => {
    if (state.ok && state.sourceId) {
      router.push(`/schedule/repair?sourceId=${state.sourceId}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="repair-file">
          Schedule workbook (.xlsx)
        </label>
        <input id="repair-file" name="file" type="file" accept=".xlsx,.xls" className="input max-w-md" required />
      </div>
      <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
        <div>
          <label className="label" htmlFor="repair-year">
            Target academic year
          </label>
          <input
            id="repair-year"
            name="schoolYear"
            defaultValue={defaultSchoolYear}
            className="input"
            placeholder="e.g. 2026-2027"
          />
        </div>
        <div>
          <label className="label" htmlFor="repair-sem">
            Target semester
          </label>
          <select id="repair-sem" name="semester" defaultValue={defaultSemester} className="select">
            <option value="1st Semester">1st Semester</option>
            <option value="2nd Semester">2nd Semester</option>
            <option value="Summer">Summer</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Analyzing…" : "Analyze workbook"}
        </button>
      </div>
      <p className="text-xs text-muted">
        The workbook is read only. Every issue is stored for review; no schedule is written until you
        apply.
      </p>
      {state.message ? (
        <div className={"alert " + (state.ok ? "alert-success" : "alert-error")}>{state.message}</div>
      ) : null}
    </form>
  );
}
