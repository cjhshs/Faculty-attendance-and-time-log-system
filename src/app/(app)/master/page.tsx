import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import { SearchForm } from "../SearchForm";
import {
  assignCourseCollege,
  assignFacultyDepartmentBulk,
  autoAssignFacultyDepartments,
  createFaculty,
  createCourse,
  createRoom,
  deleteRoom,
  deleteCourse,
  toggleFaculty,
  updateFacultyDepartment,
} from "./actions";
import { FacultyDepartmentForm } from "./FacultyDepartmentForm";
import { BulkDepartmentForm } from "./BulkDepartmentForm";
import { findDuplicateFacultyRows } from "@/lib/faculty-department";
import { planAutoDepartmentAssignments } from "@/lib/faculty-auto-department";

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ fq?: string; cq?: string; rq?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.FACULTY_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.FACULTY_MANAGE);
  const params = await searchParams;
  const fq = (params.fq ?? "").trim();
  const cq = (params.cq ?? "").trim();
  const rq = (params.rq ?? "").trim();

  const [faculty, courses, rooms, colleges, roster] = await Promise.all([
    prisma.faculty.findMany({
      where: fq ? { fullName: { contains: fq, mode: "insensitive" } } : undefined,
      include: { department: { select: { code: true, name: true } } },
      orderBy: [{ surname: "asc" }, { fullName: "asc" }],
    }),
    prisma.course.findMany({
      where: cq
        ? {
            OR: [
              { code: { contains: cq, mode: "insensitive" } },
              { name: { contains: cq, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { college: { select: { code: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.room.findMany({
      where: rq ? { code: { contains: rq, mode: "insensitive" } } : undefined,
      orderBy: { code: "asc" },
    }),
    prisma.college.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { courses: true } } },
    }),
    // Full roster for bulk assignment and duplicate review. Kept separate from
    // the search-filtered table so a search never hides an unassigned person.
    prisma.faculty.findMany({
      select: {
        id: true,
        fullName: true,
        departmentId: true,
        department: { select: { code: true, name: true } },
      },
      orderBy: [{ surname: "asc" }, { fullName: "asc" }],
    }),
  ]);

  const needsReview = courses.filter((c) => c.collegeId == null || !c.official);
  const unassignedRoster = roster.filter((f) => f.departmentId == null);
  const facultyNeedsDepartment = faculty.filter((f) => f.departmentId == null);
  const duplicates = findDuplicateFacultyRows(
    roster.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      departmentCode: f.department?.code ?? null,
    })),
  );

  // Evidence for automatic assignment is read fresh on every request. A
  // suggestion is only made when every scheduled class maps to one college.
  const unassignedIds = unassignedRoster.map((f) => f.id);
  const scheduleColleges = unassignedIds.length
    ? await prisma.scheduleSlot.findMany({
        where: { facultyId: { in: unassignedIds } },
        select: {
          facultyId: true,
          course: {
            select: {
              college: { select: { id: true, code: true, name: true } },
            },
          },
        },
      })
    : [];
  const collegesByFaculty = new Map<
    number,
    ({ id: number; code: string; name: string } | null)[]
  >();
  for (const slot of scheduleColleges) {
    if (slot.facultyId == null) continue;
    const list = collegesByFaculty.get(slot.facultyId) ?? [];
    list.push(slot.course.college);
    collegesByFaculty.set(slot.facultyId, list);
  }
  const autoDepartmentPlan = planAutoDepartmentAssignments(
    unassignedRoster.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      departmentId: f.departmentId,
      colleges: collegesByFaculty.get(f.id) ?? [],
    })),
  );
  const autoSuggestionGroups = Array.from(
    autoDepartmentPlan.suggestions.reduce((groups, suggestion) => {
      const list = groups.get(suggestion.collegeCode) ?? [];
      list.push(suggestion);
      groups.set(suggestion.collegeCode, list);
      return groups;
    }, new Map<string, typeof autoDepartmentPlan.suggestions>()),
  );

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="page-title">Master Data</h1>
        <p className="page-subtitle">Manage faculty, programs, rooms, and departments.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card min-w-0 space-y-4 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title">Faculty ({faculty.length})</h2>
          </div>
          <p className="text-xs text-muted">
            A faculty member&apos;s department is the only source of attendance membership. Teaching
            a subject for another program does not change it.
          </p>
          {facultyNeedsDepartment.length > 0 ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              {facultyNeedsDepartment.length} faculty member
              {facultyNeedsDepartment.length === 1 ? "" : "s"} still need a department. They are
              excluded from every department sheet until assigned, and appear under &ldquo;Faculty
              without a department&rdquo; for review.
            </p>
          ) : null}
          <p className="mb-3 text-xs text-muted">
            {roster.length - unassignedRoster.length} assigned · {unassignedRoster.length} without a
            department · {roster.length} registered in total.
          </p>

          {duplicates.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">
                {duplicates.length} possible duplicate roster name
                {duplicates.length === 1 ? "" : "s"} detected.
              </p>
              <p className="mt-1">
                Nothing was merged or reassigned. Two people can genuinely share a name, so review
                these rows before changing a department:
              </p>
              <ul className="mt-1 list-disc pl-4">
                {duplicates.slice(0, 10).map((d) => (
                  <li key={d.key}>
                    {d.fullName} — {d.ids.length} rows (IDs {d.ids.join(", ")})
                    {d.departmentCodes.every((code) => !code)
                      ? " · none has a department"
                      : ""}
                  </li>
                ))}
              </ul>
              {duplicates.length > 10 ? (
                <p className="mt-1">…and {duplicates.length - 10} more.</p>
              ) : null}
            </div>
          ) : null}

          {canManage && unassignedRoster.length > 0 ? (
            <div className="space-y-4">
              <h3 className="mb-2 text-sm font-semibold">Bulk department assignment</h3>
              <BulkDepartmentForm
                action={assignFacultyDepartmentBulk}
                faculty={roster.map((f) => ({
                  id: f.id,
                  fullName: f.fullName,
                  departmentCode: f.department?.code ?? null,
                  departmentName: f.department?.name ?? null,
                }))}
                departments={colleges.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
                unassignedCount={unassignedRoster.length}
              />

              <div className="rounded-lg border border-line bg-slate-50 p-3">
                <h4 className="text-sm font-semibold text-navy">
                  Automatic assignment from schedules
                </h4>
                <p className="mt-1 text-xs text-muted">
                  A faculty member is assigned only when every scheduled class maps to exactly one
                  college and no class has an unmapped program. Manual departments are never
                  overwritten. Mixed or missing evidence stays in the review list.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>
                    <strong className="text-green-700">
                      {autoDepartmentPlan.suggestions.length}
                    </strong>{" "}
                    can be assigned safely
                  </span>
                  <span>
                    <strong>{autoDepartmentPlan.unresolved.length}</strong> need review
                  </span>
                  <span>
                    <strong>{unassignedRoster.length}</strong> currently unassigned
                  </span>
                </div>

                {autoSuggestionGroups.length > 0 ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-medium text-navy">
                      Review the {autoDepartmentPlan.suggestions.length} suggestion
                      {autoDepartmentPlan.suggestions.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {autoSuggestionGroups.map(([code, suggestions]) => (
                        <li key={code}>
                          <strong>{code}</strong> — {suggestions.length}:{" "}
                          {suggestions
                            .slice(0, 12)
                            .map((s) => s.fullName)
                            .join(", ")}
                          {suggestions.length > 12 ? ` …and ${suggestions.length - 12} more` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    No faculty member has an unambiguous, fully mapped schedule yet. Import a
                    schedule and assign each program&apos;s college first.
                  </p>
                )}

                {autoDepartmentPlan.unresolved.length > 0 ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-medium text-amber-800">
                      Why {autoDepartmentPlan.unresolved.length} cannot be assigned automatically
                    </summary>
                    <ul className="mt-2 space-y-1 text-amber-900">
                      {autoDepartmentPlan.unresolved.slice(0, 30).map((row) => (
                        <li key={row.facultyId}>
                          <strong>{row.fullName}</strong> — {row.detail}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {autoDepartmentPlan.suggestions.length > 0 ? (
                  <ActionForm
                    action={autoAssignFacultyDepartments}
                    submitLabel={`Auto-assign ${autoDepartmentPlan.suggestions.length} faculty`}
                  >
                    <p className="text-xs text-muted">
                      Writes only the {autoDepartmentPlan.suggestions.length} safe suggestion
                      {autoDepartmentPlan.suggestions.length === 1 ? "" : "s"}. Every change is
                      audited.
                    </p>
                  </ActionForm>
                ) : null}
              </div>
            </div>
          ) : null}

          <SearchForm
            action="/master"
            name="fq"
            defaultValue={fq}
            placeholder="Search faculty name..."
            hidden={{ cq, rq }}
          />
          {canManage ? (
            <ActionForm action={createFaculty} submitLabel="Add faculty" resetOnSuccess>
              <label className="label req" htmlFor="faculty-name">
                Full name (Surname, Given Middle)
              </label>
              <input
                id="faculty-name"
                name="fullName"
                className="input"
                placeholder="Dela Cruz, Juan P."
                required
              />
              <label className="label mt-2" htmlFor="faculty-department">
                Department (optional)
              </label>
              <select
                id="faculty-department"
                name="departmentId"
                className="input"
                defaultValue=""
              >
                <option value="">No department yet</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </ActionForm>
          ) : null}
          <div className="mt-4 max-h-96 overflow-auto">
            <table className="data-table min-w-[20rem]">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                </tr>
              </thead>
              <tbody>
                {faculty.map((f) => (
                  <tr key={f.id} className={f.active ? "" : "text-muted"}>
                    <td>{f.fullName}</td>
                    <td className="whitespace-nowrap text-xs">
                      {canManage ? (
                        <FacultyDepartmentForm
                          action={updateFacultyDepartment}
                          facultyId={f.id}
                          departmentId={f.departmentId}
                          departments={colleges.map((c) => ({
                            id: c.id,
                            code: c.code,
                            name: c.name,
                          }))}
                        />
                      ) : f.department ? (
                        `${f.department.code} — ${f.department.name}`
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">No department</span>
                      )}
                    </td>
                    <td>{f.active ? "Active" : "Inactive"}</td>
                    {canManage ? (
                      <td className="whitespace-nowrap">
                        <ActionButton
                          action={toggleFaculty}
                          label={f.active ? "Deactivate" : "Activate"}
                          fields={{ id: f.id }}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
                {faculty.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="text-center text-muted">
                      {fq ? "No faculty match your search." : "No faculty yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <section className="card min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Programs ({courses.length})</h2>
            </div>
            <SearchForm
              action="/master"
              name="cq"
              defaultValue={cq}
              placeholder="Search program code or name..."
              hidden={{ fq, rq }}
            />
            {canManage ? (
              <ActionForm action={createCourse} submitLabel="Add program" resetOnSuccess>
                <label className="label req" htmlFor="course-code">
                  Program code
                </label>
                <input id="course-code" name="code" className="input" placeholder="BSIT" required />
                <label className="label mt-2" htmlFor="course-name">
                  Name (optional)
                </label>
                <input id="course-name" name="name" className="input" placeholder="BS Information Technology" />
                <label className="label mt-2" htmlFor="course-college">
                  College
                </label>
                <select id="course-college" name="collegeId" className="input" defaultValue="">
                  <option value="">Unassigned</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </ActionForm>
            ) : null}
            <div className="mt-4 max-h-96 overflow-auto">
              <table className="data-table min-w-[34rem]">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Name</th>
                    <th scope="col">College</th>
                    {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium">{c.code}</td>
                      <td>{c.name}</td>
                      <td className="whitespace-nowrap text-xs">
                        {c.college ? `${c.college.code} — ${c.college.name}` : (
                          <span className="badge bg-amber-100 text-amber-800">Unassigned</span>
                        )}
                      </td>
                      {canManage ? (
                        <td className="whitespace-nowrap">
                          <ActionButton
                            action={deleteCourse}
                            label="Delete"
                            variant="danger"
                            fields={{ id: c.id }}
                            confirm={`Delete program ${c.code}? This cannot be undone.`}
                            title={`Delete program ${c.code}`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {courses.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 4 : 3} className="text-center text-muted">
                        {cq ? "No programs match your search." : "No programs yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card min-w-0 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Rooms ({rooms.length})</h2>
            </div>
            <SearchForm
              action="/master"
              name="rq"
              defaultValue={rq}
              placeholder="Search room code..."
              hidden={{ fq, cq }}
              className="mb-3 mt-1"
            />
            {canManage ? (
              <ActionForm action={createRoom} submitLabel="Add room" resetOnSuccess>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label req" htmlFor="room-code">
                      Room code
                    </label>
                    <input id="room-code" name="code" className="input" placeholder="EMM302" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="room-type">
                      Type
                    </label>
                    <select id="room-type" name="type" className="input" defaultValue="PHYSICAL">
                      <option value="PHYSICAL">Physical</option>
                      <option value="ONLINE">Online</option>
                      <option value="TBA">TBA</option>
                    </select>
                  </div>
                </div>
              </ActionForm>
            ) : null}
            <div className="mt-4 max-h-96 overflow-auto">
              <table className="data-table min-w-[20rem]">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Type</th>
                    {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.code}</td>
                      <td>{r.type}</td>
                      {canManage ? (
                        <td>
                          <ActionButton
                            action={deleteRoom}
                            label="Delete"
                            variant="danger"
                            fields={{ id: r.id }}
                            confirm={`Delete room ${r.code}?`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {rooms.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 3 : 2} className="text-center text-muted">
                        {rq ? "No rooms match your search." : "No rooms yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0">
          <h2 className="section-title">Colleges ({colleges.length})</h2>
          <p className="mt-1 text-xs text-muted">
            The official department structure. Programs are assigned to a college and travel with
            their schedules, attendance and reports.
          </p>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="data-table min-w-[28rem]">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">College</th>
                  <th scope="col">Programs</th>
                </tr>
              </thead>
              <tbody>
                {colleges.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.code}</td>
                    <td>{c.name}</td>
                    <td className="text-center">{c._count.courses}</td>
                  </tr>
                ))}
                {colleges.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-muted">
                      No colleges yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card min-w-0 space-y-3">
          <div>
            <h2 className="section-title">
              Programs needing review ({needsReview.length})
            </h2>
            <p className="mt-1 text-xs text-muted">
              Course codes that are new (not in the official catalog) or unassigned stay importable
              and filterable under &quot;Unassigned programs&quot; until someone chooses a college
              here. Nothing is deleted or hidden.
            </p>
          </div>
          {needsReview.length === 0 ? (
            <p className="text-sm text-muted">Every program has a confirmed college.</p>
          ) : canManage ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {needsReview.map((c) => (
                <div key={c.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{c.code}</span>
                    <span className="text-[11px] text-muted">
                      {c.official ? "" : "Not in official list"}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{c.name ?? "No name on file"}</p>
                  <ActionForm action={assignCourseCollege} submitLabel="Assign">
                    <input type="hidden" name="id" value={c.id} />
                    <select
                      name="collegeId"
                      className="input mt-2"
                      defaultValue={c.collegeId ?? ""}
                    >
                      <option value="">Unassigned</option>
                      {colleges.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.code} — {col.name}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-1 text-sm">
              {needsReview.map((c) => (
                <li key={c.id}>
                  <strong>{c.code}</strong> — {c.name ?? "no name"} (Unassigned)
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
