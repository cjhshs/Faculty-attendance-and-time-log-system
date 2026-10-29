import { prisma } from "@/lib/prisma";
import { formatISODate, parseISODate } from "@/lib/dates";
import {
  SEMESTER_OPTIONS,
  formatSchoolYear,
  isValidSchoolYear,
  normalizeSemester,
  type SemesterOption,
} from "@/lib/terms";

// Academic periods are the explicit school year + semester records that imports
// and attendance generation are anchored to. A period with NULL dates is a
// legacy term whose real boundaries were never recorded; it stays selectable but
// is reported as "dates not configured" instead of guessing them.

export type AcademicPeriodStatus = "ACTIVE" | "UPCOMING" | "ARCHIVED";

export const PERIOD_STATUS_OPTIONS: { value: AcademicPeriodStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "ARCHIVED", label: "Archived" },
];

export type AcademicPeriodRecord = {
  schoolYear: string;
  semester: string;
  startDate: Date | null;
  endDate: Date | null;
  status: AcademicPeriodStatus | null;
  /** True when a row exists in `academic_periods` (dates may still be unset). */
  configured: boolean;
};

export type PeriodValue = {
  schoolYear: string;
  semester: string;
  startDate: Date | null;
  endDate: Date | null;
  status: AcademicPeriodStatus | null;
};

export type PeriodCheck = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  value: PeriodValue | null;
};

export function periodKey(schoolYear: string, semester: string): string {
  return `${formatSchoolYear(schoolYear)}|${normalizeSemester(semester) ?? semester}`;
}

export function isPeriodStatus(value: string | null | undefined): value is AcademicPeriodStatus {
  return value === "ACTIVE" || value === "UPCOMING" || value === "ARCHIVED";
}

// A suggested boundary for a new period. It is only a starting point for the
// administrator to confirm or edit; it is never written without that review.
export function suggestedPeriodDates(
  schoolYear: string,
  semester: string,
): { start: string; end: string } {
  const match = /^(\d{4})\s*[-–]\s*(\d{4})$/.exec(schoolYear.trim());
  const first = match ? Number(match[1]) : new Date().getUTCFullYear();
  const second = match ? Number(match[2]) : first + 1;
  const canonical = normalizeSemester(semester) ?? semester;
  if (canonical === "2nd Semester") {
    return { start: `${second}-01-05`, end: `${second}-05-31` };
  }
  if (canonical === "Summer") {
    return { start: `${second}-06-01`, end: `${second}-07-31` };
  }
  return { start: `${first}-08-01`, end: `${first}-12-31` };
}

export function validatePeriodInput(input: {
  schoolYear?: string | null;
  semester?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}): PeriodCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  const schoolYear = formatSchoolYear(String(input.schoolYear ?? ""));
  const normalized = normalizeSemester(input.semester);
  const semester =
    normalized && (SEMESTER_OPTIONS as readonly string[]).includes(normalized) ? normalized : "";

  if (!schoolYear) errors.push("School year is required.");
  else if (!isValidSchoolYear(schoolYear)) {
    errors.push("School year must look like 2026-2027.");
  }
  if (!semester) errors.push("Choose First Semester, Second Semester or Summer.");

  const rawStart = String(input.startDate ?? "").trim();
  const rawEnd = String(input.endDate ?? "").trim();
  const startDate = rawStart ? parseISODate(rawStart) : null;
  const endDate = rawEnd ? parseISODate(rawEnd) : null;

  if (rawStart && !startDate) errors.push("Semester start date is not a valid date.");
  if (rawEnd && !endDate) errors.push("Semester end date is not a valid date.");
  if (!rawStart && !rawEnd) {
    warnings.push(
      "No semester dates were supplied. Attendance can still be generated, but dates cannot be checked against the semester boundary.",
    );
  } else if (!startDate || !endDate) {
    errors.push("Enter both the semester start and end dates, or leave both blank.");
  } else if (startDate >= endDate) {
    errors.push("Semester start must be earlier than the semester end.");
  } else {
    const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    if (days < 14) errors.push("A semester must span at least 14 days.");
    if (days > 366) errors.push("A semester cannot be longer than 366 days.");
  }

  const status = isPeriodStatus(input.status) ? input.status : null;
  if (input.status && !status) errors.push("Unknown academic period status.");

  if (schoolYear && startDate && endDate) {
    const first = Number(schoolYear.slice(0, 4));
    const second = Number(schoolYear.slice(5, 9));
    const startYear = startDate.getUTCFullYear();
    const endYear = endDate.getUTCFullYear();
    if (startYear !== first && startYear !== second) {
      warnings.push(`The semester starts in ${startYear}, outside ${schoolYear}.`);
    }
    if (endYear !== first && endYear !== second) {
      warnings.push(`The semester ends in ${endYear}, outside ${schoolYear}.`);
    }
  }

  const value =
    errors.length === 0
      ? { schoolYear, semester, startDate, endDate, status }
      : null;

  return { ok: errors.length === 0, errors, warnings, value };
}

