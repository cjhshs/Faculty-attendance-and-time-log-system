import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { getCollegeOptions, normalizeScopeSelection } from "@/lib/colleges";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getSlotsForDateAndCourses } from "@/lib/schedule-query";
import { parseISODate, todayUtc, formatLong } from "@/lib/dates";
import { getActiveTerm } from "@/lib/terms";
import { reconcileProgramSheet } from "@/lib/attendance-sheet";
import { AttendanceSheets } from "../AttendanceSheets";
import { AttendancePicker } from "../AttendancePicker";
import { PrintButton } from "../PrintButton";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; programs?: string | string[]; college?: string; listed?: string }>;
}) {
  await requirePermission(PERMISSIONS.ATTENDANCE_PRINT);
  const params = await searchParams;

  const date = parseISODate(params.date ?? null) ?? todayUtc();
  const isoDate = date.toISOString().slice(0, 10);

  const [allCourses, collegeOptions] = await Promise.all([getCourses(), getCollegeOptions()]);
  const scope = normalizeScopeSelection(collegeOptions, { college: params.college });
  const courses = scope.college
    ? allCourses.filter((c) =>
        scope.college === "unassigned"
          ? c.collegeId == null
          : c.college?.code === scope.college,
      )
    : allCourses;
  const allCodes = courses.map((c) => c.code);

  const rawPrograms = params.programs;
  const selectedCodes =
    rawPrograms === undefined
      ? params.listed
        ? []
        : allCodes
      : (Array.isArray(rawPrograms) ? rawPrograms : [rawPrograms]).filter((c) => allCodes.includes(c));

  const selectedCourses = courses.filter((c) => selectedCodes.includes(c.code));
  const [settings, activeTerm] = await Promise.all([getSettings(), getActiveTerm()]);

  const holiday = await prisma.holiday.findFirst({ where: { date } });
  const slots = holiday
    ? []
    : await getSlotsForDateAndCourses(
        date,
        selectedCourses.map((c) => c.id),
        activeTerm,
      );

  // Rooms typed in while encoding (for TBA slots) are reflected on the sheet.
  const overrides = holiday
    ? []
    : await prisma.attendance.findMany({
        where: {
          date,
          roomOverride: { not: null },
          slot: { courseId: { in: selectedCourses.map((c) => c.id) }, ...activeTerm },
        },
        select: { slotId: true, roomOverride: true },
      });
  const overrideBySlot = new Map<number, string>();
  for (const o of overrides) {
    if (o.roomOverride && !overrideBySlot.has(o.slotId)) overrideBySlot.set(o.slotId, o.roomOverride);
  }

  const slotsByCourse = selectedCourses.map((course) => ({
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      collegeName: course.college?.name ?? null,
    },
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

  // Compare each program's rendered grid against its schedule. A mismatch means
  // a class would silently vanish from the sheet. Staff are warned, but printing
  // stays available so a class is never left without a paper sheet.
  const reconciliations = slotsByCourse.map((entry) => ({
    code: entry.course.code,
    result: reconcileProgramSheet(entry.slots),
  }));
  const failed = reconciliations.filter((r) => !r.result.ok);
  const hasConflicts = !holiday && failed.length > 0;
  const totalHours = reconciliations.reduce((n, r) => n + r.result.renderedHours, 0);
  const totalMeetings = reconciliations.reduce((n, r) => n + r.result.expectedMeetings, 0);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Daily Attendance Sheet</h1>
          <p className="text-sm text-muted">
            {activeTerm.schoolYear} · {activeTerm.semester}
          </p>
        </div>
        <PrintButton label="Print sheet" />
      </div>

      <form className="no-print card flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input id="date" type="date" name="date" defaultValue={isoDate} className="input" />
        </div>
        <div className="min-w-72 flex-1">
          <AttendancePicker
            colleges={collegeOptions.colleges}
            unassigned={collegeOptions.unassigned}
            college={scope.college ?? ""}
            selectedCodes={selectedCodes}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Generate
        </button>
        <Link href="/attendance/encode" className="btn">
          Go to encoding
        </Link>
      </form>

      <p className="no-print text-xs text-muted">
        Scope:{" "}
        <strong>
          {scope.college === "unassigned"
            ? "Unassigned programs"
            : scope.college
              ? `${scope.college} — ${collegeOptions.colleges.find((c) => c.code === scope.college)?.name ?? ""}`
              : "All colleges"}
        </strong>{" "}
        · {selectedCourses.length} program(s) selected.
      </p>

      {holiday ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {formatLong(date)} is marked as a no-class day: <strong>{holiday.label}</strong>. Printing is
          allowed, but scheduled hours on this date are excluded from summaries.
        </div>
      ) : null}

      <div className="no-print text-xs text-muted">
        Reconciliation — {selectedCourses.length} program(s), {totalMeetings} scheduled meeting(s),{" "}
        {totalHours} rendered class-hour(s).{" "}
        {hasConflicts ? "" : "All programs reconcile."}
      </div>

      {hasConflicts ? (
        <details className="no-print group rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-semibold [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>Reconciliation warning</span>
            <span className="font-normal text-amber-700">({failed.length} program{failed.length === 1 ? "" : "s"})</span>
            <span className="ml-auto text-xs font-normal text-amber-700 underline">Details</span>
            <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-open:rotate-180" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </summary>
          <div className="border-t border-amber-300 px-4 py-3">
            <p>
              Some instructors are scheduled in two classes at the same time. The sheet will still
              print, but only one of the overlapping classes can appear in each check box. Print the
              sheet and confirm the affected instructors with the registrar.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {failed.map((r) => (
                <li key={r.code}>
                  <strong>{r.code}:</strong> {r.result.problems.join(" ")}
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      <div className="overflow-x-auto print:overflow-visible">
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
    </div>
  );
}
