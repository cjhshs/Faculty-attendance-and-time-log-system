import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import { SearchForm } from "../SearchForm";
import {
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

  const [faculty, courses, rooms] = await Promise.all([
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
      orderBy: { code: "asc" },
    }),
    prisma.room.findMany({
      where: rq ? { code: { contains: rq, mode: "insensitive" } } : undefined,
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Master Data</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
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
            <table className="data-table">
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

        <section className="card">
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
            </ActionForm>
          ) : null}
          <div className="mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  {canManage ? <th scope="col" aria-label="Actions"></th> : null}
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.code}</td>
                    <td>{c.name}</td>
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
                    <td colSpan={canManage ? 3 : 2} className="text-center text-muted">
                      {cq ? "No programs match your search." : "No programs yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
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
            <table className="data-table">
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
  );
}
