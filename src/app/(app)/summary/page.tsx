import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getCollegeOptions, normalizeScopeSelection } from "@/lib/colleges";
import { buildSummary } from "@/lib/summary";
import { cutoffRange, parseISODate, todayUtc, formatLong } from "@/lib/dates";
import { getActiveTerm, listTerms, parseTerm, isValidTerm } from "@/lib/terms";
import { getAcademicPeriod, periodRangeWarning } from "@/lib/academic-period";
import { formatISODate } from "@/lib/dates";
import { ScrollArea } from "../ScrollArea";
import { CollegeCourseFilter } from "../CollegeCourseFilter";
import { PersistForm } from "../PersistForm";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    program?: string;
    college?: string;
    department?: string;
    q?: string;
    year?: string;
    sem?: string;
    faculty?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.SUMMARY_VIEW);
  const params = await searchParams;
  const def = cutoffRange();
  const [activeTerm, terms] = await Promise.all([getActiveTerm(), listTerms()]);
  const years = Array.from(new Set(terms.map((t) => t.schoolYear)));
  const selectedYear = params.year ?? activeTerm.schoolYear;
  const selectedSem = params.sem ?? activeTerm.semester;
  const selectedTerm =
    selectedYear === "all" || selectedSem === "all"
      ? null
      : parseTerm(selectedYear, selectedSem);
  if (selectedYear !== "all" && selectedSem !== "all" && !isValidTerm(selectedTerm)) {
    return (
      <div className="alert alert-error">
        The requested school year and semester are not a valid academic period. Nothing was
        summarized and no other term was substituted.
      </div>
    );
  }

  const start = parseISODate(params.start ?? null) ?? def.start;
  const end = parseISODate(params.end ?? null) ?? def.end;
  if (start > end) {
    return (
      <div className="alert alert-error">
        The start date must not be later than the end date.
      </div>
    );
  }

  const q = (params.q ?? "").trim().toLowerCase();
  const department = (params.department ?? "").trim();
  const [courses, collegeOptions, unassignedFaculty] = await Promise.all([
    getCourses(),
    getCollegeOptions(),
    prisma.faculty.count({ where: { departmentId: null } }),
  ]);
  const scope = normalizeScopeSelection(collegeOptions, {
    college: params.college,
    program: params.program,
  });
  const course = scope.program ? courses.find((c) => c.code === scope.program) : undefined;
  const scopedCourseIds = department
    ? null
    : scope.program
      ? courses.filter((c) => c.code === scope.program).map((c) => c.id)
      : scope.college === "unassigned"
        ? courses.filter((c) => c.collegeId == null).map((c) => c.id)
        : scope.college
          ? courses.filter((c) => c.college?.code === scope.college).map((c) => c.id)
          : null;
  const departmentName =
    department === "unassigned"
      ? "Faculty without a department"
      : department
        ? collegeOptions.colleges.find((c) => c.code === department)?.name ?? department
        : null;
  const scopeLabel = departmentName
    ? `${department} — ${departmentName} (faculty roster)`
    : course
      ? `${course.code}${course.college ? ` — ${course.college.name}` : ""}`
      : scope.college === "unassigned"
        ? `Unassigned programs (${scopedCourseIds?.length ?? 0})`
        : scope.college
          ? `${scope.college} — ${collegeOptions.colleges.find((c) => c.code === scope.college)?.name ?? ""} (${scopedCourseIds?.length ?? 0} program(s))`
          : "All colleges";
  // Distinguish "nobody scheduled in this range" from "this department has no
  // reviewed roster members yet", so an empty table is never mistaken for zero
  // attendance.
  const departmentFacultyCount = department
    ? department === "unassigned"
      ? unassignedFaculty
      : await prisma.faculty.count({ where: { department: { code: department } } })
    : null;
  const summary = await buildSummary(start, end, scopedCourseIds ?? undefined, selectedTerm, {
    departmentCode: department || null,
  });
  const period = selectedTerm
    ? await getAcademicPeriod(selectedTerm.schoolYear, selectedTerm.semester)
    : null;
  const boundaryWarning = selectedTerm
    ? periodRangeWarning(period, start, end)
    : null;
  const shownFaculty = q
    ? summary.faculty.filter((f) => f.name.toLowerCase().includes(q))
    : summary.faculty;

  const qs = new URLSearchParams({
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    ...(course ? { program: course.code } : {}),
    ...(scope.college ? { college: scope.college } : {}),
    ...(department ? { department } : {}),
    ...(selectedTerm
      ? { schoolYear: selectedTerm.schoolYear, semester: selectedTerm.semester }
      : {}),
  });

  const facultyFilterId = Number(params.faculty);
  const selectedFaculty =
    Number.isInteger(facultyFilterId) && facultyFilterId > 0
      ? summary.faculty.find((f) => f.facultyId === facultyFilterId) ?? null
      : null;
  const individualPrintHref = selectedFaculty
    ? `/summary/print?${new URLSearchParams({
        ...Object.fromEntries(qs),
        faculty: String(selectedFaculty.facultyId),
        autoprint: "1",
      }).toString()}`
    : null;
  const showAllHref = (() => {
    const next = new URLSearchParams(qs);
    next.delete("faculty");
    return `/summary?${next.toString()}`;
  })();

  const canPrint = hasPermission(user, PERMISSIONS.SUMMARY_PRINT);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Attendance Summary</h1>
          {selectedFaculty ? (
            <p className="page-subtitle">
              Individual summary · {selectedFaculty.name}
              {selectedFaculty.department ? ` · ${selectedFaculty.department}` : " · no department"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canPrint ? (
            <Link
              href={`/summary/print?${qs.toString()}`}
              className="btn"
              title="Print every faculty member in this range"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M6 2.75A.75.75 0 016.75 2h6.5a.75.75 0 01.75.75V5h1.25A2.25 2.25 0 0117.5 7.25v5A2.25 2.25 0 0115.25 14H15v2.25a.75.75 0 01-.75.75h-8.5a.75.75 0 01-.75-.75V14h-.25A2.25 2.25 0 012.5 11.75v-5A2.25 2.25 0 014.75 5H6V2.75zM7.5 5h5V3.5h-5V5zm-.25 4.5a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5zM7 13.25v2.25h6v-3.5H7v1.25z" />
              </svg>
              Print all
            </Link>
          ) : null}
          {canPrint && selectedFaculty && individualPrintHref ? (
            <Link
              href={individualPrintHref}
              className="btn"
              title={`Print ${selectedFaculty.name} only`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M6 2.75A.75.75 0 016.75 2h6.5a.75.75 0 01.75.75V5h1.25A2.25 2.25 0 0117.5 7.25v5A2.25 2.25 0 0115.25 14H15v2.25a.75.75 0 01-.75.75h-8.5a.75.75 0 01-.75-.75V14h-.25A2.25 2.25 0 012.5 11.75v-5A2.25 2.25 0 014.75 5H6V2.75zM7.5 5h5V3.5h-5V5zm-.25 4.5a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5zM7 13.25v2.25h6v-3.5H7v1.25z" />
              </svg>
              Print this faculty
            </Link>
          ) : null}
          {selectedFaculty ? (
            <Link href={showAllHref} className="btn">
              Show all faculty
            </Link>
          ) : null}
          {hasPermission(user, PERMISSIONS.SUMMARY_EXPORT) && (
            <a href={`/api/summary/export?${qs.toString()}`} className="btn btn-primary">
              Export to Excel
            </a>
          )}
        </div>
      </div>

      {selectedTerm ? (
        <div className="rounded-md border border-line bg-white px-3 py-2 text-xs">
          <strong>Academic period:</strong> {selectedTerm.schoolYear} · {selectedTerm.semester}
          {period?.startDate && period.endDate
            ? ` · ${formatISODate(period.startDate)} to ${formatISODate(period.endDate)}`
            : period
              ? " · semester dates not configured"
              : " · not registered"}
        </div>
      ) : null}

      {boundaryWarning ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {boundaryWarning}
        </div>
      ) : null}

      <PersistForm storageKey="fa:filter:summary" className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="start">
            Start date
          </label>
          <input id="start" type="date" name="start" defaultValue={start.toISOString().slice(0, 10)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="end">
            End date
          </label>
          <input id="end" type="date" name="end" defaultValue={end.toISOString().slice(0, 10)} className="input" />
        </div>
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
          idPrefix="summary"
        />
        <div>
          <label className="label" htmlFor="summary-department">
            Faculty department
          </label>
          <select
            id="summary-department"
            name="department"
            defaultValue={department}
            className="input"
          >
            <option value="">All departments</option>
            {collegeOptions.colleges.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
            {collegeOptions.unassigned.length > 0 || unassignedFaculty > 0 ? (
              <option value="unassigned">No department yet ({unassignedFaculty})</option>
            ) : null}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">
            Find faculty
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search faculty name..."
            className="input"
          />
        </div>
        <button className="btn btn-primary" type="submit">
          View
        </button>
      </PersistForm>

      <p className="text-sm text-muted">
        Range: <strong>{formatLong(start)}</strong> to <strong>{formatLong(end)}</strong> —{" "}
        <strong>{scopeLabel}</strong>.{" "}
        {selectedTerm
          ? `Term: ${selectedTerm.schoolYear} · ${selectedTerm.semester}.`
          : "All semesters."}{" "}
        Generated {todayUtc().toISOString().slice(0, 10)}.
      </p>
      {summary.incomplete.length > 0 ? (
        <div className="alert alert-warn block">
          <p className="font-semibold">
            Incomplete attendance: {summary.incomplete.length} date/program scope(s) are not encoded.
          </p>
          <p className="mt-1">
            These are excluded from absent hours (they are not absences). Encode them for a complete
            evaluation:
          </p>
          <p className="mt-1 text-xs">
            {summary.incomplete.map((i) => `${i.date} ${i.course}`).join("; ")}
          </p>
        </div>
      ) : (
        <div className="alert alert-success">
          All scheduled date/program scopes in this range are encoded.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Faculty" value={summary.totals.facultyCount} />
        <Stat label="Encoded scheduled hours" value={summary.totals.scheduledHours} />
        <Stat label="Present hours" value={summary.totals.presentHours} tone="green" />
        <Stat label="Absent hours" value={summary.totals.absentHours} tone="red" />
        <Stat label="Not yet encoded" value={summary.totals.unencodedHours} />
      </div>

      {selectedFaculty ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Total absent
              </p>
              <p className="mt-1 text-4xl font-extrabold leading-none text-red-700">
                {selectedFaculty.absentHours}
                <span className="ml-1 text-base font-semibold">hrs</span>
              </p>
              <p className="mt-2 text-xs text-red-800">
                {selectedFaculty.absentDays} day{selectedFaculty.absentDays === 1 ? "" : "s"}{" "}
                classified absent. Only explicitly marked absences are counted.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
              <Stat label="Present hours" value={selectedFaculty.presentHours} tone="green" />
              <Stat label="Present days" value={selectedFaculty.presentDays} />
              <Stat label="Partial days" value={selectedFaculty.partialDays} />
              <Stat label="Absent days" value={selectedFaculty.absentDays} tone="red" />
              <Stat label="Scheduled hours" value={selectedFaculty.encodedScheduledHours} />
              <Stat label="Not yet encoded" value={selectedFaculty.unencodedHours} />
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Daily breakdown</h2>
              <span className="text-xs text-muted">
                {selectedFaculty.department ?? "No department assigned"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Program</th>
                    <th scope="col">Scheduled hrs</th>
                    <th scope="col">Present hrs</th>
                    <th scope="col">Absent hrs</th>
                    <th scope="col">Not encoded</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFaculty.daily.map((row) => (
                    <tr key={`${row.date}-${row.course}`}>
                      <td className="whitespace-nowrap">{row.date}</td>
                      <td>{row.course}</td>
                      <td className="text-center">{row.scheduledHours}</td>
                      <td className="text-center text-green-700">{row.presentHours}</td>
                      <td className="text-center text-red-700">{row.absentHours}</td>
                      <td className="text-center text-zinc-600">{row.unencodedHours}</td>
                      <td>
                        {row.encoded ? (
                          <span className="badge bg-green-100 text-green-800">Encoded</span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-800">
                            Not fully encoded
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {selectedFaculty.daily.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted">
                        No scheduled class for this faculty member in the selected range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {selectedFaculty.reasons.length > 0 ? (
            <div className="card">
              <h2 className="mb-2 section-title">Absence reasons</h2>
              <ul className="space-y-1 text-sm">
                {selectedFaculty.reasons.map((r, i) => (
                  <li key={`${r.date}-${i}`}>
                    <strong>{r.date}</strong> ({r.course}): {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <ScrollArea className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Faculty</th>
                <th scope="col">Department</th>
                <th scope="col">Scheduled hrs</th>
                <th scope="col">Present hrs</th>
                <th scope="col">Absent hrs</th>
                <th scope="col">Not encoded</th>
                <th scope="col">Present days</th>
                <th scope="col">Absent days</th>
                <th scope="col">Partial days</th>
                <th scope="col" className="text-right">
                  Print
                </th>
              </tr>
            </thead>
            <tbody>
              {shownFaculty.map((f) => (
                <tr key={f.facultyId}>
                  <td className="whitespace-nowrap font-medium">
                    <Link
                      href={`/summary?${new URLSearchParams({
                        ...Object.fromEntries(qs),
                        faculty: String(f.facultyId),
                      }).toString()}`}
                      className="text-navy underline-offset-2 hover:underline"
                      title={`Open the individual summary for ${f.name}`}
                    >
                      {f.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-xs text-muted">
                    {f.department ?? "No department"}
                  </td>
                  <td className="text-center">{f.encodedScheduledHours}</td>
                  <td className="text-center text-green-700">{f.presentHours}</td>
                  <td className="text-center text-red-700">{f.absentHours}</td>
                  <td className="text-center text-zinc-600">{f.unencodedHours}</td>
                  <td className="text-center">{f.presentDays}</td>
                  <td className="text-center">{f.absentDays}</td>
                  <td className="text-center">{f.partialDays}</td>
                  <td className="text-right">
                    {canPrint ? (
                      <Link
                        href={`/summary/print?${new URLSearchParams({
                          ...Object.fromEntries(qs),
                          faculty: String(f.facultyId),
                          autoprint: "1",
                        }).toString()}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-navy hover:bg-slate-100"
                        title={`Print the individual summary for ${f.name}`}
                        aria-label={`Print the individual summary for ${f.name}`}
                      >
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <path d="M6 2.75A.75.75 0 016.75 2h6.5a.75.75 0 01.75.75V5h1.25A2.25 2.25 0 0117.5 7.25v5A2.25 2.25 0 0115.25 14H15v2.25a.75.75 0 01-.75.75h-8.5a.75.75 0 01-.75-.75V14h-.25A2.25 2.25 0 012.5 11.75v-5A2.25 2.25 0 014.75 5H6V2.75zM7.5 5h5V3.5h-5V5zm-.25 4.5a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5zM7 13.25v2.25h6v-3.5H7v1.25z" />
                        </svg>
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
              {shownFaculty.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-muted">
                    {q
                      ? "No faculty match your search."
                      : department && departmentFacultyCount === 0
                        ? department === "unassigned"
                          ? "Every registered faculty member already has a department, so there is nobody in this scope."
                          : `No registered faculty belong to ${department} yet. Assign departments on Master Data before summarizing it.`
                        : "No scheduled faculty in this range."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {params.faculty && !selectedFaculty ? (
        <div className="alert alert-warn block">
          The requested faculty member is not in this summary scope. Nothing was substituted; use
          Show all faculty or search again.
        </div>
      ) : null}

      {!selectedFaculty && summary.faculty.some((f) => f.reasons.length > 0) ? (
        <div className="card">
          <h2 className="mb-2 section-title">Absence reasons</h2>
          <ul className="space-y-1 text-sm">
            {summary.faculty.flatMap((f) =>
              f.reasons.map((r, i) => (
                <li key={`${f.facultyId}-${i}`}>
                  <strong>{f.name}</strong> — {r.date} ({r.course}): {r.reason}
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
}) {
  const toneClass =
    tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-navy";
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={"mt-1 text-2xl font-bold " + toneClass}>{value}</p>
    </div>
  );
}
