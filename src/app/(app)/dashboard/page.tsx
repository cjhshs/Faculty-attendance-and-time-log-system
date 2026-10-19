import Link from "next/link";
import { requireUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cutoffRange, formatLong } from "@/lib/dates";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const { start, end } = cutoffRange();

  const [facultyCount, programCount, slotCount, holidayCount] = await Promise.all([
    prisma.faculty.count({ where: { active: true } }),
    prisma.course.count(),
    prisma.scheduleSlot.count(),
    prisma.holiday.count(),
  ]);

  const cards = [
    { label: "Active faculty", value: facultyCount, href: "/master" },
    { label: "Programs", value: programCount, href: "/master" },
    { label: "Schedule slots", value: slotCount, href: "/schedule" },
    { label: "No-class dates", value: holidayCount, href: "/calendar" },
  ];

  return (
    <div className="space-y-6">
      {denied ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You do not have permission to open that page.
        </div>
      ) : null}

      <div>
        <h1 className="text-xl font-bold text-zinc-900">Welcome, {user.name}</h1>
        <p className="text-sm text-zinc-500">
          Current cutoff: {formatLong(start)} &mdash; {formatLong(end)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card hover:border-blue-300">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{card.value}</p>
          </Link>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-3 text-base font-semibold">Daily workflow</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>Choose a date and program, then print the attendance sheet.</li>
          <li>After the working students return the paper, encode the check marks.</li>
          <li>Save the attendance for that date and program.</li>
          <li>Open the summary to review a cutoff and export it to Excel.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          {hasPermission(user, PERMISSIONS.ATTENDANCE_PRINT) && (
            <Link href="/attendance/print" className="btn btn-primary">
              Print attendance sheet
            </Link>
          )}
          {hasPermission(user, PERMISSIONS.ATTENDANCE_ENCODE) && (
            <Link href="/attendance/encode" className="btn">
              Encode attendance
            </Link>
          )}
          {hasPermission(user, PERMISSIONS.SUMMARY_VIEW) && (
            <Link href="/summary" className="btn">
              Attendance summary
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
