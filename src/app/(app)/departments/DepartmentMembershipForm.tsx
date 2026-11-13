"use client";

import { useActionState, useMemo, useState } from "react";
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

export function AddFacultyToDepartmentForm({
  assignAction,
  facultyList,
  departments,
  defaultDepartmentId,
}: {
  assignAction: (formData: FormData) => Promise<ActionResult>;
  facultyList: { id: number; fullName: string; departmentCode: string | null }[];
  departments: { id: number; code: string; name: string }[];
  defaultDepartmentId?: number | null;
}) {
  const [filterText, setFilterText] = useState("");
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [targetDepartmentId, setTargetDepartmentId] = useState(
    defaultDepartmentId ? String(defaultDepartmentId) : departments[0]?.id ? String(departments[0].id) : "",
  );

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const res = await assignAction(formData);
      if (res.ok) {
        setSelectedFacultyId("");
      }
      return res;
    },
    null,
  );

  const filteredFaculty = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return facultyList;
    return facultyList.filter(
      (f) =>
        f.fullName.toLowerCase().includes(q) ||
        (f.departmentCode && f.departmentCode.toLowerCase().includes(q)),
    );
  }, [facultyList, filterText]);

  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-navy">Add / Assign Faculty to Department</h3>
      <p className="mt-0.5 text-xs text-muted">
        Select any existing faculty member and assign them to a department. Their schedule and
        attendance records will immediately reflect this department.
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className="label text-xs" htmlFor="add-faculty-search">
              Filter faculty by name
            </label>
            <input
              id="add-faculty-search"
              type="text"
              placeholder="Search faculty..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="input h-9 text-xs"
            />
          </div>

          <div className="min-w-[18rem] flex-1">
            <label className="label text-xs" htmlFor="add-faculty-select">
              Select faculty member ({filteredFaculty.length})
            </label>
            <select
              id="add-faculty-select"
              name="id"
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              required
              className="input h-9 text-xs"
            >
              <option value="">-- Choose faculty member --</option>
              {filteredFaculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fullName} ({f.departmentCode ? f.departmentCode : "Unassigned"})
                </option>
              ))}
            </select>
          </div>

          <div className="w-48">
            <label className="label text-xs" htmlFor="add-dept-select">
              Target department
            </label>
            <select
              id="add-dept-select"
              name="departmentId"
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
              className="input h-9 text-xs"
            >
              <option value="">No department (Unassign)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={!selectedFacultyId || isPending}
            className="btn btn-primary h-9 px-4 text-xs font-semibold"
          >
            {isPending ? "Assigning…" : "Assign to Department"}
          </button>
        </div>

        {state ? <ResultMessage state={state} /> : null}
      </form>
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
