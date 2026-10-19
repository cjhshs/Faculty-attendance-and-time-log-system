import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCourses } from "@/lib/data";
import { WEEKDAY_NAMES, formatTime12 } from "@/lib/dates";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; day?: string }>;
}) {
  await requirePermission(PERMISSIONS.FACULTY_VIEW);
  const params = await searchParams;
  const courses = await getCourses();

  const where: Record<string, unknown> = {};
  if (params.program) where.course = { code: params.program };
  if (params.day !== undefined && params.day !== "") where.weekday = Number(params.day);

  const slots = await prisma.scheduleSlot.findMany({
    where,
    include: { faculty: true, room: true, course: true },
    orderBy: [{ course: { code: "asc" } }, { weekday: "asc" }, { startTime: "asc" }],
    take: 2000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Schedule</h1>
        <span className="text-sm text-zinc-500">{slots.length} slot(s)</span>
      </div>

      <form className="card flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="label" htmlFor="program">
            Program
          </label>
          <select id="program" name="program" defaultValue={params.program ?? ""} className="input">
            <option value="">All programs</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="day">
            Day
          </label>
          <select id="day" name="day" defaultValue={params.day ?? ""} className="input">
            <option value="">All days</option>
            {WEEKDAY_NAMES.map((name, index) => (
              <option key={index} value={index}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>

      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Program</th>
              <th>CN</th>
              <th>Subject</th>
              <th>Section</th>
              <th>Day</th>
              <th>Time</th>
              <th>Room</th>
              <th>Mode</th>
              <th>Faculty</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.course.code}</td>
                <td className="font-mono text-xs">{s.cn}</td>
                <td>{s.subject}</td>
                <td>{s.section}</td>
                <td>{WEEKDAY_NAMES[s.weekday]}</td>
                <td className="whitespace-nowrap">
                  {formatTime12(s.startTime)}–{formatTime12(s.endTime)}
                </td>
                <td>{s.room.code}</td>
                <td>{s.mode}</td>
                <td>{s.faculty?.fullName ?? <span className="text-zinc-400">TBA / unassigned</span>}</td>
              </tr>
            ))}
            {slots.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-zinc-400">
                  No schedule slots. Import a schedule first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