export function periodContains(period: { startDate: Date | null; endDate: Date | null }, date: Date) {
  if (!period.startDate || !period.endDate) return null;
  return date >= period.startDate && date <= period.endDate;
}

export type GenerationGate =
  | { ok: true }
  | {
      ok: false;
      code: "UNREGISTERED" | "DATES_NOT_CONFIGURED" | "OUTSIDE_PERIOD";
      message: string;
    };

// Attendance is only ever written for a date inside a registered period with
// both boundaries configured. A missing/partial period is never guessed and an
// out-of-range date is never silently clamped: both stop the write.
export function attendanceGenerationGate(
  period: { startDate: Date | null; endDate: Date | null } | null,
  date: Date,
): GenerationGate {
  if (!period) {
    return {
      ok: false,
      code: "UNREGISTERED",
      message:
        "This academic period is not registered. Register it on Settings with a start and end date before generating attendance.",
    };
  }
  if (!period.startDate || !period.endDate) {
    return {
      ok: false,
      code: "DATES_NOT_CONFIGURED",
      message:
        "This academic period has no semester start/end dates. Configure both dates on Settings before generating attendance.",
    };
  }
  if (date < period.startDate || date > period.endDate) {
    return {
      ok: false,
      code: "OUTSIDE_PERIOD",
      message: `The selected date (${formatISODate(date)}) is outside the configured semester (${formatISODate(
        period.startDate,
      )} to ${formatISODate(period.endDate)}). Nothing was generated.`,
    };
  }
  return { ok: true };
}

// Narrow a printable range to the configured semester. Returns null when the
// requested range does not overlap the semester at all. When the period has no
// dates, the requested range is returned unchanged with a warning in `reason`.
export function clampRangeToPeriod(
  period: { startDate: Date | null; endDate: Date | null } | null,
  start: Date,
  end: Date,
): { start: Date; end: Date; excludedDays: number; reason: string | null } | null {
  if (!period?.startDate || !period.endDate) return { start, end, excludedDays: 0, reason: null };
  const clippedStart = start < period.startDate ? period.startDate : start;
  const clippedEnd = end > period.endDate ? period.endDate : end;
  if (clippedStart > clippedEnd) return null;
  const excludedDays =
    Math.max(0, Math.round((clippedStart.getTime() - start.getTime()) / 86400000)) +
    Math.max(0, Math.round((end.getTime() - clippedEnd.getTime()) / 86400000));
  return {
    start: clippedStart,
    end: clippedEnd,
    excludedDays,
    reason:
      excludedDays > 0
        ? `Only dates inside the configured semester (${formatISODate(
            period.startDate,
          )} to ${formatISODate(period.endDate)}) were generated. ${excludedDays} date${
            excludedDays === 1 ? "" : "s"
          } outside the semester ${excludedDays === 1 ? "was" : "were"} excluded.`
        : null,
  };
}

