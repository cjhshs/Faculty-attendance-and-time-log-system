"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  applyRepairSource,
  revertRepairSource,
  type RepairApplyState,
  type RepairRevertState,
} from "./actions";

const applyInitial: RepairApplyState = { ok: false, message: "" };
const revertInitial: RepairRevertState = { ok: false, message: "" };

export function ApplyPanel({
  sourceId,
  applied,
  defaultSchoolYear,
  defaultSemester,
}: {
  sourceId: number;
  applied: boolean;
  defaultSchoolYear: string;
  defaultSemester: string;
}) {
  const router = useRouter();
  const [applyState, applyAction, applying] = useActionState(applyRepairSource, applyInitial);
  const [revertState, revertAction, reverting] = useActionState(revertRepairSource, revertInitial);

  useEffect(() => {
    if (applyState.ok || revertState.ok) router.refresh();
  }, [applyState.ok, revertState.ok, router]);

  return (
    <div className="card space-y-4">
      <h2 className="section-title mb-0">Apply the repaired schedule</h2>
      <p className="text-sm text-muted">
        Approved corrections are written into the selected semester. Existing schedules are updated,
        never deleted, and attendance is never touched. Unresolved findings block this step.
      </p>

      <form action={applyAction} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="sourceId" value={sourceId} />
        <div>
          <label className="label" htmlFor="apply-year">
            Target academic year
          </label>
          <input id="apply-year" name="schoolYear" defaultValue={defaultSchoolYear} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="apply-sem">
            Target semester
          </label>
          <select id="apply-sem" name="semester" defaultValue={defaultSemester} className="select">
            <option value="1st Semester">1st Semester</option>
            <option value="2nd Semester">2nd Semester</option>
            <option value="Summer">Summer</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={applying}>
          {applying ? "Applying…" : "Apply repairs"}
        </button>
      </form>
      {applyState.message ? (
        <div className={"alert " + (applyState.ok ? "alert-success" : "alert-error")}>{applyState.message}</div>
      ) : null}

      {applied ? (
        <div className="border-t border-line pt-4">
          <form action={revertAction} className="flex items-center gap-3">
            <input type="hidden" name="sourceId" value={sourceId} />
            <button
              type="submit"
              className="btn btn-danger"
              disabled={reverting}
              onClick={(e) => {
                if (!window.confirm("Revert removes the schedules this analysis wrote. Attendance is kept. Continue?"))
                  e.preventDefault();
              }}
            >
              {reverting ? "Reverting…" : "Revert applied schedules"}
            </button>
            <span className="text-xs text-muted">Removes only the slots this analysis created.</span>
          </form>
          {revertState.message ? (
            <div className={"alert mt-2 " + (revertState.ok ? "alert-success" : "alert-error")}>
              {revertState.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
