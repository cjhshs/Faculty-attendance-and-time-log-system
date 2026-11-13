import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "../ActionForm";
import { SearchForm } from "../SearchForm";
import {
  initializeCetRoster,
  removeFacultyDepartment,
  updateFacultyDepartment,
} from "../master/actions";
import { AddFacultyToDepartmentForm, DepartmentMembershipForm } from "./DepartmentMembershipForm";
import { findDuplicateFacultyRows } from "@/lib/faculty-department";
import { INITIAL_CET_ROSTER, planRosterMembership } from "@/lib/faculty-membership";

type View = "all" | "unassigned" | string;

function viewHref(view: View, query: string): string {
  const params = new URLSearchParams();
  if (view !== "all") params.set("dept", view);
  if (query) params.set("q", query);
  const value = params.toString();
  return value ? `/departments?${value}` : "/departments";
}

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; q?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.FACULTY_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.FACULTY_MANAGE);
  const params = await searchParams;
  const requestedView = (params.dept ?? "all").trim() || "all";
  const query = (params.q ?? "").trim();

  const [colleges, faculty, slotRows] = await Promise.all([
    prisma.college.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.faculty.findMany({
      include: {
        department: { select: { code: true, name: true } },
      },
      orderBy: [{ surname: "asc" }, { fullName: "asc" }],
    }),
    // One row per schedule slot with its attendance count. This stays bounded
    // by the number of meetings instead of growing with every date encoded.
    prisma.scheduleSlot.findMany({
      select: { facultyId: true, _count: { select: { attendance: true } } },
    }),
  ]);

  const slotsByFaculty = new Map<number, number>();
  const attendanceByFaculty = new Map<number, number>();
  for (const row of slotRows) {
    const facultyId = row.facultyId;
    if (facultyId == null) continue;
    slotsByFaculty.set(facultyId, (slotsByFaculty.get(facultyId) ?? 0) + 1);
    attendanceByFaculty.set(
      facultyId,
      (attendanceByFaculty.get(facultyId) ?? 0) + row._count.attendance,
    );
  }

  const roster = faculty.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    departmentId: row.departmentId,
    departmentCode: row.department?.code ?? null,
    departmentName: row.department?.name ?? null,
    scheduleSlots: slotsByFaculty.get(row.id) ?? 0,
    attendanceRecords: attendanceByFaculty.get(row.id) ?? 0,
  }));

  const cetCount = roster.filter((row) => row.departmentCode === "CET").length;
  const unassignedCount = roster.filter((row) => row.departmentId == null).length;
  const totalSlots = roster.reduce((sum, row) => sum + row.scheduleSlots, 0);
  const totalAttendance = roster.reduce((sum, row) => sum + row.attendanceRecords, 0);

  const knownCodes = new Set(colleges.map((college) => college.code.toUpperCase()));
  const view: View =
    requestedView === "unassigned"
      ? "unassigned"
      : requestedView === "all" || requestedView === ""
        ? "all"
        : knownCodes.has(requestedView.toUpperCase())
          ? requestedView.toUpperCase()
          : "all";

  const q = query.toLowerCase();
  const visible = roster.filter((row) => {
    if (q && !row.fullName.toLowerCase().includes(q)) return false;
    if (view === "all") return true;
    if (view === "unassigned") return row.departmentId == null;
    return row.departmentCode?.toUpperCase() === view;
  });

  const duplicates = findDuplicateFacultyRows(roster);
  const cetPlan = planRosterMembership(
    INITIAL_CET_ROSTER,
    roster.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
    })),
    "CET",
  );

  const tabs: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All faculty", count: roster.length },
    { key: "unassigned", label: "Unassigned", count: unassignedCount },
    ...colleges.map((college) => ({
      key: college.code,
      label: college.code,
      count: roster.filter((row) => row.departmentCode === college.code).length,
    })),
  ];

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="page-title">Departments</h1>
        <p className="page-subtitle">
          Department membership is a roster fact, never inferred from the subjects a faculty member
          teaches or from the students&apos; programs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Registered faculty" value={roster.length} />
        <Stat label="CET members" value={cetCount} tone="green" />
        <Stat label="Unassigned" value={unassignedCount} tone={unassignedCount ? "amber" : undefined} />
        <Stat label="Historical records" value={totalSlots + totalAttendance} hint="schedule + attendance" />
      </div>

      <div className="rounded-lg border border-line bg-slate-50 px-4 py-3 text-xs text-muted">
        <p>
          <strong className="text-navy">Changes affect future imports immediately.</strong> Existing
          schedule slots and attendance keep their faculty link and are never deleted when a
          department is removed. To refresh already-imported faculty links after a membership change,
          re-import the workbook on{" "}
          <a href="/schedule/import" className="underline">
            Import Schedule
          </a>{" "}
          with <strong>Reprocess existing slots only</strong> checked.
        </p>
        <p className="mt-1">
          {totalSlots} schedule slot(s) and {totalAttendance} attendance record(s) are attached to
          the current roster. These counts are preserved by every membership change on this page.
        </p>
      </div>

      {!canManage ? (
        <div className="alert alert-info">
          You can view department membership. Only an authorized administrator with the
          <strong> faculty.manage </strong>
          permission can add, change or remove membership.
        </div>
      ) : null}

      <section className="card space-y-3">
        <div>
          <h2 className="section-title">Initial CET roster</h2>
          <p className="mt-1 text-xs text-muted">
            The starting roster is an explicit list of CET members that were already confirmed. It
            never uses BSIT/CET subjects, NSTP or GE assignments, and it never assigns the{" "}
            {unassignedCount} unassigned faculty automatically. Add further confirmed names below or
            through the per-faculty editor; unknown and duplicate names are left for manual review.
          </p>
        </div>

        {INITIAL_CET_ROSTER.length === 0 ? (
          <p className="text-sm text-muted">
            No initial CET candidates are documented. Use the editor below to assign confirmed
            members.
          </p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="data-table min-w-[34rem]">
              <thead>
                <tr>
                  <th scope="col">Confirmed candidate</th>
                  <th scope="col">Status</th>
                  <th scope="col">Roster match</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {cetPlan.rows.map((row) => (
                  <tr key={row.candidate}>
                    <td className="font-medium">{row.candidate}</td>
                    <td>
                      {row.status === "already" ? (
                        <span className="badge bg-green-100 text-green-800">CET</span>
                      ) : row.status === "assign" ? (
                        <span className="badge bg-blue-100 text-blue-800">Ready to assign</span>
                      ) : row.status === "ambiguous" ? (
                        <span className="badge bg-red-100 text-red-800">Duplicate name</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">Not in roster</span>
                      )}
                    </td>
                    <td className="text-xs">
                      {row.matches.length === 0
                        ? "No exact roster row"
                        : row.matches
                            .map(
                              (match) =>
                                `${match.fullName} (#${match.id}, ${
                                  match.departmentCode ?? "no department"
                                })`,
                            )
                            .join("; ")}
                    </td>
                    <td className="text-xs text-muted">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cetPlan.missing.length > 0 || cetPlan.ambiguous.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {cetPlan.missing.length > 0 ? (
              <p>
                {cetPlan.missing.length} candidate(s) are not in the roster and were not created:{" "}
                {cetPlan.missing.map((row) => row.candidate).join(", ")}.
              </p>
            ) : null}
            {cetPlan.ambiguous.length > 0 ? (
              <p>
                {cetPlan.ambiguous.length} candidate(s) match more than one faculty row and need a
                human choice: {cetPlan.ambiguous.map((row) => row.candidate).join(", ")}.
              </p>
            ) : null}
          </div>
        ) : null}

        {canManage && cetPlan.toAssign.length > 0 ? (
          <ActionForm
            action={initializeCetRoster}
            submitLabel={`Initialize CET roster (${cetPlan.toAssign.length} to assign)`}
          >
            <p className="text-xs text-muted">
              Assigns only the {cetPlan.toAssign.length} confirmed candidate
              {cetPlan.toAssign.length === 1 ? "" : "s"} above. No other faculty member is touched,
              and the action is audited.
            </p>
          </ActionForm>
        ) : null}
      </section>

      {duplicates.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">
            {duplicates.length} possible duplicate roster name
            {duplicates.length === 1 ? "" : "s"} detected.
          </p>
          <p className="mt-1">
            Names are never merged automatically. If an import contains an ambiguous name, choose the
            correct faculty member in the import preview; otherwise it stays unlinked for review.
          </p>
          <ul className="mt-1 list-disc pl-4">
            {duplicates.slice(0, 10).map((duplicate) => (
              <li key={duplicate.key}>
                {duplicate.fullName} — {duplicate.ids.length} rows (IDs {duplicate.ids.join(", ")})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        <AddFacultyToDepartmentForm
          assignAction={updateFacultyDepartment}
          facultyList={roster.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            departmentCode: r.departmentCode,
          }))}
          departments={colleges.map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
          }))}
          defaultDepartmentId={
            view !== "all" && view !== "unassigned"
              ? colleges.find((c) => c.code === view)?.id ?? null
              : colleges.find((c) => c.code === "CET")?.id ?? null
          }
        />
      ) : null}

      <section className="card min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">Faculty membership</h2>
            <p className="mt-1 text-xs text-muted">
              {view === "all"
                ? `Showing all ${roster.length} registered faculty.`
                : view === "unassigned"
                  ? `${unassignedCount} faculty member${unassignedCount === 1 ? "" : "s"} without a department. They are excluded from every department sheet until assigned.`
                  : `Showing ${visible.length} faculty member${visible.length === 1 ? "" : "s"} in ${view}.`}
            </p>
          </div>
          <a href="/master" className="btn btn-sm">
            Add faculty on Master Data
          </a>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={viewHref(tab.key, query)}
              className={
                "badge border px-2.5 py-1 " +
                (view === tab.key
                  ? "border-navy bg-navy text-white"
                  : "border-line bg-white text-navy")
              }
            >
              {tab.label} ({tab.count})
            </a>
          ))}
        </div>

        <SearchForm
          action="/departments"
          name="q"
          defaultValue={query}
          placeholder="Search faculty name..."
          hidden={{ dept: view === "all" ? undefined : view }}
        />

        <div className="max-h-[32rem] overflow-auto">
          <table className="data-table min-w-[52rem]">
            <thead>
              <tr>
                <th scope="col">Faculty</th>
                <th scope="col">Department</th>
                <th scope="col">Membership</th>
                <th scope="col" className="text-center">
                  Slots
                </th>
                <th scope="col" className="text-center">
                  Attendance
                </th>
                {canManage ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.fullName}</td>
                  <td className="whitespace-nowrap text-xs">
                    {row.departmentCode ? (
                      `${row.departmentCode} — ${row.departmentName}`
                    ) : (
                      <span className="badge bg-amber-100 text-amber-800">No department</span>
                    )}
                  </td>
                  <td>
                    {row.departmentId == null ? (
                      <span className="badge bg-amber-100 text-amber-800">Unassigned</span>
                    ) : (
                      <span className="badge bg-green-100 text-green-800">
                        Member of {row.departmentCode}
                      </span>
                    )}
                  </td>
                  <td className="text-center text-xs">{row.scheduleSlots}</td>
                  <td className="text-center text-xs">{row.attendanceRecords}</td>
                  {canManage ? (
                    <td>
                      <DepartmentMembershipForm
                        assignAction={updateFacultyDepartment}
                        removeAction={removeFacultyDepartment}
                        facultyId={row.id}
                        fullName={row.fullName}
                        departmentId={row.departmentId}
                        departmentCode={row.departmentCode}
                        departments={colleges.map((college) => ({
                          id: college.id,
                          code: college.code,
                          name: college.name,
                        }))}
                        scheduleSlots={row.scheduleSlots}
                        attendanceRecords={row.attendanceRecords}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="text-center text-muted">
                    No faculty match this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Departments</h2>
        <p className="mt-1 text-xs text-muted">
          The official department structure. A department is assigned through the faculty roster on
          this page, never through a program or a subject.
        </p>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="data-table min-w-[28rem]">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Department</th>
                <th scope="col" className="text-center">
                  Faculty
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {colleges.map((college) => (
                <tr key={college.id}>
                  <td className="font-medium">{college.code}</td>
                  <td>{college.name}</td>
                  <td className="text-center">
                    {roster.filter((row) => row.departmentCode === college.code).length}
                  </td>
                  <td>
                    <a href={viewHref(college.code, query)} className="text-xs underline">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "green" | "amber";
}) {
  const toneClass =
    tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-navy";
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
