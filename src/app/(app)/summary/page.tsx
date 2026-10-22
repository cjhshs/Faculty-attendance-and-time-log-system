import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { getCollegeOptions, normalizeScopeSelection } from "@/lib/colleges";
import { buildSummary } from "@/lib/summary";
import { cutoffRange, parseISODate, todayUtc, formatLong } from "@/lib/dates";
import { getActiveTerm, listTerms, parseTerm } from "@/lib/terms";
import { ScrollArea } from "../ScrollArea";
import { CollegeCourseFilter } from "../CollegeCourseFilter";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    program?: string;
    college?: string;
    q?: string;
    year?: string;
    sem?: string;
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
  const [courses, collegeOptions] = await Promise.all([getCourses(), getCollegeOptions()]);
  const scope = normalizeScopeSelection(collegeOptions, {
    college: params.college,
    program: params.program,
  });
  const course = scope.program ? courses.find((c) => c.code === scope.program) : undefined;
  const scopedCourseIds = scope.program
    ? courses.filter((c) => c.code === scope.program).map((c) => c.id)
    : scope.college === "unassigned"
      ? courses.filter((c) => c.collegeId == null).map((c) => c.id)
      : scope.college
        ? courses.filter((c) => c.college?.code === scope.college).map((c) => c.id)
        : null;
  const scopeLabel = course
    ? `${course.code}${course.college ? ` — ${course.college.name}` : ""}`
    : scope.college === "unassigned"
      ? `Unassigned programs (${scopedCourseIds?.length ?? 0})`
      : scope.college
        ? `${scope.college} — ${collegeOptions.colleges.find((c) => c.code === scope.college)?.name ?? ""} (${scopedCourseIds?.length ?? 0} program(s))`
        : "All colleges";
  const summary = await buildSummary(start, end, scopedCourseIds ?? undefined, selectedTerm);
  const shownFaculty = q
    ? summary.faculty.filter((f) => f.name.toLowerCase().includes(q))
    : summary.faculty;

  const qs = new URLSearchParams({
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    ...(course ? { program: course.code } : {}),
    ...(scope.college ? { college: scope.college } : {}),
    ...(selectedTerm
      ? { schoolYear: selectedTerm.schoolYear, semester: selectedTerm.semester }
      : {}),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Attendance Summary</h1>
        <div className="flex gap-2">
          {hasPermission(user, PERMISSIONS.SUMMARY_PRINT) && (
            <Link href={`/summary/print?${qs.toString()}`} className="btn">
              Print summary
            </Link>
          )}
          {hasPermission(user, PERMISSIONS.SUMMARY_EXPORT) && (
            <a href={`/api/summary/export?${qs.toString()}`} className="btn btn-primary">
              Export to Excel
            </a>
          )}
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-4" method="get">
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
      </form>

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Faculty" value={summary.totals.facultyCount} />
        <Stat label="Encoded scheduled hours" value={summary.totals.scheduledHours} />
        <Stat label="Present hours" value={summary.totals.presentHours} tone="green" />
        <Stat label="Absent hours" value={summary.totals.absentHours} tone="red" />
      </div>

      <ScrollArea className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Faculty</th>
              <th scope="col">Scheduled hrs</th>
              <th scope="col">Present hrs</th>
              <th scope="col">Absent hrs</th>
              <th scope="col">Present days</th>
              <th scope="col">Absent days</th>
              <th scope="col">Partial days</th>
            </tr>
          </thead>
          <tbody>
            {shownFaculty.map((f) => (
              <tr key={f.facultyId}>
                <td className="whitespace-nowrap font-medium">{f.name}</td>
                <td className="text-center">{f.encodedScheduledHours}</td>
                <td className="text-center text-green-700">{f.presentHours}</td>
                <td className="text-center text-red-700">{f.absentHours}</td>
                <td className="text-center">{f.presentDays}</td>
                <td className="text-center">{f.absentDays}</td>
                <td className="text-center">{f.partialDays}</td>
              </tr>
            ))}
            {shownFaculty.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  {q ? "No faculty match your search." : "No scheduled faculty in this range."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollArea>

      {summary.faculty.some((f) => f.reasons.length > 0) ? (
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
