"use client";

import { useActionState } from "react";
import type { ActionResult } from "../master/actions";

// Per-faculty membership editor used by the Departments page. Assignment and
// removal are separate actions; removal always asks for explicit confirmation
// and states how many historical records are preserved.
export function DepartmentMembershipForm({
  assignAction,
  removeAction,
  facultyId,
  fullName,
  departmentId,
  departmentCode,
  departments,
  scheduleSlots,
  attendanceRecords,
}: {
  assignAction: (formData: FormData) => Promise<ActionResult>;
  removeAction: (formData: FormData) => Promise<ActionResult>;
  facultyId: number;
  fullName: string;
  departmentId: number | null;
  departmentCode: string | null;
  departments: { id: number; code: string; name: string }[];
  scheduleSlots: number;
  attendanceRecords: number;
}) {
  const [assignState, assignFormAction, assigning] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => assignAction(formData),
    null,
  );
  const [removeState, removeFormAction, removing] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => removeAction(formData),
    null,
  );

  return (
    <div className="space-y-1">
      <form action={assignFormAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="id" value={facultyId} />
        <select
          name="departmentId"
          defaultValue={departmentId ? String(departmentId) : ""}
          className="input h-8 w-44 px-1 py-0.5 text-xs"
          aria-label={`Department for ${fullName}`}
        >
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-sm h-8 px-2" disabled={assigning || removing}>
          {assigning ? "…" : "Set"}
        </button>
      </form>
      {assignState ? <ResultMessage state={assignState} /> : null}

      {departmentId ? (
        <form action={removeFormAction} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={facultyId} />
          <input type="hidden" name="confirm" value="1" />
          <button
            type="submit"
            className="btn btn-sm btn-danger h-8 px-2"
            disabled={assigning || removing}
            onClick={(event) => {
              const ok = window.confirm(
                `Remove ${fullName} from ${departmentCode ?? "their department"}?\n\n` +
                  `The faculty record stays, and ${scheduleSlots} schedule slot(s) and ${attendanceRecords} attendance record(s) are preserved. Nothing is deleted. You can reassign a department later.`,
              );
              if (!ok) event.preventDefault();
            }}
          >
            {removing ? "…" : "Remove from department"}
          </button>
        </form>
      ) : null}
      {removeState ? <ResultMessage state={removeState} /> : null}
    </div>
  );
}

function ResultMessage({ state }: { state: ActionResult }) {
  return (
    <p
      role="status"
      className={
        "rounded-lg border px-2.5 py-1.5 text-xs " +
        (state.ok
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700")
      }
    >
      {state.message}
    </p>
  );
}
