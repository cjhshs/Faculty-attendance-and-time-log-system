import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import { SearchForm } from "../SearchForm";
import { ScrollArea } from "../ScrollArea";
import { SortableTable } from "../SortableTable";
import {
  createFaculty,
  createCourse,
  createRoom,
  deleteRoom,
  deleteCourse,
  deleteFaculty,
  toggleFaculty,
  updateFacultyName,
} from "./actions";
import { findDuplicateFacultyRows } from "@/lib/faculty-department";

type TabId = "faculty" | "programs" | "rooms";

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ fq?: string; cq?: string; rq?: string; tab?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.FACULTY_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.FACULTY_MANAGE);
  const params = await searchParams;
  const fq = (params.fq ?? "").trim();
  const cq = (params.cq ?? "").trim();
  const rq = (params.rq ?? "").trim();
  // The active section is a URL parameter so a search inside a tab keeps the
  // user on that tab after the page reloads (F6).
  const tab: TabId = params.tab === "programs" || params.tab === "rooms" ? params.tab : "faculty";

  const [faculty, courses, rooms, roster] = await Promise.all([
    prisma.faculty.findMany({
      where: fq ? { fullName: { contains: fq, mode: "insensitive" } } : undefined,
      include: {
        department: { select: { code: true, name: true } },
        _count: { select: { slots: true, customSelections: true, sheetCustomFaculty: true } },
      },
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

  const duplicates = findDuplicateFacultyRows(
    roster.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      departmentCode: f.department?.code ?? null,
    })),
  );

  function tabHref(next: TabId) {
    const sp = new URLSearchParams();
    if (fq) sp.set("fq", fq);
    if (cq) sp.set("cq", cq);
    if (rq) sp.set("rq", rq);
    sp.set("tab", next);
    return `/master?${sp.toString()}`;
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "faculty", label: "Faculty", count: faculty.length },
    { id: "programs", label: "Programs", count: courses.length },
    { id: "rooms", label: "Rooms", count: rooms.length },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="page-title">Master Data</h1>
        <p className="page-subtitle">
          Manage CET faculty, programs, and rooms for the College of Engineering and Technology.
        </p>
      </div>

      {/* Section switcher. This changes which view is shown (a navigation
          choice), so it uses links with aria-current rather than the ARIA
          tablist pattern, which is not meant for page navigation. */}
      <nav
        aria-label="Master data sections"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={tabHref(t.id)}
              aria-current={active ? "page" : undefined}
              className={
                "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors " +
                (active
                  ? "border-navy font-semibold text-navy"
                  : "border-transparent text-muted hover:text-ink")
              }
            >
              {t.label}
              <span className="badge badge-neutral">{t.count}</span>
            </Link>
          );
        })}
      </nav>

      {tab === "faculty" ? (
        <section className="card min-w-0 space-y-4">
          <h2 className="section-title">CET Faculty ({faculty.length})</h2>
          <p className="text-xs text-muted">
            All registered faculty belong to the College of Engineering and Technology (CET).
            Teaching minor or cross-cutting subjects does not alter department assignment.
          </p>

          {duplicates.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">
                {duplicates.length} possible duplicate roster name
                {duplicates.length === 1 ? "" : "s"} detected.
              </p>
              <ul className="mt-1 list-disc pl-4">
                {duplicates.slice(0, 10).map((d) => (
                  <li key={d.key}>
                    {d.fullName} — {d.ids.length} rows (IDs {d.ids.join(", ")})
                  </li>
                ))}
              </ul>
              {duplicates.length > 10 ? (
                <p className="mt-1">…and {duplicates.length - 10} more.</p>
              ) : null}
            </div>
          ) : null}

          <SearchForm
            action="/master"
            name="fq"
            defaultValue={fq}
            placeholder="Search faculty name..."
            hidden={{ cq, rq, tab }}
          />
          {canManage ? (
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-navy">
                Add faculty
              </summary>
              <div className="border-t border-line p-3">
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
                  <p className="mt-1 text-xs text-muted">
                    New faculty members are automatically registered under CET.
                  </p>
                </ActionForm>
              </div>
            </details>
          ) : null}

          <ScrollArea className="rounded-lg border border-line" label="Faculty list">
            <SortableTable className="data-table min-w-[20rem]" label="Faculty">
              <caption className="visually-hidden">Faculty</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button">Name</button>
                  </th>
                  <th scope="col">
                    <button type="button">Department</button>
                  </th>
                  <th scope="col">
                    <button type="button">Status</button>
                  </th>
                  {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                </tr>
              </thead>
              <tbody>
                {faculty.map((f) => {
                  const refCount =
                    f._count.slots + f._count.customSelections + f._count.sheetCustomFaculty;
                  const deleteConfirm =
                    refCount > 0
                      ? `${f.fullName} is referenced by schedule or attendance history. They will be deactivated (not deleted) so all historical records are preserved. Continue?`
                      : `Delete ${f.fullName}? They have no schedule or attendance records. This cannot be undone.`;
                  return (
                    <tr key={f.id} className={f.active ? "" : "text-muted"}>
                      <td>{f.fullName}</td>
                      <td className="whitespace-nowrap text-xs font-medium text-navy">
                        {f.department?.code ?? "Unassigned"}
                      </td>
                      <td>{f.active ? "Active" : "Inactive"}</td>
                      {canManage ? (
                        <td className="whitespace-nowrap align-top">
                          <div className="flex flex-wrap items-center gap-1">
                            <ActionButton
                              action={toggleFaculty}
                              label={f.active ? "Deactivate" : "Activate"}
                              fields={{ id: f.id }}
                              confirm={
                                f.active
                                  ? `Deactivate ${f.fullName}? They stay in the roster and all history is preserved.`
                                  : `Reactivate ${f.fullName}?`
                              }
                            />
                            <details className="inline-block align-middle">
                              <summary className="btn btn-sm cursor-pointer list-none">
                                Rename
                              </summary>
                              <div className="mt-1">
                                <ActionForm
                                  action={updateFacultyName}
                                  submitLabel="Save name"
                                  className="flex flex-wrap items-center gap-1"
                                >
                                  <input type="hidden" name="id" value={f.id} />
                                  <input
                                    name="fullName"
                                    defaultValue={f.fullName}
                                    className="input h-8 w-56"
                                    aria-label={`New name for ${f.fullName}`}
                                    required
                                  />
                                </ActionForm>
                              </div>
                            </details>
                            <ActionButton
                              action={deleteFaculty}
                              label="Delete"
                              variant="danger"
                              fields={{ id: f.id }}
                              confirm={deleteConfirm}
                              title={`Delete ${f.fullName}`}
                            />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {faculty.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="text-center text-muted">
                      {fq ? "No faculty match your search." : "No faculty yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </SortableTable>
          </ScrollArea>
        </section>
      ) : null}

      {tab === "programs" ? (
        <section className="card min-w-0 space-y-4">
          <h2 className="section-title">CET Programs ({courses.length})</h2>
          <p className="text-xs text-muted">
            Academic programs under the College of Engineering and Technology.
          </p>
          <SearchForm
            action="/master"
            name="cq"
            defaultValue={cq}
            placeholder="Search program code or name..."
            hidden={{ fq, rq, tab }}
          />
          {canManage ? (
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-navy">
                Add program
              </summary>
              <div className="border-t border-line p-3">
                <ActionForm action={createCourse} submitLabel="Add program" resetOnSuccess>
                  <label className="label req" htmlFor="course-code">
                    Program code
                  </label>
                  <input id="course-code" name="code" className="input" placeholder="BSIT" required />
                  <label className="label mt-2" htmlFor="course-name">
                    Name (optional)
                  </label>
                  <input
                    id="course-name"
                    name="name"
                    className="input"
                    placeholder="Bachelor of Science in Information Technology"
                  />
                </ActionForm>
              </div>
            </details>
          ) : null}

          <ScrollArea className="rounded-lg border border-line" label="Programs list">
            <SortableTable className="data-table min-w-[34rem]" label="Programs">
              <caption className="visually-hidden">Programs</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button">Code</button>
                  </th>
                  <th scope="col">
                    <button type="button">Name</button>
                  </th>
                  <th scope="col">
                    <button type="button">Department</button>
                  </th>
                  {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium text-navy">{c.code}</td>
                    <td>{c.name}</td>
                    <td className="whitespace-nowrap text-xs">CET</td>
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
            </SortableTable>
          </ScrollArea>
        </section>
      ) : null}

      {tab === "rooms" ? (
        <section className="card min-w-0 space-y-4">
          <h2 className="section-title">Rooms ({rooms.length})</h2>
          <SearchForm
            action="/master"
            name="rq"
            defaultValue={rq}
            placeholder="Search room code..."
            hidden={{ fq, cq, tab }}
          />
          {canManage ? (
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-navy">
                Add room
              </summary>
              <div className="border-t border-line p-3">
                <ActionForm action={createRoom} submitLabel="Add room" resetOnSuccess>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label req" htmlFor="room-code">
                        Room code
                      </label>
                      <input
                        id="room-code"
                        name="code"
                        className="input"
                        placeholder="EMM302"
                        required
                      />
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
              </div>
            </details>
          ) : null}

          <ScrollArea className="rounded-lg border border-line" label="Rooms list">
            <SortableTable className="data-table min-w-[20rem]" label="Rooms">
              <caption className="visually-hidden">Rooms</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button">Code</button>
                  </th>
                  <th scope="col">
                    <button type="button">Type</button>
                  </th>
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
            </SortableTable>
          </ScrollArea>
        </section>
      ) : null}
    </div>
  );
}
