import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  await requirePermission(PERMISSIONS.SCHEDULE_IMPORT);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Import Schedule</h1>
        <p className="text-sm text-zinc-500">
          Upload the schedule workbook, review the preview, then confirm.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
