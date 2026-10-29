"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings, setSetting, setSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import {
  getAcademicPeriod,
  isPeriodStatus,
  saveAcademicPeriod,
  validatePeriodInput,
} from "@/lib/academic-period";
import { formatSchoolYear, normalizeSemester, parseTerm } from "@/lib/terms";
import { prisma } from "@/lib/prisma";

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

// The active term is only a default for new screens. It never rewrites stored
// data and it must already be a registered academic period, so a typo cannot
// silently point every screen at an academic period that does not exist.
export async function saveActiveTerm(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.SETTINGS_MANAGE);
  const term = parseTerm(
    String(formData.get("schoolYear") || ""),
    String(formData.get("semester") || ""),
  );
  if (!term) return { ok: false, message: "Choose a school year and semester." };

  const period = await getAcademicPeriod(term.schoolYear, term.semester);
  if (!period) {
    return {
      ok: false,
      message:
        "That academic period is not registered yet. Add it under Academic periods first; the active term is never invented.",
    };
  }

  await setSettings({
    active_school_year: term.schoolYear,
    active_semester: term.semester,
  });
  await writeAudit(
    user.id,
    "settings.active_term",
    `Active academic term set to ${term.schoolYear} ${term.semester}.`,
  );
  revalidatePath("/settings");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  revalidatePath("/schedule/import");
  return {
    ok: true,
    message: `Active term set to ${term.schoolYear} · ${term.semester}. Existing records were not changed.`,
  };
}

// Create or update one academic period. Dates are stored exactly as reviewed:
// blank dates stay NULL (unknown), never a guessed semester boundary.
export async function savePeriod(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.SETTINGS_MANAGE);
  const check = validatePeriodInput({
    schoolYear: String(formData.get("schoolYear") || ""),
    semester: String(formData.get("semester") || ""),
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
    status: String(formData.get("status") || ""),
  });
  if (!check.ok || !check.value) {
    return { ok: false, message: check.errors.join(" ") || "Invalid academic period." };
  }

  const value = check.value;
  const before = await getAcademicPeriod(value.schoolYear, value.semester);
  await saveAcademicPeriod(value);
  await writeAudit(
    user.id,
    before ? "academic_period.update" : "academic_period.create",
    `${value.schoolYear} ${value.semester}: ${
      value.startDate && value.endDate
        ? `${value.startDate.toISOString().slice(0, 10)} to ${value.endDate.toISOString().slice(0, 10)}`
        : "no semester dates"
    }${value.status ? ` (${value.status.toLowerCase()})` : ""}. No schedules or attendance rows were changed.`,
  );
  revalidatePath("/settings");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  revalidatePath("/schedule/import");

  const warning = check.warnings.length ? ` ${check.warnings.join(" ")}` : "";
  return {
    ok: true,
    message: `${before ? "Updated" : "Registered"} ${value.schoolYear} · ${value.semester}.${warning}`,
  };
}

// Promote one registered period to active without retyping the year/semester.
export async function activatePeriod(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.SETTINGS_MANAGE);
  const schoolYear = formatSchoolYear(String(formData.get("schoolYear") || ""));
  const semester = normalizeSemester(String(formData.get("semester") || ""));
  if (!schoolYear || !semester) return { ok: false, message: "Academic period is required." };
  if (!isPeriodStatus(String(formData.get("status") || "")) && formData.get("status")) {
    return { ok: false, message: "Unknown academic period status." };
  }

  const period = await getAcademicPeriod(schoolYear, semester);
  if (!period) return { ok: false, message: "Academic period not found." };

  await setSetting("active_school_year", schoolYear);
  await setSetting("active_semester", semester);
  await writeAudit(
    user.id,
    "settings.active_term",
    `Active academic term set to ${schoolYear} ${semester}.`,
  );
  revalidatePath("/settings");
  return { ok: true, message: `Active term is now ${schoolYear} · ${semester}.` };
}

// Flag exact duplicates of a faculty name. This is read-only: duplicate rows are
// reported so a human can merge them; nothing is deleted or auto-created.
export async function findDuplicateFaculty(): Promise<
  { fullName: string; count: number; ids: number[] }[]
> {
  await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const rows = await prisma.faculty.findMany({ select: { id: true, fullName: true } });
  const groups = new Map<string, { fullName: string; ids: number[] }>();
  for (const row of rows) {
    const key = row.fullName.trim().replace(/\s+/g, " ").toLowerCase();
    const group = groups.get(key) ?? { fullName: row.fullName, ids: [] };
    group.ids.push(row.id);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .filter((g) => g.ids.length > 1)
    .map((g) => ({ fullName: g.fullName, count: g.ids.length, ids: g.ids }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function activeTermSetting(): Promise<{ schoolYear: string; semester: string }> {
  const settings = await getSettings();
  return {
    schoolYear: formatSchoolYear(settings.active_school_year || ""),
    semester: normalizeSemester(settings.active_semester) ?? "",
  };
}
