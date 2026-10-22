import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import { SearchForm } from "../SearchForm";
import {
  assignCourseCollege,
  createFaculty,
  createCourse,
  createRoom,
  deleteRoom,
  deleteCourse,
  toggleFaculty,
} from "./actions";

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

  const [faculty, courses, rooms, colleges] = await Promise.all([
    prisma.faculty.findMany({
      where: fq ? { fullName: { contains: fq, mode: "insensitive" } } : undefined,
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
  ]);

  const needsReview = courses.filter((c) => c.collegeId == null || !c.official);

  return (
    <div className="min-w-0 space-y-6">
      <h1 className="page-title">Master Data</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0 lg:self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title">Faculty ({faculty.length})</h2>
          </div>
          <SearchForm
            action="/master"
            name="fq"
            defaultValue={fq}
            placeholder="Search faculty name..."
            hidden={{ cq, rq }}
            className="mb-3"
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
            </ActionForm>
          ) : null}
          <div className="mt-4 max-h-96 overflow-auto">
            <table className="data-table min-w-[20rem]">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                </tr>
              </thead>
              <tbody>
                {faculty.map((f) => (
                  <tr key={f.id} className={f.active ? "" : "text-muted"}>
                    <td>{f.fullName}</td>
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
                    <td colSpan={canManage ? 3 : 2} className="text-center text-muted">
                      {fq ? "No faculty match your search." : "No faculty yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="min-w-0 space-y-6">
          <section className="card min-w-0 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Programs ({courses.length})</h2>
            </div>
            <SearchForm
              action="/master"
              name="cq"
              defaultValue={cq}
              placeholder="Search program code or name..."
              hidden={{ fq, rq }}
              className="mb-3 mt-1"
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

        <section className="card min-w-0">
          <h2 className="section-title">
            Programs needing review ({needsReview.length})
          </h2>
          <p className="mt-1 text-xs text-muted">
            Course codes that are new (not in the official catalog) or unassigned stay importable
            and filterable under &quot;Unassigned programs&quot; until someone chooses a college
            here. Nothing is deleted or hidden.
          </p>
          {needsReview.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Every program has a confirmed college.</p>
          ) : canManage ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
            <ul className="mt-3 space-y-1 text-sm">
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
