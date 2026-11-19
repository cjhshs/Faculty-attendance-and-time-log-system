import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { getCollegeOptions } from "@/lib/colleges";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getSlotsForDateAndCourses } from "@/lib/schedule-query";
import {
  daysBetweenInclusive,
  eachDate,
  formatISODate,
  formatLong,
  getTodayLocalDate,
  parseISODate,
  todayUtc,
} from "@/lib/dates";
import { getActiveTerm, parseTerm, isValidTerm, type Term } from "@/lib/terms";
import { flattenPrintPages, reconcileProgramSheet, type SheetSlot } from "@/lib/attendance-sheet";
import {
  clampRangeToPeriod,
  getAcademicPeriod,
  listAcademicPeriods,
  periodRangeWarning,
} from "@/lib/academic-period";
import { attendanceSignatureScopeKey, getSignatureValues } from "@/lib/print-signature";
import {
  buildSheetKey,
  getCustomFacultyForSheet,
  getExcludedFacultyIdsForSheet,
} from "@/lib/custom-sheet-faculty";
import { getQualifiedFacultyIdsForCourse } from "@/lib/subject-classification";
import { weekdayOfDate } from "@/lib/schedule-query";
import { termWhere } from "@/lib/terms";
import { AttendanceSheets, type SheetCourse } from "../AttendanceSheets";
import { AttendancePicker } from "../AttendancePicker";
import { PrintButton } from "../PrintButton";
import { PrintPageSelector } from "../PrintPageSelector";
import { AutoPrint } from "../AutoPrint";
import { SignatureFab } from "../SignatureFab";
import { PersistForm } from "../../PersistForm";
import { CustomFacultySearch } from "../CustomFacultySearch";
import { ExcludedFacultyBanner } from "../ExcludedFacultyBanner";

// A printable range is deliberately bounded: each day is a full sheet set, and
// generating months of paper in one request would be an accidental action.
const MAX_RANGE_DAYS = 31;

type SlotRow = Awaited<ReturnType<typeof getSlotsForDateAndCourses>>[number];

