import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import { listAcademicPeriods, PERIOD_STATUS_OPTIONS } from "@/lib/academic-period";
import { formatISODate } from "@/lib/dates";
import { getActiveTerm, SEMESTER_OPTIONS } from "@/lib/terms";
import {
  activatePeriod,
  activeTermSetting,
  saveActiveTerm,
  savePeriod,
  saveSettings,
} from "./actions";

const PERIOD_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  ARCHIVED: "Archived",
};

export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const settings = await getSettings();
  const [facultyCount, roomCount, courseCount, periods, activeTerm, savedActive] =
    await Promise.all([
      prisma.faculty.count(),
      prisma.room.count(),
      prisma.course.count(),
      listAcademicPeriods(),
      getActiveTerm(),
      activeTermSetting(),
    ]);

  const unassignedFaculty = await prisma.faculty.count({ where: { departmentId: null } });

  // Counts are shown so an administrator can see which periods actually hold
  // data before archiving or changing a boundary. They are read-only.
  const periodKeys = periods.map((p) => ({ schoolYear: p.schoolYear, semester: p.semester }));
  const [slotCounts, batchCounts] = await Promise.all([
    prisma.scheduleSlot.groupBy({
      by: ["schoolYear", "semester"],
      where: { schoolYear: { not: null }, semester: { not: null } },
      _count: { _all: true },
    }),
    prisma.importBatch.groupBy({
      by: ["schoolYear", "semester"],
      _count: { _all: true },
    }),
  ]);
  const slotMap = new Map(
    slotCounts.map((row) => [`${row.schoolYear}|${row.semester}`, row._count._all]),
  );
  const batchMap = new Map(
    batchCounts.map((row) => [`${row.schoolYear}|${row.semester}`, row._count._all]),
  );
  const usedKeys = new Set([...slotMap.keys(), ...batchMap.keys()]);

  const years = Array.from(new Set(periods.map((p) => p.schoolYear)));
  for (const [key] of usedKeys) {
    const [year] = key.split("|");
    if (year && !years.includes(year)) years.push(year);
  }
  if (!years.includes(activeTerm.schoolYear)) years.push(activeTerm.schoolYear);
  years.sort();

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <h2 className="mb-3 section-title">School header and signatories</h2>
        <ActionForm action={saveSettings} submitLabel="Save settings">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="school_header">
                School header
              </label>
              <input id="school_header" name="school_header" className="input" defaultValue={settings.school_header} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="college_header">
                College header
              </label>
              <input id="college_header" name="college_header" className="input" defaultValue={settings.college_header} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="address">
                Address
              </label>
              <input id="address" name="address" className="input" defaultValue={settings.address} />
            </div>
            <div>
              <label className="label" htmlFor="prepared_by">
                Default &quot;Prepared by&quot;
              </label>
              <input id="prepared_by" name="prepared_by" className="input" defaultValue={settings.prepared_by} />
            </div>
            <div>
              <label className="label" htmlFor="checked_by">
                Default &quot;Checked by&quot;
              </label>
              <input id="checked_by" name="checked_by" className="input" defaultValue={settings.checked_by} />
            </div>
            <div>
              <label className="label" htmlFor="school_logo">
                School logo (URL or /path)
              </label>
              <input id="school_logo" name="school_logo" className="input" defaultValue={settings.school_logo} />
            </div>
            <div>
              <label className="label" htmlFor="college_logo">
                College logo (URL or /path)
              </label>
              <input id="college_logo" name="college_logo" className="input" defaultValue={settings.college_logo} />
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2 className="mb-1 section-title">Active academic term</h2>
        <p className="mb-3 text-xs text-muted">
          New encode, print and import screens open on this term. Changing it only changes a
          default; no schedule or attendance record is moved.
        </p>
        <ActionForm action={saveActiveTerm} submitLabel="Set active term">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="active-year">
                School year
              </label>
              <select
                id="active-year"
                name="schoolYear"
                className="input"
                defaultValue={activeTerm.schoolYear}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="active-semester">
                Semester
              </label>
              <select
                id="active-semester"
                name="semester"
                className="input"
                defaultValue={activeTerm.semester}
              >
                {SEMESTER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">
          Stored default: {savedActive.schoolYear || "not set"} · {savedActive.semester || "not set"}.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-1 section-title">Academic periods ({periods.length})</h2>
        <p className="mb-3 text-xs text-muted">
          Schedules and attendance generation are anchored to these periods. Semester dates are
          optional; when they are missing, requested dates are still allowed but a warning is shown.
          Dates are never guessed from imported data.
        </p>

        <ActionForm action={savePeriod} submitLabel="Register period" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label req" htmlFor="period-year">
                School year
              </label>
              <input
                id="period-year"
                name="schoolYear"
                className="input"
                placeholder="2026-2027"
                required
              />
            </div>
            <div>
              <label className="label req" htmlFor="period-semester">
                Semester
              </label>
              <select id="period-semester" name="semester" className="input" defaultValue="">
                <option value="">Choose semester</option>
                {SEMESTER_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="period-start">
                Semester start (optional)
              </label>
              <input id="period-start" type="date" name="startDate" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="period-end">
                Semester end (optional)
              </label>
              <input id="period-end" type="date" name="endDate" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="period-status">
                Status (optional)
              </label>
              <select id="period-status" name="status" className="input" defaultValue="">
                <option value="">Not set</option>
                {PERIOD_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Enter both dates or leave both blank. A 14–366 day span is required when dates are
            supplied.
          </p>
        </ActionForm>

        <div className="mt-5 overflow-x-auto">
          <table className="data-table min-w-[42rem]">
            <thead>
              <tr>
                <th scope="col">School year</th>
                <th scope="col">Semester</th>
                <th scope="col">Dates</th>
                <th scope="col">Status</th>
                <th scope="col">Data</th>
                <th scope="col" aria-label="Edit period"></th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const key = `${p.schoolYear}|${p.semester}`;
                const slots = slotMap.get(key) ?? 0;
                const batches = batchMap.get(key) ?? 0;
                const isActive = activeTerm.schoolYear === p.schoolYear && activeTerm.semester === p.semester;
                return (
                  <tr key={key}>
                    <td className="whitespace-nowrap font-medium">
                      {p.schoolYear}
                      {isActive ? (
                        <span className="ml-2 badge bg-green-100 text-green-800">Active</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">{p.semester}</td>
                    <td className="whitespace-nowrap text-xs">
                      {p.startDate && p.endDate ? (
                        `${formatISODate(p.startDate)} → ${formatISODate(p.endDate)}`
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">Not configured</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {p.status ? (
                        PERIOD_STATUS_LABEL[p.status] ?? p.status
                      ) : (
                        <span className="text-muted">Not set</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted">
                      {slots} schedule slot{slots === 1 ? "" : "s"} · {batches} import
                      {batches === 1 ? "" : "s"}
                    </td>
                    <td className="min-w-[22rem]">
                      <details>
                        <summary className="cursor-pointer text-xs underline">Edit period</summary>
                        <div className="mt-2 space-y-2">
                          <ActionForm action={savePeriod} submitLabel="Save period">
                            <input type="hidden" name="schoolYear" value={p.schoolYear} />
                            <input type="hidden" name="semester" value={p.semester} />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <label className="label" htmlFor={`start-${p.schoolYear}-${p.semester}`}>
                                  Start
                                </label>
                                <input
                                  id={`start-${p.schoolYear}-${p.semester}`}
                                  type="date"
                                  name="startDate"
                                  className="input"
                                  defaultValue={p.startDate ? formatISODate(p.startDate) : ""}
                                />
                              </div>
                              <div>
                                <label className="label" htmlFor={`end-${p.schoolYear}-${p.semester}`}>
                                  End
                                </label>
                                <input
                                  id={`end-${p.schoolYear}-${p.semester}`}
                                  type="date"
                                  name="endDate"
                                  className="input"
                                  defaultValue={p.endDate ? formatISODate(p.endDate) : ""}
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="label" htmlFor={`status-${p.schoolYear}-${p.semester}`}>
                                  Status
                                </label>
                                <select
                                  id={`status-${p.schoolYear}-${p.semester}`}
                                  name="status"
                                  className="input"
                                  defaultValue={p.status ?? ""}
                                >
                                  <option value="">Not set</option>
                                  {PERIOD_STATUS_OPTIONS.map((s) => (
                                    <option key={s.value} value={s.value}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </ActionForm>
                          {p.configured && !isActive ? (
                            <ActionButton
                              action={activatePeriod}
                              label="Make active"
                              fields={{ schoolYear: p.schoolYear, semester: p.semester }}
                            />
                          ) : null}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No academic periods yet. Register the first one above; existing schedules are
                    not changed.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {periods.some((p) => !p.configured) ? (
          <p className="mt-2 text-xs text-amber-800">
            {periods.filter((p) => !p.configured).length} period
            {periods.filter((p) => !p.configured).length === 1 ? " is" : "s are"} only present in
            old schedules or import history. Review their dates above so attendance generation can
            check semester boundaries.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2 className="mb-2 section-title">Master lists</h2>
        <p className="text-sm text-muted">
          {facultyCount} faculty, {courseCount} programs, {roomCount} rooms. Manage them on the{" "}
          <Link href="/master" className="text-navy-2 underline">
            Master Data
          </Link>{" "}
          page.
        </p>
        {unassignedFaculty > 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            {unassignedFaculty} faculty member{unassignedFaculty === 1 ? "" : "s"} still have no
            department. Department sheets exclude them until reviewed; bulk assignment is available
            on Master Data.
          </p>
        ) : null}
      </div>

      {periodKeys.length === 0 ? null : (
        <p className="text-xs text-muted">
          Periods hold {slotCounts.reduce((n, row) => n + row._count._all, 0)} schedule slot(s) and{" "}
          {batchCounts.reduce((n, row) => n + row._count._all, 0)} import batch(es). No period change
          deletes or rewrites them.
        </p>
      )}
    </div>
  );
}
