import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getSlotsForDateAndCourses } from "@/lib/schedule-query";
import { buildProgramSheet, type SheetSlot } from "@/lib/attendance-sheet";
import { parseISODate, todayUtc, formatLong, hoursOfRange } from "@/lib/dates";
import { getActiveTerm } from "@/lib/terms";
import { EncodeClient, type EncodeRow, type EncodeColumn, type EncodeCell } from "./EncodeClient";

export default async function EncodePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; program?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_ENCODE);
  const params = await searchParams;
  const date = parseISODate(params.date ?? null) ?? todayUtc();
  const isoDate = date.toISOString().slice(0, 10);

  const courses = await getCourses();
  const selected = params.program
    ? courses.find((c) => c.code === params.program)
    : courses[0];

  if (!selected) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Encode Attendance</h1>
        <p className="page-subtitle">No programs available. Import a schedule first.</p>
      </div>
    );
  }

  const isPast = date < todayUtc();
  const canEditPast = hasPermission(user, PERMISSIONS.ATTENDANCE_EDIT_PAST);
  const activeTerm = await getActiveTerm();

  const [slots, existing, session, holiday] = await Promise.all([
    getSlotsForDateAndCourses(date, [selected.id], activeTerm),
    prisma.attendance.findMany({
      where: {
        date,
        slot: {
          courseId: selected.id,
          schoolYear: activeTerm.schoolYear,
          semester: activeTerm.semester,
        },
      },
    }),
    prisma.attendanceSession.findUnique({
      where: { date_courseId: { date, courseId: selected.id } },
      include: { savedBy: true },
    }),
    prisma.holiday.findFirst({ where: { date } }),
  ]);

  const sheetSlots: SheetSlot[] = slots.map((s) => ({
    id: s.id,
    cn: s.cn,
    subject: s.subject,
    start: s.startTime,
    end: s.endTime,
    roomCode: s.room.code,
    facultyId: s.facultyId,
    facultyName: s.faculty?.fullName ?? null,
    surname: s.faculty?.surname ?? null,
  }));

  const sheet = buildProgramSheet(sheetSlots);

  // Lookup of the slot a faculty has during a given hour.
  const slotByFacultyHour = new Map<string, (typeof slots)[number]>();
  for (const s of slots) {
    if (s.facultyId == null) continue;
    for (const hour of hoursOfRange(s.startTime, s.endTime)) {
      slotByFacultyHour.set(`${s.facultyId}|${hour}`, s);
    }
  }

  const existingByKey = new Map(existing.map((a) => [`${a.slotId}|${a.hourStart}`, a]));

  const columns: EncodeColumn[] = sheet.columns.map((c) => ({
    facultyId: c.facultyId,
    label: c.label,
  }));

  const rows: EncodeRow[] = sheet.rows.map((row) => {
    const cells: (EncodeCell | null)[] = sheet.columns.map((c) => {
      const slot = slotByFacultyHour.get(`${c.facultyId}|${row.start}`);
      if (!slot) return null;
      const key = `${slot.id}|${row.start}`;
      const record = existingByKey.get(key);
      return {
        key,
        slotId: slot.id,
        hour: row.start,
        room: slot.room.code,
        roomType: slot.room.type,
        present: record?.present ?? false,
        reason: record?.reason ?? "",
        roomOverride: record?.roomOverride ?? "",
      };
    });
    return { hour: row.start, label: row.label, cells };
  });

  const locked = !canEditPast && (isPast || session?.status === "SAVED");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Encode Attendance</h1>
        <Link href={`/attendance/print?date=${isoDate}&programs=${selected.code}`} className="btn">
          View printable sheet
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input id="date" type="date" name="date" defaultValue={isoDate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="program">
            Program
          </label>
          <select id="program" name="program" defaultValue={selected.code} className="input">
            {courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Load
        </button>
      </form>

      {holiday ? (
        <div className="alert alert-warn">
          {formatLong(date)} is a no-class day ({holiday.label}). Hours here are excluded from summaries.
        </div>
      ) : null}

      {locked ? (
        <div className="alert alert-error">
          {isPast ? "This is a past date" : "This day is already saved"} and you do not have the
          &quot;Edit past attendance&quot; permission. The attendance below is read-only.
        </div>
      ) : null}

      <EncodeClient
        date={isoDate}
        courseCode={selected.code}
        dateLabel={formatLong(date)}
        columns={columns}
        rows={rows}
        locked={locked}
        session={
          session?.status === "SAVED"
            ? {
                savedByName: session.savedBy?.name ?? "Unknown",
                savedAt: session.savedAt ? session.savedAt.toISOString() : "",
              }
            : null
        }
        unassigned={sheet.unassigned}
      />
    </div>
  );
}
