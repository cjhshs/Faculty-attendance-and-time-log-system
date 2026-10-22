import { prisma } from "@/lib/prisma";
import { UNASSIGNED_COLLEGE_VALUE } from "@/lib/college-catalog";

export type ProgramOption = {
  id: number;
  code: string;
  name: string | null;
  official: boolean;
};

export type CollegeOption = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  programs: ProgramOption[];
};

export type CollegeCatalogOptions = {
  colleges: CollegeOption[];
  unassigned: ProgramOption[];
  all: ProgramOption[];
};

// Everything the filter selectors need, in one query, with the colleges in the
// school's official order and unassigned programs kept separate.
export async function getCollegeOptions(): Promise<CollegeCatalogOptions> {
  const [colleges, courses] = await Promise.all([
    prisma.college.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.course.findMany({ orderBy: { code: "asc" } }),
  ]);

  const byCollege = new Map<number, ProgramOption[]>();
  const unassigned: ProgramOption[] = [];
  for (const c of courses) {
    const option: ProgramOption = { id: c.id, code: c.code, name: c.name, official: c.official };
    if (c.collegeId == null) {
      unassigned.push(option);
      continue;
    }
    const list = byCollege.get(c.collegeId) ?? [];
    list.push(option);
    byCollege.set(c.collegeId, list);
  }

  return {
    colleges: colleges.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      sortOrder: c.sortOrder,
      programs: byCollege.get(c.id) ?? [],
    })),
    unassigned,
    all: courses.map((c) => ({ id: c.id, code: c.code, name: c.name, official: c.official })),
  };
}

export type ScopeQuery = { college?: string | null; program?: string | null };

export const ALL_PROGRAMS = "";

// Direct links or stale bookmarks can carry a program that no longer belongs to
// the selected college. Drop the program in that case instead of returning an
// empty page; the college selection is kept.
export function normalizeScopeSelection(
  options: CollegeCatalogOptions,
  scope: ScopeQuery,
): { college: string | null; program: string | null } {
  const college = (scope.college ?? "").trim() || null;
  const program = (scope.program ?? "").trim() || null;
  if (!program) return { college, program: null };

  const inCollege =
    college === null
      ? true
      : college === UNASSIGNED_COLLEGE_VALUE
        ? options.unassigned.some((p) => p.code === program)
        : (options.colleges.find((c) => c.code === college)?.programs ?? []).some(
            (p) => p.code === program,
          );

  return inCollege ? { college, program } : { college, program: null };
}

// A where-clause fragment for ScheduleSlot queries. Selecting a college never
// widens access; it only narrows the rows a page may show.
export function slotScopeWhere(scope: ScopeQuery): Record<string, unknown> {
  const course: Record<string, unknown> = {};
  const program = (scope.program ?? "").trim();
  const college = (scope.college ?? "").trim();
  if (program) course.code = program;
  if (college === UNASSIGNED_COLLEGE_VALUE) course.collegeId = null;
  else if (college) course.college = { code: college };
  return Object.keys(course).length > 0 ? { course } : {};
}

export function sessionScopeWhere(scope: ScopeQuery): Record<string, unknown> {
  return slotScopeWhere(scope);
}

export type ScopeResolution = {
  collegeCode: string | null;
  collegeName: string | null;
  programCode: string | null;
  courseIds: number[];
  courseCodes: string[];
  label: string;
};

// Resolve a college/program selection to the concrete course ids used by the
// reporting queries. The label is what the UI prints as "current scope".
export async function resolveScope(scope: ScopeQuery): Promise<ScopeResolution> {
  const program = (scope.program ?? "").trim();
  const college = (scope.college ?? "").trim();

  const where = program
    ? { code: program }
    : college === UNASSIGNED_COLLEGE_VALUE
      ? { collegeId: null }
      : college
        ? { college: { code: college } }
        : {};

  const courses = await prisma.course.findMany({
    where: program || college ? where : undefined,
    select: { id: true, code: true, name: true, college: { select: { code: true, name: true } } },
    orderBy: { code: "asc" },
  });

  const collegeEntry = courses.find((c) => c.college)?.college ?? null;
  const collegeCode =
    college === UNASSIGNED_COLLEGE_VALUE ? UNASSIGNED_COLLEGE_VALUE : college || collegeEntry?.code || null;
  const collegeName =
    college === UNASSIGNED_COLLEGE_VALUE ? "Unassigned programs" : collegeEntry?.name ?? null;

  const label = program
    ? `${program}${collegeEntry ? ` — ${collegeEntry.name}` : ""}`
    : college === UNASSIGNED_COLLEGE_VALUE
      ? `Unassigned programs (${courses.length})`
      : collegeCode && collegeName
        ? `${collegeCode} — ${collegeName} (${courses.length} program${courses.length === 1 ? "" : "s"})`
        : `All colleges (${courses.length} program${courses.length === 1 ? "" : "s"})`;

  return {
    collegeCode,
    collegeName,
    programCode: program || null,
    courseIds: courses.map((c) => c.id),
    courseCodes: courses.map((c) => c.code),
    label,
  };
}

export function collegeTag(name: string | null | undefined): string {
  if (!name) return "Unassigned";
  const short = name
    .replace(/^College of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return short || name;
}
