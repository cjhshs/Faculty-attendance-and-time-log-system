import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { backupDirectory } from "@/lib/backup";
import { getOperationalCounts, getPreservedCounts } from "@/lib/reset";
import { ResetClient } from "./ResetClient";

export default async function SystemResetPage() {
  await requirePermission(PERMISSIONS.SYSTEM_RESET);

  const [operational, preserved] = await Promise.all([
    getOperationalCounts(prisma),
    getPreservedCounts(prisma),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">System Reset</h1>
        <p className="page-subtitle">
          Back up and clear operational data, or restore the default roles, permissions and
          settings. Both actions are logged in the audit trail.
        </p>
      </div>

      <ResetClient
        operational={operational}
        preserved={preserved}
        backupDir={backupDirectory()}
      />
    </div>
  );
}
