import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { buildSummary } from "@/lib/summary";
import { cutoffRange, parseISODate, formatLong } from "@/lib/dates";
import { getActiveTerm, parseTerm, isValidTerm } from "@/lib/terms";
import { getCollegeOptions, normalizeScopeSelection } from "@/lib/colleges";
import { AutoPrint } from "../../attendance/AutoPrint";
import { PrintButton } from "../../attendance/PrintButton";

export default async function SummaryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    program?: string;
    college?: string;
    department?: string;
    faculty?: string;
    schoolYear?: string;
    semester?: string;
    autoprint?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.SUMMARY_PRINT);
  void user;
  const params = await searchParams;
  const def = cutoffRange();
  const start = parseISODate(params.start ?? null) ?? def.start;
  const end = parseISODate(params.end ?? null) ?? def.end;

  const collegeOptions = await getCollegeOptions();
  const department = (params.department ?? "").trim();
  const scope = normalizeScopeSelection(collegeOptions, {
    college: params.college,
    program: params.program,
  });
  const course = scope.program
    ? { code: scope.program, name: collegeOptions.all.find((p) => p.code === scope.program)?.name ?? null }
    : null;
  const scopedCourseIds = department
    ? null
    : scope.program
      ? collegeOptions.all.filter((p) => p.code === scope.program).map((p) => p.id)
      : scope.college === "unassigned"
        ? collegeOptions.unassigned.map((p) => p.id)
        : scope.college
          ? collegeOptions.colleges.find((c) => c.code === scope.college)?.programs.map((p) => p.id) ?? []
          : null;
  const collegeName =
    scope.college === "unassigned"
      ? "Unassigned programs"
      : scope.college
        ? collegeOptions.colleges.find((c) => c.code === scope.college)?.name ?? null
        : null;
  const facultyFilter = params.faculty ? Number(params.faculty) : null;

  const activeTerm = await getActiveTerm();
  const selectedTerm =
    params.schoolYear && params.semester
      ? parseTerm(params.schoolYear, params.semester)
      : activeTerm;
  if (
    params.schoolYear &&
    params.semester &&
    (!selectedTerm || !isValidTerm(selectedTerm))
  ) {
    return (
      <div className="alert alert-error">
        The requested school year and semester are not a valid academic period. Nothing was
        printed and no other term was substituted.
      </div>
    );
  }

  const summary = await buildSummary(start, end, scopedCourseIds ?? undefined, selectedTerm, {
    departmentCode: department || null,
  });
  const settings = await getSettings();
  const selectedFaculty =
    facultyFilter != null ? summary.faculty.find((f) => f.facultyId === facultyFilter) ?? null : null;
  const rows = facultyFilter ? summary.faculty.filter((f) => f.facultyId === facultyFilter) : summary.faculty;

  const generated = new Date().toISOString().slice(0, 10);

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
  const allPrintHref = `/summary/print?${qs.toString()}`;
  const individualPrintHref = selectedFaculty
    ? `/summary/print?${new URLSearchParams({
        ...Object.fromEntries(qs),
        faculty: String(selectedFaculty.facultyId),
      }).toString()}`
    : null;
  const backHref = selectedFaculty && individualPrintHref
    ? `/summary?${new URLSearchParams({
        ...Object.fromEntries(qs),
        faculty: String(selectedFaculty.facultyId),
      }).toString()}`
    : `/summary?${qs.toString()}`;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="btn">
          Back to summary
        </Link>
        <div className="flex flex-wrap gap-2">
          {selectedFaculty ? (
            <Link href={allPrintHref} className="btn" title="Print every faculty member in this range">
              Print all
            </Link>
          ) : null}
          <PrintButton
            variant="inline"
            label={selectedFaculty ? `Print ${selectedFaculty.name}` : "Print summary"}
            title={
              selectedFaculty
                ? `Print the individual summary for ${selectedFaculty.name}`
                : "Print every faculty member in this range"
            }
          />
        </div>
      </div>

      <AutoPrint enabled={params.autoprint === "1"} />

      <div className="print-sheet bg-white p-4">
        <div className="text-center">
          <p className="text-sm font-bold">{settings.school_header}</p>
          <p className="text-sm font-semibold">{settings.college_header}</p>
          <p className="text-base font-bold tracking-widest">
            {selectedFaculty ? "INDIVIDUAL FACULTY ATTENDANCE SUMMARY" : "ATTENDANCE SUMMARY"}
          </p>
          {selectedFaculty ? (
            <p className="text-sm font-semibold">
              {selectedFaculty.name}
              {selectedFaculty.department ? ` — ${selectedFaculty.department}` : " — No department assigned"}
            </p>
          ) : null}
          <p className="text-xs">
            Range: {formatLong(start)} to {formatLong(end)}
            {course ? ` — Program: ${course.code}` : collegeName ? ` — College: ${collegeName}` : ""}
            {department
              ? ` — Department: ${
                  department === "unassigned"
                    ? "Faculty without a department"
                    : department
                }`
              : ""}
            {selectedTerm ? ` — ${selectedTerm.schoolYear} ${selectedTerm.semester}` : ""} |
            Generated: {generated}
          </p>
        </div>

        {summary.incomplete.length > 0 ? (
          <p className="mt-2 border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Incomplete attendance: {summary.incomplete.length} date/program scope(s) not encoded and
            excluded from absent hours. Missing entries are never counted as absences.
          </p>
        ) : null}

        {selectedFaculty ? (
          <>
            <div className="mt-3 flex flex-wrap items-stretch gap-2 text-[11px]">
              <div className="min-w-40 flex-1 border-2 border-black px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide">Total absent</p>
                <p className="text-2xl font-extrabold leading-tight">
                  {selectedFaculty.absentHours} hrs
                </p>
                <p className="text-[10px]">
                  {selectedFaculty.absentDays} day{selectedFaculty.absentDays === 1 ? "" : "s"}{" "}
                  classified absent
                </p>
              </div>
              <div className="min-w-32 flex-1 border border-black px-2 py-2">
                <p className="text-[10px]">Present hours</p>
                <p className="text-lg font-bold">{selectedFaculty.presentHours}</p>
              </div>
              <div className="min-w-32 flex-1 border border-black px-2 py-2">
                <p className="text-[10px]">Scheduled hours</p>
                <p className="text-lg font-bold">{selectedFaculty.encodedScheduledHours}</p>
              </div>
              <div className="min-w-32 flex-1 border border-black px-2 py-2">
                <p className="text-[10px]">Not yet encoded</p>
                <p className="text-lg font-bold">{selectedFaculty.unencodedHours}</p>
              </div>
              <div className="min-w-32 flex-1 border border-black px-2 py-2">
                <p className="text-[10px]">Present / partial / absent days</p>
                <p className="text-lg font-bold">
                  {selectedFaculty.presentDays} / {selectedFaculty.partialDays} /{" "}
                  {selectedFaculty.absentDays}
                </p>
              </div>
            </div>

            <table className="mt-3 w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border border-black px-1 py-0.5 text-left">Date</th>
                  <th className="border border-black px-1 py-0.5 text-left">Program</th>
                  <th className="border border-black px-1 py-0.5">Scheduled hrs</th>
                  <th className="border border-black px-1 py-0.5">Present hrs</th>
                  <th className="border border-black px-1 py-0.5">Absent hrs</th>
                  <th className="border border-black px-1 py-0.5">Not encoded</th>
                  <th className="border border-black px-1 py-0.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedFaculty.daily.map((row) => (
                  <tr key={`${row.date}-${row.course}`} className="break-inside-avoid">
                    <td className="whitespace-nowrap border border-black px-1 py-0.5">{row.date}</td>
                    <td className="border border-black px-1 py-0.5">{row.course}</td>
                    <td className="border border-black px-1 py-0.5 text-center">
                      {row.scheduledHours}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center">{row.presentHours}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{row.absentHours}</td>
                    <td className="border border-black px-1 py-0.5 text-center">
                      {row.unencodedHours}
                    </td>
                    <td className="border border-black px-1 py-0.5">
                      {row.encoded ? "Encoded" : "Not fully encoded"}
                    </td>
                  </tr>
                ))}
                {selectedFaculty.daily.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="border border-black px-1 py-2 text-center text-zinc-500"
                    >
                      No scheduled class for this faculty member in the selected range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {selectedFaculty.reasons.length > 0 ? (
              <div className="mt-4 text-[11px]">
                <p className="font-semibold">Absence reasons</p>
                <ul className="mt-1 space-y-0.5">
                  {selectedFaculty.reasons.map((r, i) => (
                    <li key={`${r.date}-${i}`}>
                      {r.date} ({r.course}): {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <table className="mt-3 w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border border-black px-1 py-0.5 text-left">Faculty</th>
                  <th className="border border-black px-1 py-0.5 text-left">Department</th>
                  <th className="border border-black px-1 py-0.5">Scheduled hrs</th>
                  <th className="border border-black px-1 py-0.5">Present hrs</th>
                  <th className="border border-black px-1 py-0.5">Absent hrs</th>
                  <th className="border border-black px-1 py-0.5">Not encoded</th>
                  <th className="border border-black px-1 py-0.5">Present days</th>
                  <th className="border border-black px-1 py-0.5">Absent days</th>
                  <th className="border border-black px-1 py-0.5">Partial days</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.facultyId} className="break-inside-avoid">
                    <td className="border border-black px-1 py-0.5">{f.name}</td>
                    <td className="border border-black px-1 py-0.5 text-[10px]">
                      {f.department ?? "No department"}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center">
                      {f.encodedScheduledHours}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center">{f.presentHours}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{f.absentHours}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{f.unencodedHours}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{f.presentDays}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{f.absentDays}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{f.partialDays}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-black px-1 py-2 text-center text-zinc-500">
                      {params.faculty
                        ? "The requested faculty member is not in this summary scope. Nothing was substituted."
                        : "No data for this range."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {rows.some((f) => f.reasons.length > 0) ? (
              <div className="mt-4 text-[11px]">
                <p className="font-semibold">Absence reasons</p>
                <ul className="mt-1 space-y-0.5">
                  {rows.flatMap((f) =>
                    f.reasons.map((r, i) => (
                      <li key={`${f.facultyId}-${i}`}>
                        {f.name} — {r.date} ({r.course}): {r.reason}
                      </li>
                    )),
                  )}
                </ul>
              </div>
            ) : null}
          </>
        )}

        <div className="mt-8 flex items-end justify-between text-[11px]">
          <div className="w-40">
            <p className="text-[10px]">Prepared by:</p>
            <p className="mt-6 border-t border-black px-1 pt-1 text-center font-semibold">
              {settings.prepared_by || "\u00a0"}
            </p>
          </div>
          <div className="ml-auto w-40">
            <p className="text-[10px]">Checked by:</p>
            <p className="mt-6 border-t border-black px-1 pt-1 text-center font-semibold">
              {settings.checked_by || "\u00a0"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