type DaySheet = {
  date: Date;
  isoDate: string;
  sheetKey: string;
  holidayLabel: string | null;
  reviewSlots: SlotRow[];
  customFaculty: Awaited<ReturnType<typeof getCustomFacultyForSheet>>;
  excludedFaculty: { id: number; fullName: string }[];
  slotsByCourse: {
    course: SheetCourse;
    slots: SheetSlot[];
  }[];
  totalPages: number;
  renderedHours: number;
  meetings: number;
  failed: { code: string; problems: string[] }[];
};

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    start?: string;
    end?: string;
    programs?: string | string[];
    college?: string;
    department?: string;
    listed?: string;
    page?: string;
    autoprint?: string;
    schoolYear?: string;
    semester?: string;
  }>;
}) {
  await requirePermission(PERMISSIONS.ATTENDANCE_PRINT);
  const params = await searchParams;

  const requestedTerm =
    params.schoolYear || params.semester
      ? parseTerm(params.schoolYear, params.semester)
      : null;
  if ((params.schoolYear || params.semester) && (!requestedTerm || !isValidTerm(requestedTerm))) {
    return (
      <div className="alert alert-error">
        The requested school year and semester are not a valid academic period. Nothing was
        generated and no other term was substituted. Choose the school year and semester again.
      </div>
    );
  }

  const defaultDate = parseISODate(getTodayLocalDate()) ?? todayUtc();
  const start = parseISODate(params.start ?? params.date ?? null) ?? defaultDate;
  const end = parseISODate(params.end ?? null) ?? start;
  if (start > end) {
    return (
      <div className="alert alert-error">
        The start date must not be later than the end date. Nothing was generated.
      </div>
    );
  }

  // `department` is the department-first scope. `college` is accepted for old
  // bookmarks and is treated as the same department selection.
  const department = (params.department ?? params.college ?? "CET").trim() || "CET";

  const [allCourses, collegeOptions, settings, activeTerm, periods] = await Promise.all([
    getCourses(),
    getCollegeOptions(),
    getSettings(),
    getActiveTerm(),
    listAcademicPeriods(),
  ]);

  // The selected school year + semester is explicit. When absent, the active
  // term is used, but it is never silently swapped for another term.
  const selectedTerm: Term = requestedTerm ?? activeTerm;
  const period = await getAcademicPeriod(selectedTerm.schoolYear, selectedTerm.semester);

  // A printable range is clamped to the configured semester. Requesting days
  // outside it never prints sheets for them; the excluded days are reported.
  const clamped = clampRangeToPeriod(period, start, end);
  if (period?.startDate && period.endDate && !clamped) {
    return (
      <div className="alert alert-error">
        The requested range ({formatISODate(start)} to {formatISODate(end)}) does not overlap the
        configured semester ({formatISODate(period.startDate)} to {formatISODate(period.endDate)}).
        Nothing was generated and no other term was substituted.
      </div>
    );
  }
  const rangeStart = clamped?.start ?? start;
  const rangeEnd = clamped?.end ?? end;
  const rangeDays = daysBetweenInclusive(rangeStart, rangeEnd);
  if (rangeDays > MAX_RANGE_DAYS) {
    return (
      <div className="alert alert-error">
        This range covers {rangeDays} days. Generate at most {MAX_RANGE_DAYS} days at a time so a
        single request cannot accidentally print an entire semester.
      </div>
    );
  }
  const dates = eachDate(rangeStart, rangeEnd);
  const isoDates = dates.map((d) => formatISODate(d));
  const excludedNotice = clamped?.reason ?? null;
  const boundaryWarning = periodRangeWarning(period, rangeStart, rangeEnd);

  // Course/program selection is primary (Rule A & B).
  // When a college/department is selected, retrieve its associated programs through the existing
  // Course-to-College database relationship without hardcoding.
  let targetCourses = allCourses;
  if (department) {
    if (department === "unassigned") {
      targetCourses = allCourses.filter((c) => c.collegeId == null);
    } else {
      targetCourses = allCourses.filter(
        (c) => c.college?.code.toUpperCase() === department.toUpperCase(),
      );
    }
  }

  const rawPrograms = params.programs;
  if (rawPrograms !== undefined) {
    const requestedCodes = (Array.isArray(rawPrograms) ? rawPrograms : [rawPrograms]).filter(Boolean);
    if (requestedCodes.length > 0) {
      targetCourses = targetCourses.filter((c) => requestedCodes.includes(c.code));
    }
  }

  const selectedCourses = targetCourses;
  const selectedCodes = selectedCourses.map((c) => c.code);

  // Load every requested day. Each query is scoped to the selected term, so a
  // sheet can never mix schedules from another school year or semester.
  const days: DaySheet[] = [];
  for (const date of dates) {
    const holiday = await prisma.holiday.findFirst({ where: { date } });
    const daySheetKey = buildSheetKey({
      date,
      department: department || null,
      programs: selectedCodes,
      schoolYear: selectedTerm.schoolYear,
      semester: selectedTerm.semester,
    });

    const [excludedIds, customEntries] = await Promise.all([
      getExcludedFacultyIdsForSheet(daySheetKey),
      getCustomFacultyForSheet(daySheetKey),
    ]);

    const excludedFacultyRows =
      excludedIds.size > 0
        ? await prisma.faculty.findMany({
            where: { id: { in: Array.from(excludedIds) } },
            select: { id: true, fullName: true },
          })
        : [];

    const rawSlots = holiday
      ? []
      : await getSlotsForDateAndCourses(
          date,
          selectedCourses.map((c) => c.id),
          selectedTerm,
        );

    // Filter out faculty members who were explicitly excluded from this sheet
    const activeSlots = rawSlots.filter(
      (s) => s.facultyId == null || !excludedIds.has(s.facultyId),
    );

    const reviewSlots = activeSlots.filter((s) => s.facultyId == null);
    const slots = activeSlots.filter((s) => s.facultyId != null);

    const overrides = holiday
      ? []
      : await prisma.attendance.findMany({
          where: {
            date,
            roomOverride: { not: null },
            slotId: { in: slots.map((s) => s.id) },
          },
          select: { slotId: true, roomOverride: true },
        });
    const overrideBySlot = new Map<number, string>();
    for (const o of overrides) {
      if (o.roomOverride && !overrideBySlot.has(o.slotId)) {
        overrideBySlot.set(o.slotId, o.roomOverride);
      }
    }

    const grouped = new Map<
      number,
      {
        course: SheetCourse;
        slots: SheetSlot[];
      }
    >();

    // Major-Subject-Based Faculty Identification (Rule B):
    // For each course, evaluate which instructors automatically qualify based on
    // teaching at least one Major/Professional subject in this course.
    const manuallyAddedIds = new Set(customEntries.map((c) => c.facultyId));

    for (const course of selectedCourses) {
      const courseSlots = slots.filter((s) => s.courseId === course.id);
      const qualifiedFacultyIds = getQualifiedFacultyIdsForCourse(
        courseSlots,
        course.code,
        {
          manuallyAddedFacultyIds: manuallyAddedIds,
          excludedFacultyIds: excludedIds,
        },
      );

      const qualifiedSlots = courseSlots.filter(
        (s) => s.facultyId != null && qualifiedFacultyIds.has(s.facultyId),
      );

      if (qualifiedSlots.length > 0 || selectedCourses.length === 1) {
        grouped.set(course.id, {
          course: {
            id: course.id,
            code: course.code,
            name: course.name,
            collegeName: course.college?.name ?? null,
          },
          slots: qualifiedSlots.map((slot) => ({
            id: slot.id,
            cn: slot.cn,
            subject: slot.subject,
            start: slot.startTime,
            end: slot.endTime,
            roomCode: overrideBySlot.get(slot.id) ?? slot.room.code,
            facultyId: slot.facultyId,
            facultyName: slot.faculty?.fullName ?? null,
            surname: slot.faculty?.surname ?? null,
            isCustom: false,
          })),
        });
      }
    }

    // Retrieve schedule slots and room information for manually added custom faculty
    const customFacultyIds = customEntries.map((c) => c.facultyId);
    const weekday = weekdayOfDate(date);
    const [customRawSlots, customOverrides] = await Promise.all([
      customFacultyIds.length && !holiday
        ? prisma.scheduleSlot.findMany({
            where: {
              facultyId: { in: customFacultyIds },
              weekday,
              ...termWhere(selectedTerm),
            },
            include: {
              room: true,
              course: { include: { college: true } },
              faculty: { include: { department: true } },
            },
            orderBy: [{ startTime: "asc" }, { endTime: "asc" }],
          })
        : Promise.resolve([]),
      customFacultyIds.length && !holiday
        ? prisma.attendance.findMany({
            where: {
              date,
              roomOverride: { not: null },
              slot: { facultyId: { in: customFacultyIds } },
            },
            select: { slotId: true, roomOverride: true },
          })
        : Promise.resolve([]),
    ]);
    const customOverrideBySlot = new Map(customOverrides.map((o) => [o.slotId, o.roomOverride!]));

    for (const customEntry of customEntries) {
      const faculty = customEntry.faculty;
      const fSlots = customRawSlots.filter((s) => s.facultyId === faculty.id);

      if (fSlots.length > 0) {
        // Faculty has real scheduled slots on this day
        for (const slot of fSlots) {
          const courseId = customEntry.courseId ?? slot.courseId;
          const course = customEntry.course ?? slot.course;
          const collegeName =
            "college" in course && course.college ? course.college.name : null;
          if (!grouped.has(courseId)) {
            grouped.set(courseId, {
              course: {
                id: course.id,
                code: course.code,
                name: course.name,
                collegeName,
              },
              slots: [],
            });
          }
          const existingSlot = grouped.get(courseId)!.slots.find((s) => s.id === slot.id);
          if (!existingSlot) {
            grouped.get(courseId)!.slots.push({
              id: slot.id,
              cn: slot.cn,
              subject: slot.subject,
              start: slot.startTime,
              end: slot.endTime,
              roomCode: customOverrideBySlot.get(slot.id) ?? slot.room.code,
              facultyId: faculty.id,
              facultyName: faculty.fullName,
              surname: faculty.surname,
              isCustom: true,
            });
          } else {
            existingSlot.isCustom = true;
          }
        }
      } else {
        // Faculty has no schedule on this day: display empty cells rather than inventing a room
        let targetCourseId = customEntry.courseId;
        let targetCourse: SheetCourse | null = customEntry.course
          ? {
              id: customEntry.course.id,
              code: customEntry.course.code,
              name: customEntry.course.name,
              collegeName: null,
            }
          : null;

        if (!targetCourseId && grouped.size > 0) {
          const first = Array.from(grouped.values())[0];
          targetCourseId = first.course.id;
          targetCourse = first.course;
        }

        if (!targetCourseId) {
          const fallback = selectedCourses[0] ?? allCourses[0];
          if (fallback) {
            targetCourseId = fallback.id;
            targetCourse = {
              id: fallback.id,
              code: fallback.code,
              name: fallback.name,
              collegeName:
                "college" in fallback && fallback.college ? fallback.college.name : null,
            };
          }
        }

        if (targetCourseId && targetCourse) {
          if (!grouped.has(targetCourseId)) {
            grouped.set(targetCourseId, {
              course: targetCourse,
              slots: [],
            });
          }
          grouped.get(targetCourseId)!.slots.push({
            id: -faculty.id,
            cn: "CUSTOM",
            subject: "CUSTOM",
            start: "",
            end: "",
            roomCode: "",
            facultyId: faculty.id,
            facultyName: faculty.fullName,
            surname: faculty.surname,
            isCustom: true,
          });
        }
      }
    }

    const slotsByCourse = Array.from(grouped.values()).sort((a, b) =>
      a.course.code.localeCompare(b.course.code),
    );

    // Compare each program's rendered grid against its schedule. A mismatch
    // means a class would silently vanish from the sheet; staff are warned but
    // printing stays available so a class is never left without a paper sheet.
    const reconciliations = slotsByCourse.map((entry) => ({
      code: entry.course.code,
      result: reconcileProgramSheet(entry.slots),
    }));
    const failed = reconciliations
      .filter((r) => !r.result.ok)
      .map((r) => ({ code: r.code, problems: r.result.problems }));

    const holidayPages = (department ? 0 : selectedCourses.length) || 1;
    const totalPages = holiday
      ? holidayPages
      : flattenPrintPages(slotsByCourse).length;

    days.push({
      date,
      isoDate: formatISODate(date),
      sheetKey: daySheetKey,
      holidayLabel: holiday?.label ?? null,
      reviewSlots,
      customFaculty: customEntries,
      excludedFaculty: excludedFacultyRows,
      slotsByCourse,
      totalPages,
      renderedHours: reconciliations.reduce((n, r) => n + r.result.renderedHours, 0),
      meetings: reconciliations.reduce((n, r) => n + r.result.expectedMeetings, 0),
      failed,
    });
  }

  const totalPages = Math.max(1, days.reduce((n, day) => n + day.totalPages, 0));
  const requestedPage = Number(params.page);
  const validPage =
    Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= totalPages
      ? requestedPage
      : null;
  const pageError =
    params.page && !validPage
      ? `Page ${params.page} is outside this report (1–${totalPages}). Showing all pages instead.`
      : null;

  // Existing records are reported, never regenerated. Reprinting is read-only.
  const allSlotIds = days.flatMap((day) =>
    day.slotsByCourse.flatMap((entry) => entry.slots.map((s) => s.id)),
  );
  const [existingRows, savedSessions] = await Promise.all([
    allSlotIds.length
      ? prisma.attendance.findMany({
          where: { date: { in: dates }, slotId: { in: allSlotIds } },
          select: { present: true, sessionId: true },
        })
      : Promise.resolve([]),
    prisma.attendanceSession.count({
      where: { date: { in: dates }, status: "SAVED" },
    }),
  ]);
  const existingPresent = existingRows.filter((r) => r.present === true).length;
  const existingAbsent = existingRows.filter((r) => r.present === false).length;
  const existingUnencoded = existingRows.filter((r) => r.present === null).length;
  const existingTotal = existingRows.length;

  const facultyInDepartment = department
    ? await prisma.faculty.count({
        where:
          department === "unassigned"
            ? { departmentId: null }
            : { department: { code: department } },
      })
    : null;
  const scheduledFaculty = new Set(
    days.flatMap((day) =>
      day.slotsByCourse.flatMap((entry) =>
        entry.slots.map((s) => s.facultyId).filter((id): id is number => id != null),
      ),
    ),
  );

  // Signatories are scoped to the attendance generation scope and term.
  const scopeKey = attendanceSignatureScopeKey({
    department: department || null,
    programs: department ? [] : selectedCodes,
    schoolYear: selectedTerm.schoolYear,
    semester: selectedTerm.semester,
  });
  const signature = await getSignatureValues(scopeKey, settings);

  const mainSheetKey = buildSheetKey({
    date: rangeStart,
    department: department || null,
    programs: department ? [] : selectedCodes,
    schoolYear: selectedTerm.schoolYear,
    semester: selectedTerm.semester,
  });

  const collegeCode = department || (params.college ?? "").trim();
  const scopeLabel = collegeCode
    ? collegeCode === "unassigned"
      ? "Programs without a college"
      : `${collegeCode} — ${collegeOptions.colleges.find((c) => c.code === collegeCode)?.name ?? ""}`
    : selectedCodes.length > 0 && selectedCodes.length < allCourses.length
      ? `Programs: ${selectedCodes.join(", ")}`
      : "All colleges / all programs";

  const years = Array.from(new Set(periods.map((p) => p.schoolYear)));
  if (!years.includes(selectedTerm.schoolYear)) years.push(selectedTerm.schoolYear);
  years.sort();
  const semesters = ["1st Semester", "2nd Semester", "Summer"];
  const reviewSlots = days.flatMap((day) =>
    day.reviewSlots.map((s) => ({ ...s, dateLabel: day.isoDate })),
  );

  return (
    <div className="space-y-5 pb-28 print:pb-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Daily Attendance Sheet</h1>
          <p className="page-subtitle">
            {selectedTerm.schoolYear} · {selectedTerm.semester}
            {period?.startDate && period.endDate
              ? ` · ${formatISODate(period.startDate)} to ${formatISODate(period.endDate)}`
              : " · semester dates not configured"}
          </p>
        </div>
      </div>

      <PersistForm
        storageKey="fa:filter:attendance-print"
        className="no-print card space-y-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="start">
              Date from
            </label>
            <input
              id="start"
              type="date"
              name="start"
              defaultValue={isoDates[0]}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="end">
              Date to
            </label>
            <input id="end" type="date" name="end" defaultValue={isoDates[isoDates.length - 1]} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="print-year">
              School year
            </label>
            <select
              id="print-year"
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
            <label className="label" htmlFor="print-sem">
              Semester
            </label>
            <select
              id="print-sem"
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

          <CustomFacultySearch
            sheetKey={mainSheetKey}
            date={formatISODate(rangeStart)}
            schoolYear={selectedTerm.schoolYear}
            semester={selectedTerm.semester}
            currentFacultyIds={Array.from(scheduledFaculty)}
            availableCourses={allCourses.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
          />

          <div className="ml-auto flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Generate
            </button>
            <Link href="/attendance/encode" className="btn">
              Go to encoding
            </Link>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <AttendancePicker
            colleges={collegeOptions.colleges}
            unassigned={collegeOptions.unassigned}
            department={department}
            selectedCodes={selectedCodes}
          />
        </div>
      </PersistForm>

      <p className="no-print text-xs text-muted">
        Scope: <strong>{scopeLabel}</strong> · {selectedTerm.schoolYear} · {selectedTerm.semester} ·{" "}
        {formatLong(rangeStart)}
        {rangeDays > 1 ? ` to ${formatLong(rangeEnd)}` : ""} ·{" "}
        {days.reduce((n, day) => n + day.slotsByCourse.length, 0)} program sheet(s) with{" "}
        {days.reduce((n, day) => n + day.meetings, 0)} scheduled faculty meeting(s).{" "}
        {department
          ? "Faculty membership is taken from the registered department; student programs do not decide who appears."
          : ""}
      </p>

      {excludedNotice ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {excludedNotice}
        </div>
      ) : null}

      {boundaryWarning ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {boundaryWarning}
        </div>
      ) : null}

      {!period ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {selectedTerm.schoolYear} · {selectedTerm.semester} is not a registered academic period.
          Review it on Settings before treating this printout as an official term record.
        </div>
      ) : null}

      {department ? (
        <details className="no-print rounded-md border border-line bg-slate-50 text-xs text-muted">
          <summary className="cursor-pointer list-none px-3 py-1.5 font-medium text-ink [&::-webkit-details-marker]:hidden">
            Department scope notes
          </summary>
          <div className="border-t border-line px-3 py-2">
            {department === "unassigned"
              ? "Showing faculty whose department has not been reviewed yet. Assign a department on Master Data to include them in a department sheet."
              : "Faculty with no registered department are never silently added to this department. Assign them on Master Data after review."}
          </div>
        </details>
      ) : null}

      {existingTotal > 0 || savedSessions > 0 ? (
        <details className="no-print rounded-md border border-line bg-white text-xs">
          <summary className="cursor-pointer list-none px-3 py-1.5 font-medium [&::-webkit-details-marker]:hidden">
            Existing records detected
          </summary>
          <div className="border-t border-line px-3 py-2">
            {existingTotal} attendance row{existingTotal === 1 ? "" : "s"} already exist for these
            dates ({existingPresent} present, {existingAbsent} absent, {existingUnencoded} not
            encoded) and {savedSessions} finalized day/program scope
            {savedSessions === 1 ? "" : "s"}. They will be <strong>reused</strong>, not regenerated:
            this preview and any reprint only read them, and encoding updates only the entries you
            explicitly change. Present/absent values are never replaced with empty defaults.
          </div>
        </details>
      ) : null}

      {department && facultyInDepartment === 0 ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>No verified faculty in this department yet.</strong>{" "}
          {department === "unassigned"
            ? "Every registered faculty member already has a department."
            : `No faculty member is assigned to ${department}. Assign departments on Master Data; membership is never guessed from subjects or programs.`}
        </div>
      ) : department && scheduledFaculty.size === 0 ? (
        <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {facultyInDepartment} faculty member{facultyInDepartment === 1 ? "" : "s"} belong to{" "}
          {department}, but no applicable schedule was found in {selectedTerm.schoolYear} ·{" "}
          {selectedTerm.semester} for {rangeDays === 1 ? formatLong(rangeStart) : "these dates"}. Nothing
          was generated and no other term was substituted.
        </div>
      ) : null}

      {days
        .filter((day) => day.holidayLabel)
        .map((day) => (
          <div
            key={`holiday-${day.isoDate}`}
            className="no-print rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {formatLong(day.date)} is marked as a no-class day:{" "}
            <strong>{day.holidayLabel}</strong>. Printing is allowed, but scheduled hours on this
            date are excluded from summaries.
          </div>
        ))}

      {pageError ? (
        <details className="no-print rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
          <summary className="cursor-pointer list-none px-3 py-1.5 font-medium [&::-webkit-details-marker]:hidden">
            Error
          </summary>
          <div className="border-t border-red-200 px-3 py-2">{pageError}</div>
        </details>
      ) : null}

      <PrintPageSelector totalPages={totalPages} currentPage={validPage} />
      <AutoPrint enabled={params.autoprint === "1" && validPage != null} />

      {reviewSlots.length > 0 ? (
        <details className="no-print rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-800">
          <summary className="cursor-pointer px-4 py-2.5 font-semibold">
            {reviewSlots.length} class meeting(s) have no instructor and are not attributed to any
            department — review the schedule
          </summary>
          <ul className="list-disc space-y-1 border-t border-amber-300 px-8 py-2 text-xs">
            {reviewSlots.slice(0, 100).map((s) => (
              <li key={`${s.dateLabel}-${s.id}`}>
                {s.dateLabel} · CN {s.cn} · {s.subject} · {s.course.code} · {s.startTime}-
                {s.endTime}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="no-print text-xs text-muted">
        Reconciliation — {days.reduce((n, d) => n + d.slotsByCourse.length, 0)} program sheet(s),{" "}
        {days.reduce((n, d) => n + d.meetings, 0)} scheduled meeting(s),{" "}
        {days.reduce((n, d) => n + d.renderedHours, 0)} rendered class-hour(s).{" "}
        {days.every((d) => d.failed.length === 0) ? "All programs reconcile." : ""}
      </div>

      {days.some((d) => d.failed.length > 0) ? (
        <details className="no-print group rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 font-medium [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>Reconciliation warning</span>
            <span className="font-normal text-amber-700">
              ({days.reduce((n, d) => n + d.failed.length, 0)} program
              {days.reduce((n, d) => n + d.failed.length, 0) === 1 ? "" : "s"})
            </span>
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
              {days.flatMap((d) =>
                d.failed.map((r) => (
                  <li key={`${d.isoDate}-${r.code}`}>
                    <strong>
                      {d.isoDate} · {r.code}:
                    </strong>{" "}
                    {r.problems.join(" ")}
                  </li>
                )),
              )}
            </ul>
          </div>
        </details>
      ) : null}

      {days.map((day, index) => {
        const pageStart = days.slice(0, index).reduce((n, d) => n + d.totalPages, 0);
        const dayEnd = pageStart + day.totalPages;
        // A specific page belongs to exactly one day; every other day is skipped
        // entirely rather than re-rendering as "all pages".
        if (validPage && (validPage <= pageStart || validPage > dayEnd)) return null;
        const localPage = validPage ? validPage - pageStart : null;
        return (
          <section key={day.isoDate} className="print-day space-y-3">
            {day.excludedFaculty.length > 0 ? (
              <ExcludedFacultyBanner
                sheetKey={day.sheetKey}
                excludedFaculty={day.excludedFaculty}
              />
            ) : null}
            {day.customFaculty.length > 0 ? (
              <div className="no-print flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                <span className="font-semibold">Manually Added Faculty ({day.customFaculty.length}):</span>
                {day.customFaculty.map((cf) => (
                  <span
                    key={cf.id}
                    className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-white px-2 py-0.5 text-xs"
                  >
                    <span>{cf.faculty.fullName}</span>
                    {cf.faculty.department ? (
                      <span className="text-[10px] text-muted">({cf.faculty.department.code})</span>
                    ) : (
                      <span className="text-[10px] text-muted">(No dept)</span>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
            {days.length > 1 ? (
              <h2 className="no-print border-b border-line pb-1 text-sm font-semibold">
                {formatLong(day.date)}
                {day.holidayLabel ? ` — no class (${day.holidayLabel})` : ""}
                <span className="ml-2 text-xs font-normal text-muted">
                  page{day.totalPages === 1 ? "" : "s"} {pageStart + 1}
                  {day.totalPages === 1 ? "" : `–${dayEnd}`} of {totalPages}
                </span>
              </h2>
            ) : null}
            <div className="overflow-x-auto print:overflow-visible">
              <AttendanceSheets
                date={day.date}
                sheetKey={day.sheetKey}
                header={{
                  schoolHeader: settings.school_header,
                  collegeHeader: settings.college_header,
                  address: settings.address,
                  schoolLogo: settings.school_logo,
                  collegeLogo: settings.college_logo,
                  preparedBy: signature.preparedBy,
                  checkedBy: signature.checkedBy,
                  preparedDesignation: signature.preparedDesignation,
                  checkedDesignation: signature.checkedDesignation,
                }}
                courses={
                  department
                    ? day.slotsByCourse.map((s) => s.course)
                    : selectedCourses.map((c) => ({ id: c.id, code: c.code, name: c.name }))
                }
                slotsByCourse={day.slotsByCourse}
                noClassLabel={day.holidayLabel}
                onlyPage={localPage}
                pageOffset={pageStart}
                totalPages={totalPages}
              />
            </div>
          </section>
        );
      })}

      <SignatureFab scopeKey={scopeKey} initial={signature} />
      <PrintButton
        label={
          validPage
            ? `Print page ${validPage} of ${totalPages}`
            : `Print all${totalPages > 1 ? ` (${totalPages} pages)` : ""}`
        }
      />
    </div>
  );
}
