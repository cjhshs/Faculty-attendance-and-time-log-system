import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { buildSummary } from "@/lib/summary";
import { cutoffRange, parseISODate, todayUtc, formatLong } from "@/lib/dates";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; program?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.SUMMARY_VIEW);
  const params = await searchParams;
  const def = cutoffRange();

  const start = parseISODate(params.start ?? null) ?? def.start;
  const end = parseISODate(params.end ?? null) ?? def.end;
  if (start > end) {
    return (
      <div className="card text-sm text-red-700">
        The start date must not be later than the end date.
      </div>
    );
  }

  const courses = await getCourses();
  const course = params.program ? courses.find((c) => c.code === params.program) : undefined;
  const summary = await buildSummary(start, end, course?.id);

  const qs = new URLSearchParams({
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    ...(course ? { program: course.code } : {}),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Attendance Summary</h1>
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
          <label className="label" htmlFor="program">
            Program
          </label>
          <select id="program" name="program" defaultValue={course?.code ?? ""} className="input">
            <option value="">All programs</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          View
        </button>
      </form>

      <p className="text-sm text-zinc-500">
        Range: <strong>{formatLong(start)}</strong> to <strong>{formatLong(end)}</strong>
        {course ? ` — program ${course.code}` : " — all programs"}. Generated{" "}
        {todayUtc().toISOString().slice(0, 10)}.
      </p>

      {summary.incomplete.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          All scheduled date/program scopes in this range are encoded.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Faculty" value={summary.totals.facultyCount} />
        <Stat label="Encoded scheduled hours" value={summary.totals.scheduledHours} />
        <Stat label="Present hours" value={summary.totals.presentHours} tone="green" />
        <Stat label="Absent hours" value={summary.totals.absentHours} tone="red" />
      </div>

      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Faculty</th>
              <th>Scheduled hrs</th>
              <th>Present hrs</th>
              <th>Absent hrs</th>
              <th>Present days</th>
              <th>Absent days</th>
              <th>Partial days</th>
            </tr>
          </thead>
          <tbody>
            {summary.faculty.map((f) => (
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
            {summary.faculty.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-zinc-400">
                  No scheduled faculty in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {summary.faculty.some((f) => f.reasons.length > 0) ? (
        <div className="card">
          <h2 className="mb-2 text-base font-semibold">Absence reasons</h2>
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
    tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-zinc-900";
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={"mt-1 text-2xl font-bold " + toneClass}>{value}</p>
    </div>
  );
}
