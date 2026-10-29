"use client";

import { useActionState } from "react";
import type { ActionResult } from "./actions";

// Compact per-row department assignment. Department membership comes from this
// roster field only; it is never inferred from the programs a faculty member
// teaches.
export function FacultyDepartmentForm({
  action,
  facultyId,
  departmentId,
  departments,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  facultyId: number;
  departmentId: number | null;
  departments: { id: number; code: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={facultyId} />
      <select
        name="departmentId"
        defaultValue={departmentId ? String(departmentId) : ""}
        className="input h-8 w-40 px-1 py-0.5 text-xs"
        aria-label="Faculty department"
      >
        <option value="">No department</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.code} — {d.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-sm h-8 px-2" disabled={pending}>
        {pending ? "…" : "Set"}
      </button>
      {state ? (
        <span
          role="status"
          className={
            "text-xs " + (state.ok ? "text-green-700" : "text-red-700")
          }
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
