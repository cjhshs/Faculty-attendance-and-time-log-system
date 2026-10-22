"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { createDatabaseBackup } from "@/lib/backup";
import {
  RESET_CONFIRMATION_PHRASE,
  clearOperationalData,
  getOperationalCounts,
  totalOperational,
  type OperationalCounts,
} from "@/lib/reset";
import { ensureReferenceData, type ReferenceDataStats } from "@/lib/reference-data";

export type ResetState = {
  ok: boolean;
  message: string;
  counts?: OperationalCounts;
  backupFile?: string;
};

export type RestoreState = {
  ok: boolean;
  message: string;
  stats?: ReferenceDataStats;
};

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/schedule/import");
  revalidatePath("/schedule/repair");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  revalidatePath("/summary/print");
  revalidatePath("/calendar");
  revalidatePath("/system-reset");
}

export async function resetOperationalData(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SYSTEM_RESET);
  } catch {
    return { ok: false, message: "You do not have permission to reset operational data." };
  }

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== RESET_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      message: `Type ${RESET_CONFIRMATION_PHRASE} exactly to confirm the reset.`,
    };
  }

  const before = await getOperationalCounts(prisma);
  if (totalOperational(before) === 0) {
    return { ok: false, message: "There is no operational data to reset." };
  }

  const backup = await createDatabaseBackup();
  if (!backup.ok) {
    return {
      ok: false,
      message: `Reset cancelled — the safety backup could not be created. ${backup.message} Nothing was deleted.`,
    };
  }

  try {
    const counts = await clearOperationalData(prisma);
    await writeAudit(
      user.id,
      "system.reset_operational",
      `Reset operational data: ${counts.attendance} attendance record(s), ${counts.sessions} session(s), ${counts.scheduleSlots} schedule slot(s), ${counts.importBatches} import batch(es), ${counts.repairFindings} repair finding(s), ${counts.repairSources} repair source(s). Backup: ${path.basename(backup.file)}.`,
    );
    revalidateAll();
    return {
      ok: true,
      message: "Operational data was reset. A database backup was saved before the reset.",
      counts,
      backupFile: backup.file,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      message: `Reset failed and was rolled back. ${detail} Backup: ${backup.file}`,
    };
  }
}

export async function restoreDefaultReferenceData(): Promise<RestoreState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SYSTEM_RESET);
  } catch {
    return { ok: false, message: "You do not have permission to restore reference data." };
  }

  try {
    const stats = await prisma.$transaction((tx) => ensureReferenceData(tx), {
      timeout: 60_000,
      maxWait: 15_000,
    });
    await writeAudit(
      user.id,
      "system.restore_reference",
      `Restored default reference data: ${stats.rolePermissionsAdded} role permission(s) and ${stats.settingsAdded} setting(s) added; existing records kept.`,
    );
    revalidatePath("/", "layout");
    revalidatePath("/system-reset");
    return {
      ok: true,
      message:
        "Default roles, permissions and settings are in place. Existing records were not changed or deleted.",
      stats,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Could not restore reference data: ${detail}` };
  }
}
