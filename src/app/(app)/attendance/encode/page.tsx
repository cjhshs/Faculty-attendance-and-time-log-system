import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getCollegeOptions, normalizeScopeSelection } from "@/lib/colleges";
import { getSlotsForDateAndCourses, getSlotsForDateAndDepartment } from "@/lib/schedule-query";
import { buildProgramSheet, type SheetSlot } from "@/lib/attendance-sheet";
import { parseISODate, todayUtc, formatLong, hoursOfRange } from "@/lib/dates";
import { getActiveTerm, parseTerm, isValidTerm, type Term } from "@/lib/terms";
import {
  attendanceGenerationGate,
  getAcademicPeriod,
  listAcademicPeriods,
  periodRangeWarning,
} from "@/lib/academic-period";
import { statusFromPresent, type AttendanceDraftPayload } from "@/lib/attendance-status";
import { parseDraftPayload, attendanceDraftScopeKey } from "@/lib/attendance-draft";
import { CollegeCourseFilter } from "../../CollegeCourseFilter";
import { EncodeClient, type EncodeRow, type EncodeColumn, type EncodeCell } from "./EncodeClient";
import { PersistForm } from "../../PersistForm";

export default async function EncodePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    program?: string;
    college?: string;
    department?: string;
    schoolYear?: string;
    semester?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_ENCODE);
  const params = await searchParams;
  const date = parseISODate(params.date ?? null) ?? todayUtc();
  const isoDate = date.toISOString().slice(0, 10);
  const department = (params.department ?? params.college ?? "").trim();
  const requestedTerm =
    params.schoolYear || params.semester
      ? parseTerm(params.schoolYear, params.semester)
      : null;
  if ((params.schoolYear || params.semester) && (!requestedTerm || !isValidTerm(requestedTerm))) {
    return (
      <div className="alert alert-error">
        The requested school year and semester are not a valid academic period. Nothing was loaded
        and no other term was substituted. Choose a valid period.
      </div>
    );
  }

  const [allCourses, collegeOptions, activeTerm, periods] = await Promise.all([
    getCourses(),
    getCollegeOptions(),
    getActiveTerm(),
    listAcademicPeriods(),
  ]);
  // Only the explicitly selected term is queried. If none was chosen, the
  // active term is used but never swapped for another one silently.
  const selectedTerm: Term = requestedTerm ?? activeTerm;
  const period = await getAcademicPeriod(selectedTerm.schoolYear, selectedTerm.semester);
  const generationGate = attendanceGenerationGate(period, date);
  const boundaryWarning = periodRangeWarning(period, date, date);
  const scope = normalizeScopeSelection(collegeOptions, {
    college: params.college,
    program: params.program,
  });

  // Attendance is never loaded for a date outside the configured semester. The
  // stop is shown before any schedule query so no editable grid can appear.
  if (!generationGate.ok) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Encode Attendance</h1>
          <p className="page-subtitle">
            {selectedTerm.schoolYear} · {selectedTerm.semester} · {formatLong(date)}
          </p>
        </div>
        <div className="alert alert-error block" role="alert">
          <p className="font-semibold">Attendance cannot be generated for this date.</p>
          <p className="mt-1">{generationGate.message}</p>
          {period?.startDate && period.endDate ? (
            <p className="mt-1 text-xs">
              Configured coverage: {period.startDate.toISOString().slice(0, 10)} to{" "}
              {period.endDate.toISOString().slice(0, 10)}.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="btn btn-primary">
            Configure academic period
          </Link>
          <Link href="/attendance/encode" className="btn">
            Choose another date
          </Link>
        </div>
      </div>
    );
  }

  // Legacy per-program scope (used only when no department is selected).
  const pool = scope.program
    ? allCourses.filter((c) => c.code === scope.program)
    : scope.college
      ? allCourses.filter((c) =>
          scope.college === "unassigned"
            ? c.collegeId == null
            : c.college?.code === scope.college,
        )
      : allCourses;
  const selected = department ? null : pool[0];

  if (!department && !selected) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Encode Attendance</h1>
        <p className="page-subtitle">
          {scope.college || scope.program
            ? "No programs match the selected college/course. Choose another scope or clear the filter."
            : "No programs available. Import a schedule first."}
        </p>
        <Link href="/attendance/encode" className="btn">
          Clear filters
        </Link>
      </div>
    );
  }

  const isPast = date < todayUtc();
  const canEditPast = hasPermission(user, PERMISSIONS.ATTENDANCE_EDIT_PAST);

  const slots = department
    ? await getSlotsForDateAndDepartment(date, department, selectedTerm)
    : await getSlotsForDateAndCourses(date, [selected!.id], selectedTerm);

  const courseIds = Array.from(new Set(slots.map((s) => s.courseId)));
  const [existing, savedSessions, holiday] = await Promise.all([
    slots.length
      ? prisma.attendance.findMany({
          where: { date, slotId: { in: slots.map((s) => s.id) } },
        })
      : Promise.resolve([]),
    courseIds.length
      ? prisma.attendanceSession.findMany({
          where: { date, courseId: { in: courseIds }, status: "SAVED" },
          include: { savedBy: true },
          orderBy: { savedAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.holiday.findFirst({ where: { date } }),
  ]);

  const savedSession = savedSessions[0] ?? null;

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
        status: statusFromPresent(record?.present),
        reason: record?.reason ?? "",
        roomOverride: record?.roomOverride ?? "",
      };
    });
    return { hour: row.start, label: row.label, cells };
  });

  const locked = !canEditPast && (isPast || savedSession != null);

  const scopeKey = attendanceDraftScopeKey({
    department: department || null,
    courseCode: department ? null : selected?.code,
    date: isoDate,
    schoolYear: selectedTerm.schoolYear,
    semester: selectedTerm.semester,
  });
  const draftRow = await prisma.attendanceDraft.findUnique({
    where: { userId_scopeKey: { userId: user.id, scopeKey } },
  });
  const initialDraft: AttendanceDraftPayload | null = draftRow
    ? parseDraftPayload({ ...(draftRow.payload as object), version: draftRow.version })
    : null;

  const targetLabel = department
    ? department === "unassigned"
      ? "Faculty without a department"
      : `${department} — ${collegeOptions.colleges.find((c) => c.code === department)?.name ?? ""}`
    : selected!.code;

  const facultyInDepartment = department
    ? await prisma.faculty.count({
        where:
          department === "unassigned"
            ? { departmentId: null }
            : { department: { code: department } },
      })
    : null;
  const existingPresent = existing.filter((a) => a.present === true).length;
  const existingAbsent = existing.filter((a) => a.present === false).length;
  const existingUnencoded = existing.filter((a) => a.present === null).length;

  const years = Array.from(new Set(periods.map((p) => p.schoolYear)));
  if (!years.includes(selectedTerm.schoolYear)) years.push(selectedTerm.schoolYear);
  years.sort();
  const semesters = ["1st Semester", "2nd Semester", "Summer"];

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Encode Attendance</h1>
          <p className="text-sm text-muted">
            Scope: <strong>{targetLabel}</strong> · {selectedTerm.schoolYear} ·{" "}
            {selectedTerm.semester}
            {department
              ? " — all programs taught by this department's registered faculty"
              : selected!.college
                ? ` — ${selected!.college.name}`
                : " — Unassigned"}
          </p>
        </div>
        <Link
          href={`/attendance/print?start=${isoDate}&end=${isoDate}&schoolYear=${encodeURIComponent(
            selectedTerm.schoolYear,
          )}&semester=${encodeURIComponent(selectedTerm.semester)}&department=${encodeURIComponent(department)}`}
          className="btn"
        >
          View printable sheet
        </Link>
      </div>

      <PersistForm
        storageKey="fa:filter:attendance-encode"
        className="card flex flex-wrap items-end gap-4"
      >
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input id="date" type="date" name="date" defaultValue={isoDate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="encode-year">
            School year
          </label>
          <select
            id="encode-year"
            name="schoolYear"
            defaultValue={selectedTerm.schoolYear}
            className="input"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="encode-sem">
            Semester
          </label>
          <select
            id="encode-sem"
            name="semester"
            defaultValue={selectedTerm.semester}
            className="input"
          >
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="encode-department">
            Department (faculty roster)
          </label>
          <select
            id="encode-department"
            name="department"
            className="input"
            defaultValue={department}
          >
            <option value="">Program mode (legacy)</option>
            {collegeOptions.colleges.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
            {collegeOptions.unassigned.length > 0 ? (
              <option value="unassigned">Faculty without a department</option>
            ) : null}
          </select>
        </div>
        {!department ? (
          <CollegeCourseFilter
            colleges={collegeOptions.colleges}
            unassigned={collegeOptions.unassigned}
            college={scope.college ?? ""}
            program={selected?.code ?? ""}
            idPrefix="encode"
          />
        ) : null}
        <button type="submit" className="btn btn-primary">
          Load
        </button>
      </PersistForm>

      <div className="no-print rounded-md border border-line bg-white px-3 py-2 text-xs">
        <strong>Generation coverage:</strong> {selectedTerm.schoolYear} ·{" "}
        {selectedTerm.semester}
        {period?.startDate && period.endDate
          ? ` · ${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)} (inclusive)`
          : ""}
        . This date is inside the configured semester; records outside it are never generated.
      </div>

      {boundaryWarning ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {boundaryWarning}
        </div>
      ) : null}

      {department && facultyInDepartment === 0 ? (
        <div className="alert alert-warn">
          <strong>No verified faculty in this department yet.</strong>{" "}
          {department === "unassigned"
            ? "Every registered faculty member already has a department."
            : `Assign departments on Master Data before encoding ${department} attendance.`}
        </div>
      ) : null}

      {existing.length > 0 ? (
        <p className="rounded-md border border-line bg-white px-3 py-2 text-xs">
          <strong>{existing.length}</strong> existing attendance row
          {existing.length === 1 ? "" : "s"} loaded ({existingPresent} present, {existingAbsent}{" "}
          absent, {existingUnencoded} not encoded). Saving updates only the entries you change;
          untouched present/absent values are never replaced with an empty value.
        </p>
      ) : null}

      {holiday ? (
        <div className="alert alert-warn">
          {formatLong(date)} is a no-class day ({holiday.label}). Hours here are excluded from summaries.
        </div>
      ) : null}

      {department ? (
        <p className="text-xs text-muted">
          Only faculty whose registered department is <strong>{department}</strong> appear below.
          A faculty member teaching another program&apos;s subject stays in this department; a teacher
          from another department is excluded even when the subject is offered to {department}{" "}
          students.
        </p>
      ) : null}

      {locked ? (
        <div className="alert alert-error">
          {isPast ? "This is a past date" : "This day is already saved"} and you do not have the
          &quot;Edit past attendance&quot; permission. The attendance below is read-only.
        </div>
      ) : null}

      <EncodeClient
        /* A different department/date/program is a different working scope: remount
           so no unsaved cell state leaks into the new sheet. */
        key={scopeKey}
        date={isoDate}
        targetLabel={targetLabel}
        scopeKey={scopeKey}
        schoolYear={selectedTerm.schoolYear}
        semester={selectedTerm.semester}
        departmentCode={department || null}
        courseCode={department ? null : selected!.code}
        dateLabel={formatLong(date)}
        columns={columns}
        rows={rows}
        locked={locked}
        session={
          savedSession
            ? {
                savedByName: savedSession.savedBy?.name ?? "Unknown",
                savedAt: savedSession.savedAt ? savedSession.savedAt.toISOString() : "",
              }
            : null
        }
        unassigned={sheet.unassigned}
        initialDraft={initialDraft}
      />
    </div>
  );
}
