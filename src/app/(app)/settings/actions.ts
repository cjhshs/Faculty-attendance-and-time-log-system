"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { setSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; message: string };

const KEYS = [
  "school_header",
  "college_header",
  "address",
  "prepared_by",
  "checked_by",
  "school_logo",
  "college_logo",
];

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.SETTINGS_MANAGE);
  const values: Record<string, string> = {};
  for (const key of KEYS) {
    values[key] = String(formData.get(key) || "").trim();
  }
  await setSettings(values);
  await writeAudit(user.id, "settings.update", "Updated school header and signatory names.");
  revalidatePath("/settings");
  return { ok: true, message: "Settings saved." };
}
