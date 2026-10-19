import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getSlotsForDateAndCourses } from "@/lib/schedule-query";
import { parseISODate, todayUtc, formatLong } from "@/lib/dates";
import { AttendanceSheets } from "../AttendanceSheets";
import { PrintButton } from "../PrintButton";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; programs?: string | string[] }>;
}) {
  await requirePermission(PERMISSIONS.ATTENDANCE_PRINT);
  const params = await searchParams;

  const date = parseISODate(params.date ?? null) ?? todayUtc();
  const isoDate = date.toISOString().slice(0, 10);

  const courses = await getCourses();
  const allCodes = courses.map((c) => c.code);

  const rawPrograms = params.programs;
  const selectedCodes =
    rawPrograms === undefined
      ? allCodes
      : (Array.isArray(rawPrograms) ? rawPrograms : [rawPrograms]).filter((c) => allCodes.includes(c));

  const selectedCourses = courses.filter((c) => selectedCodes.includes(c.code));
  const settings = await getSettings();

  const holiday = await prisma.holiday.findFirst({ where: { date } });
  const slots = holiday
    ? []
    : await getSlotsForDateAndCourses(
        date,
        selectedCourses.map((c) => c.id),
      );

  // Rooms typed in while encoding (for TBA slots) are reflected on the sheet.
  const overrides = holiday
    ? []
    : await prisma.attendance.findMany({
        where: {
          date,
          roomOverride: { not: null },
          slot: { courseId: { in: selectedCourses.map((c) => c.id) } },
        },
        select: { slotId: true, roomOverride: true },
      });
  const overrideBySlot = new Map<number, string>();
  for (const o of overrides) {
    if (o.roomOverride && !overrideBySlot.has(o.slotId)) overrideBySlot.set(o.slotId, o.roomOverride);
  }

  const slotsByCourse = selectedCourses.map((course) => ({
    course: { id: course.id, code: course.code, name: course.name },
    slots: slots
      .filter((s) => s.courseId === course.id)
      .map((s) => ({
        id: s.id,
        cn: s.cn,
        subject: s.subject,
        start: s.startTime,
        end: s.endTime,
        roomCode: overrideBySlot.get(s.id) ?? s.room.code,
        facultyId: s.facultyId,
        facultyName: s.faculty?.fullName ?? null,
        surname: s.faculty?.surname ?? null,
      })),
  }));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Daily Attendance Sheet</h1>
        <PrintButton label="Print sheet" />
      </div>

      <form className="no-print card flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input id="date" type="date" name="date" defaultValue={isoDate} className="input" />
        </div>
        <div>
          <p className="label">Programs</p>
          <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-auto">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="programs" value={c.code} defaultChecked={selectedCodes.includes(c.code)} />
                {c.code}
              </label>
            ))}
            {courses.length === 0 ? (
              <span className="text-sm text-zinc-500">No programs yet. Import a schedule first.</span>
            ) : null}
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          Generate
        </button>
        <Link href="/attendance/encode" className="btn">
          Go to encoding
        </Link>
      </form>

      {holiday ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {formatLong(date)} is marked as a no-class day: <strong>{holiday.label}</strong>. Printing is
          allowed, but scheduled hours on this date are excluded from summaries.
        </div>
      ) : null}

      <AttendanceSheets
        date={date}
        header={{
          schoolHeader: settings.school_header,
          collegeHeader: settings.college_header,
          address: settings.address,
          schoolLogo: settings.school_logo,
          collegeLogo: settings.college_logo,
          preparedBy: settings.prepared_by,
          checkedBy: settings.checked_by,
        }}
        courses={selectedCourses.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        slotsByCourse={slotsByCourse}
        noClassLabel={holiday ? holiday.label : null}
      />
    </div>
  );
}