// Warn (never silently fall back) when requested attendance dates fall outside
// the configured semester. Returns null when the period has no known boundary.
export function periodRangeWarning(
  period: { startDate: Date | null; endDate: Date | null } | null,
  start: Date,
  end: Date,
): string | null {
  if (!period) return "The selected academic period is not configured.";
  if (!period.startDate || !period.endDate) {
    return "This academic period has no semester dates configured, so the requested dates cannot be checked against it.";
  }
  if (start < period.startDate || end > period.endDate) {
    return `The requested dates (${formatISODate(start)} to ${formatISODate(end)}) fall outside the configured semester (${formatISODate(period.startDate)} to ${formatISODate(period.endDate)}). Nothing was changed automatically.`;
  }
  return null;
}

type PeriodRow = {
  schoolYear: string;
  semester: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string | null;
};

function toRecord(row: PeriodRow): AcademicPeriodRecord {
  return {
    schoolYear: row.schoolYear,
    semester: row.semester,
    startDate: row.startDate,
    endDate: row.endDate,
    status: isPeriodStatus(row.status) ? row.status : null,
    configured: true,
  };
}

// Merge configured periods with terms that only exist on schedule slots or in
// import history (for example data created before this table existed). The
// merged entries are marked unconfigured and need review.
export async function listAcademicPeriods(): Promise<AcademicPeriodRecord[]> {
  const [rows, slotTerms, batchTerms] = await Promise.all([
    prisma.academicPeriod.findMany({
      orderBy: [{ schoolYear: "asc" }, { semester: "asc" }],
    }),
    prisma.scheduleSlot.findMany({
      where: { schoolYear: { not: null }, semester: { not: null } },
      distinct: ["schoolYear", "semester"],
      select: { schoolYear: true, semester: true },
    }),
    prisma.importBatch.findMany({
      distinct: ["schoolYear", "semester"],
      select: { schoolYear: true, semester: true },
    }),
  ]);

  const byKey = new Map<string, AcademicPeriodRecord>();
  for (const row of rows) {
    byKey.set(periodKey(row.schoolYear, row.semester), toRecord(row));
  }
  for (const term of [...slotTerms, ...batchTerms]) {
    const schoolYear = term.schoolYear?.trim();
    const semester = normalizeSemester(term.semester);
    if (!schoolYear || !semester) continue;
    const key = periodKey(schoolYear, semester);
    if (!byKey.has(key)) {
      byKey.set(key, {
        schoolYear: formatSchoolYear(schoolYear),
        semester,
        startDate: null,
        endDate: null,
        status: null,
        configured: false,
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) =>
      a.schoolYear.localeCompare(b.schoolYear) || a.semester.localeCompare(b.semester),
  );
}

export async function getAcademicPeriod(
  schoolYear: string,
  semester: string,
): Promise<AcademicPeriodRecord | null> {
  const year = formatSchoolYear(schoolYear);
  const sem = normalizeSemester(semester) ?? semester;
  const row = await prisma.academicPeriod.findUnique({
    where: { schoolYear_semester: { schoolYear: year, semester: sem } },
  });
  if (row) return toRecord(row);
  const periods = await listAcademicPeriods();
  return (
    periods.find((p) => p.schoolYear === year && p.semester === sem) ?? null
  );
}

// Persist a reviewed period. `allowPartial` keeps legacy callers working while
// still refusing malformed input.
export async function saveAcademicPeriod(input: {
  schoolYear: string;
  semester: string;
  startDate: Date | null;
  endDate: Date | null;
  status: AcademicPeriodStatus | null;
}): Promise<AcademicPeriodRecord> {
  const row = await prisma.academicPeriod.upsert({
    where: {
      schoolYear_semester: {
        schoolYear: input.schoolYear,
        semester: input.semester,
      },
    },
    update: {
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
    },
    create: {
      schoolYear: input.schoolYear,
      semester: input.semester,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
    },
  });
  return toRecord(row);
}

export function semesterOptions(): readonly SemesterOption[] {
  return SEMESTER_OPTIONS;
}
