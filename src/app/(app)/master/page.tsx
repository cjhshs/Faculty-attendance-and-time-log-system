import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getFaculty, getCourses, getRooms } from "@/lib/data";
import { ActionForm, ActionButton } from "../ActionForm";
import { createFaculty, createCourse, createRoom, deleteRoom, toggleFaculty } from "./actions";

export default async function MasterPage() {
  const user = await requirePermission(PERMISSIONS.FACULTY_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.FACULTY_MANAGE);
  const [faculty, courses, rooms] = await Promise.all([getFaculty(), getCourses(), getRooms()]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Master Data</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <h2 className="mb-3 text-base font-semibold">Faculty ({faculty.length})</h2>
          {canManage ? (
            <ActionForm action={createFaculty} submitLabel="Add faculty" resetOnSuccess>
              <label className="label" htmlFor="faculty-name">
                Full name (Surname, Given Middle)
              </label>
              <input id="faculty-name" name="fullName" className="input" placeholder="Dela Cruz, Juan P." />
            </ActionForm>
          ) : null}
          <div className="mt-4 max-h-96 overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  {canManage ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {faculty.map((f) => (
                  <tr key={f.id} className={f.active ? "" : "text-zinc-400"}>
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
                    <td colSpan={3} className="text-center text-zinc-400">
                      No faculty yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 text-base font-semibold">Programs ({courses.length})</h2>
          {canManage ? (
            <ActionForm action={createCourse} submitLabel="Add program" resetOnSuccess>
              <label className="label" htmlFor="course-code">
                Program code
              </label>
              <input id="course-code" name="code" className="input" placeholder="BSIT" />
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
                  <th>Code</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.code}</td>
                    <td>{c.name}</td>
                  </tr>
                ))}
                {courses.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-center text-zinc-400">
                      No programs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 text-base font-semibold">Rooms ({rooms.length})</h2>
          {canManage ? (
            <ActionForm action={createRoom} submitLabel="Add room" resetOnSuccess>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="room-code">
                    Code
                  </label>
                  <input id="room-code" name="code" className="input" placeholder="EMM201" />
                </div>
                <div>
                  <label className="label" htmlFor="room-type">
                    Type
                  </label>
                  <select id="room-type" name="type" className="input" defaultValue="PHYSICAL">
                    <option value="PHYSICAL">Physical</option>
                    <option value="ONLINE">Online (OLC)</option>
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
                  <th>Code</th>
                  <th>Type</th>
                  {canManage ? <th></th> : null}
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
                    <td colSpan={3} className="text-center text-zinc-400">
                      No rooms yet.
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
