import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCourses, getFaculty, getRooms } from "@/lib/data";
import { WEEKDAY_NAMES } from "@/lib/dates";
import { getActiveTerm, listTerms, normalizeSemester, parseTerm, termWhere } from "@/lib/terms";
import {
  getCollegeOptions,
  normalizeScopeSelection,
  slotScopeWhere,
} from "@/lib/colleges";
import { ScrollArea } from "../ScrollArea";
import { CollegeCourseFilter } from "../CollegeCourseFilter";
import { ScheduleTable, type ScheduleRowData } from "./ScheduleTable";
import { TermTools } from "./TermTools";
import { ClearSchedules } from "./ClearSchedules";

const PAGE_SIZE = 100;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    program?: string;
    college?: string;
    day?: string;
    q?: string;
    page?: string;
    year?: string;
    sem?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.FACULTY_VIEW);
  const canEdit = hasPermission(user, PERMISSIONS.SCHEDULE_EDIT);
  const canImport = hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT);
  const params = await searchParams;
  const [courses, facultyList, rooms, activeTerm, terms, collegeOptions] = await Promise.all([
    getCourses(),
    getFaculty(),
    getRooms(),
    getActiveTerm(),
    listTerms(),
    getCollegeOptions(),
  ]);

  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const scope = normalizeScopeSelection(collegeOptions, {
    college: params.college,
    program: params.program,
  });

  const years = Array.from(new Set(terms.map((t) => t.schoolYear)));
  const selectedYear = params.year ?? activeTerm.schoolYear;
  const selectedSem = params.sem ?? activeTerm.semester;
  const selectedTerm = parseTerm(selectedYear, selectedSem);

  const filters: Record<string, unknown>[] = [];
  if (selectedTerm) filters.push(termWhere(selectedTerm));
  filters.push(slotScopeWhere(scope));
  if (params.day !== undefined && params.day !== "") filters.push({ weekday: Number(params.day) });
  if (q) {
    filters.push({
      OR: [
        { cn: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { section: { contains: q, mode: "insensitive" } },
        { room: { code: { contains: q, mode: "insensitive" } } },
        { faculty: { fullName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where = filters.length > 0 ? { AND: filters } : {};

  const [total, slots] = await Promise.all([
    prisma.scheduleSlot.count({ where }),
    prisma.scheduleSlot.findMany({
      where,
      include: { faculty: true, room: true, course: true },
      orderBy: [{ course: { code: "asc" } }, { weekday: "asc" }, { startTime: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const slotIds = slots.map((s) => s.id);
  const attendanceCounts = slotIds.length
    ? await prisma.attendance.groupBy({
        by: ["slotId"],
        where: { slotId: { in: slotIds } },
        _count: { _all: true },
      })
    : [];
  const countBySlot = new Map(attendanceCounts.map((c) => [c.slotId, c._count._all]));

  const importBatches = canEdit
    ? await prisma.importBatch.findMany({
        where: selectedTerm
          ? { schoolYear: selectedTerm.schoolYear, semester: selectedTerm.semester }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { importedBy: { select: { name: true } } },
      })
    : [];
  const batchOptions = importBatches.map((b) => ({
    id: b.id,
    label: `#${b.id} · ${b.filename} · ${new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(b.createdAt)} · ${b.slotCount} slot(s)${b.importedBy ? ` · ${b.importedBy.name}` : ""}`,
  }));

  const rows: ScheduleRowData[] = slots.map((s) => ({
    id: s.id,
    cn: s.cn,
    subject: s.subject,
    description: s.description,
    units: s.units,
    section: s.section,
    yearLevel: s.yearLevel,
    termType: s.termType,
    semester: s.semester,
    courseId: s.courseId,
    facultyId: s.facultyId,
    weekday: s.weekday,
    startTime: s.startTime,
    endTime: s.endTime,
    roomId: s.roomId,
    mode: s.mode,
    attendanceCount: countBySlot.get(s.id) ?? 0,
  }));

  const courseOptions = courses.map((c) => ({ id: c.id, label: c.code }));
  const facultyOptions = facultyList.map((f) => ({ id: f.id, label: f.fullName }));
  const roomOptions = rooms.map((r) => ({ id: r.id, code: r.code, type: r.type }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseQuery = new URLSearchParams();
  if (params.year) baseQuery.set("year", params.year);
  if (params.sem) baseQuery.set("sem", params.sem);
  if (scope.college) baseQuery.set("college", scope.college);
  if (scope.program) baseQuery.set("program", scope.program);
  if (params.day !== undefined && params.day !== "") baseQuery.set("day", params.day);
  if (q) baseQuery.set("q", q);
  const pageHref = (target: number) => {
    const next = new URLSearchParams(baseQuery);
    if (target > 1) next.set("page", String(target));
    const s = next.toString();
    return s ? `/schedule?${s}` : "/schedule";
  };

  const importHref = selectedTerm
    ? `/schedule/import?schoolYear=${encodeURIComponent(
        selectedTerm.schoolYear,
      )}&semester=${encodeURIComponent(selectedTerm.semester)}`
    : "/schedule/import";

  const activeCollege = scope.college
    ? collegeOptions.colleges.find((c) => c.code === scope.college) ?? null
    : null;
  const activeProgram = scope.program
    ? collegeOptions.all.find((p) => p.code === scope.program) ?? null
    : null;
  const scopeLabel = scope.program
    ? `${scope.program}${activeProgram?.name ? ` — ${activeProgram.name}` : ""}`
    : scope.college === "unassigned"
      ? `Unassigned programs (${collegeOptions.unassigned.length})`
      : activeCollege
        ? `${activeCollege.code} — ${activeCollege.name} (${activeCollege.programs.length} program${
            activeCollege.programs.length === 1 ? "" : "s"
          })`
        : `All colleges (${collegeOptions.all.length} programs)`;
  const hasScope = Boolean(scope.college || scope.program);
  const clearHref = (() => {
    const next = new URLSearchParams();
    if (params.year) next.set("year", params.year);
    if (params.sem) next.set("sem", params.sem);
    if (params.day !== undefined && params.day !== "") next.set("day", params.day);
    if (q) next.set("q", q);
    const s = next.toString();
    return s ? `/schedule?${s}` : "/schedule";
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="text-sm text-muted">
            {selectedTerm
              ? `${selectedTerm.schoolYear} · ${selectedTerm.semester}`
              : "All academic years and semesters"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {total} slot{total === 1 ? "" : "s"}
          </span>
          {canImport ? (
            <Link className="btn btn-primary" href={importHref}>
              Import schedules
            </Link>
          ) : null}
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="label" htmlFor="year">
            Academic year
          </label>
          <select id="year" name="year" defaultValue={selectedYear} className="input">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            <option value="all">All years</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sem">
            Semester
          </label>
          <select id="sem" name="sem" defaultValue={selectedSem} className="input">
            <option value="1st Semester">1st Semester</option>
            <option value="2nd Semester">2nd Semester</option>
            <option value="Summer">Summer</option>
            <option value="all">All semesters</option>
          </select>
        </div>
        <CollegeCourseFilter
          colleges={collegeOptions.colleges}
          unassigned={collegeOptions.unassigned}
          college={scope.college ?? ""}
          program={scope.program ?? ""}
          idPrefix="schedule"
        />
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
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search faculty, CN, subject, section, room..."
            className="input"
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>

      <p className="text-xs text-muted">
        Scope: <strong>{scopeLabel}</strong> · {total} matching slot{total === 1 ? "" : "s"}.
        {hasScope ? (
          <Link className="ml-2 underline" href={clearHref}>
            Clear filters
          </Link>
        ) : null}
      </p>

      <ScrollArea className="card">
        <ScheduleTable
          rows={rows}
          faculty={facultyOptions}
          rooms={roomOptions}
          courses={courseOptions}
          canEdit={canEdit}
          emptyMessage={
            q || hasScope || params.day
              ? "No schedule slots match your filters."
              : selectedTerm
                ? `No schedules for ${selectedTerm.schoolYear} ${selectedTerm.semester}. Import a schedule first.`
                : "No schedule slots. Import a schedule first."
          }
        />
      </ScrollArea>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className="btn" href={pageHref(page - 1)}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="btn" href={pageHref(page + 1)}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      {canEdit ? (
        <TermTools
          sourceYear={selectedTerm?.schoolYear ?? activeTerm.schoolYear}
          sourceSemester={
            normalizeSemester(selectedSem) ?? selectedTerm?.semester ?? activeTerm.semester
          }
          years={years}
        />
      ) : null}

      {canEdit ? (
        <ClearSchedules selectedTerm={selectedTerm} batches={batchOptions} />
      ) : null}
    </div>
  );
}
