import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "../ActionForm";
import { saveSettings } from "./actions";

export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const settings = await getSettings();
  const [facultyCount, roomCount, courseCount] = await Promise.all([
    prisma.faculty.count(),
    prisma.room.count(),
    prisma.course.count(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
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
        <h2 className="mb-2 section-title">Master lists</h2>
        <p className="text-sm text-muted">
          {facultyCount} faculty, {courseCount} programs, {roomCount} rooms. Manage them on the{" "}
          <a href="/master" className="text-navy-2 underline">
            Master Data
          </a>{" "}
          page.
        </p>
      </div>
    </div>
  );
}
