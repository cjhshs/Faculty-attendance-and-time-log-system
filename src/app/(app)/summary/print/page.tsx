import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getCourses } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { buildSummary } from "@/lib/summary";
import { prisma } from "@/lib/prisma";
import { cutoffRange, parseISODate, formatLong } from "@/lib/dates";
import { PrintButton } from "../../attendance/PrintButton";

export default async function SummaryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; program?: string; faculty?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.SUMMARY_PRINT);
  void user;
  const params = await searchParams;
  const def = cutoffRange();
  const start = parseISODate(params.start ?? null) ?? def.start;
  const end = parseISODate(params.end ?? null) ?? def.end;

  const course = params.program ? await prisma.course.findUnique({ where: { code: params.program } }) : null;
  const facultyFilter = params.faculty ? Number(params.faculty) : null;

  const summary = await buildSummary(start, end, course?.id);
  const settings = await getSettings();
  const rows = facultyFilter
    ? summary.faculty.filter((f) => f.facultyId === facultyFilter)
    : summary.faculty;

  const generated = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href="/summary" className="btn">
          Back to summary
        </Link>
        <PrintButton label="Print summary" />
      </div>

      <div className="print-sheet bg-white p-4">
        <div className="text-center">
          <p className="text-sm font-bold">{settings.school_header}</p>
          <p className="text-sm font-semibold">{settings.college_header}</p>
          <p className="text-base font-bold tracking-widest">ATTENDANCE SUMMARY</p>
          <p className="text-xs">
            Range: {formatLong(start)} to {formatLong(end)}
            {course ? ` — Program: ${course.code}` : ""} | Generated: {generated}
          </p>
        </div>

        {summary.incomplete.length > 0 ? (
          <p className="mt-2 border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Incomplete attendance: {summary.incomplete.length} date/program scope(s) not encoded and
            excluded from absent hours.
          </p>
        ) : null}

        <table className="mt-3 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-0.5 text-left">Faculty</th>
              <th className="border border-black px-1 py-0.5">Scheduled hrs</th>
              <th className="border border-black px-1 py-0.5">Present hrs</th>
              <th className="border border-black px-1 py-0.5">Absent hrs</th>
              <th className="border border-black px-1 py-0.5">Present days</th>
              <th className="border border-black px-1 py-0.5">Absent days</th>
              <th className="border border-black px-1 py-0.5">Partial days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.facultyId} className="break-inside-avoid">
                <td className="border border-black px-1 py-0.5">{f.name}</td>
                <td className="border border-black px-1 py-0.5 text-center">
                  {f.encodedScheduledHours}
                </td>
                <td className="border border-black px-1 py-0.5 text-center">{f.presentHours}</td>
                <td className="border border-black px-1 py-0.5 text-center">{f.absentHours}</td>
                <td className="border border-black px-1 py-0.5 text-center">{f.presentDays}</td>
                <td className="border border-black px-1 py-0.5 text-center">{f.absentDays}</td>
                <td className="border border-black px-1 py-0.5 text-center">{f.partialDays}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-black px-1 py-2 text-center text-zinc-500">
                  No data for this range.
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

        <div className="mt-6 flex items-end justify-between text-[11px]">
          <div>
            <p className="text-[10px]">Prepared by:</p>
            <p className="mt-4 border-t border-black px-6 text-center font-semibold">
              {settings.prepared_by || "\u00a0"}
            </p>
          </div>
          <div>
            <p className="text-[10px]">Checked by:</p>
            <p className="mt-4 border-t border-black px-6 text-center font-semibold">
              {settings.checked_by || "\u00a0"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
