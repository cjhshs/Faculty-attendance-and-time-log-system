import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

// A "term" is an academic year + semester pair. Existing data all lives in the
// active term, so scoping queries by term leaves current behaviour unchanged
// until a second term is imported.

export const SEMESTER_OPTIONS = ["1st Semester", "2nd Semester", "Summer"] as const;
export type SemesterOption = (typeof SEMESTER_OPTIONS)[number];

export type Term = { schoolYear: string; semester: string };

export const DEFAULT_SCHOOL_YEAR = "2026-2027";
export const DEFAULT_SEMESTER = "1st Semester";

// Map the many spellings found in source workbooks ("1st Sem", "First Semester",
// "Midyear", ...) to the canonical semester labels used by the system.
export function normalizeSemester(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (/^1(st)?\b/.test(lower) || lower === "1" || lower.includes("first")) return "1st Semester";
  if (/^2(nd)?\b/.test(lower) || lower === "2" || lower.includes("second")) return "2nd Semester";
  if (/^3(rd)?\b/.test(lower) || lower === "3" || /summer|midyear|mid-year/.test(lower)) return "Summer";
  return s;
}

export function isValidSchoolYear(value: string): boolean {
  return /^\d{4}\s*[-–]\s*\d{4}$/.test(value.trim());
}

export function formatSchoolYear(value: string): string {
  return value.replace(/\s*[-–]\s*/, "-").trim();
}

export async function getActiveTerm(): Promise<{ schoolYear: string; semester: string }> {
  const settings = await getSettings();
  const fallback = await firstTermInDb();
  const schoolYear = formatSchoolYear(
    settings.active_school_year ||
      fallback?.schoolYear ||
      DEFAULT_SCHOOL_YEAR,
  );
  const semester =
    normalizeSemester(settings.active_semester) ?? fallback?.semester ?? DEFAULT_SEMESTER;
  return { schoolYear, semester };
}

async function firstTermInDb(): Promise<{ schoolYear: string; semester: string } | null> {
  const row = await prisma.scheduleSlot.findFirst({
    where: { schoolYear: { not: null }, semester: { not: null } },
    select: { schoolYear: true, semester: true },
    orderBy: [{ schoolYear: "asc" }, { semester: "asc" }],
  });
  if (!row?.schoolYear || !row.semester) return null;
  return { schoolYear: row.schoolYear, semester: row.semester };
}

export async function listTerms(): Promise<{ schoolYear: string; semester: string }[]> {
  // Terms come from three sources: schedules that already exist, import
  // history, and explicitly registered academic periods. A configured period
  // must stay selectable even before any schedule is imported into it.
  const [slotRows, periodRows] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: { schoolYear: { not: null }, semester: { not: null } },
      distinct: ["schoolYear", "semester"],
      select: { schoolYear: true, semester: true },
    }),
    prisma.academicPeriod.findMany({
      select: { schoolYear: true, semester: true },
    }),
  ]);
  const byKey = new Map<string, { schoolYear: string; semester: string }>();
  const add = (schoolYear: string | null, semester: string | null) => {
    if (!schoolYear || !semester) return;
    const year = formatSchoolYear(schoolYear);
    const sem = normalizeSemester(semester) ?? semester;
    byKey.set(`${year}|${sem}`, { schoolYear: year, semester: sem });
  };
  for (const row of slotRows) add(row.schoolYear, row.semester);
  for (const row of periodRows) add(row.schoolYear, row.semester);
  const active = await getActiveTerm();
  add(active.schoolYear, active.semester);
  return Array.from(byKey.values()).sort(
    (a, b) => a.schoolYear.localeCompare(b.schoolYear) || a.semester.localeCompare(b.semester),
  );
}

export async function listSchoolYears(): Promise<string[]> {
  const terms = await listTerms();
  return Array.from(new Set(terms.map((t) => t.schoolYear))).sort();
}

export function termWhere(term: { schoolYear: string; semester: string } | null | undefined) {
  if (!term) return {};
  return { schoolYear: term.schoolYear, semester: term.semester };
}

export function parseTerm(
  year: string | undefined | null,
  semester: string | undefined | null,
): { schoolYear: string; semester: string } | null {
  const y = (year ?? "").trim();
  const s = normalizeSemester(semester) ?? (semester ?? "").trim();
  if (!y || !s) return null;
  return { schoolYear: formatSchoolYear(y), semester: s };
}

// An explicit academic period must be a real school year and one of the three
// supported semesters. Callers use this to refuse an invalid URL parameter
// instead of quietly substituting the active term.
export function isValidTerm(
  term: { schoolYear: string; semester: string } | null | undefined,
): term is { schoolYear: string; semester: string } {
  return (
    !!term &&
    isValidSchoolYear(term.schoolYear) &&
    (SEMESTER_OPTIONS as readonly string[]).includes(term.semester)
  );
}
