"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { parseISODate } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; message: string };

export async function addHoliday(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.CALENDAR_MANAGE);
  const date = parseISODate(String(formData.get("date") || ""));
  const label = String(formData.get("label") || "").trim();
  if (!date) return { ok: false, message: "Choose a valid date." };
  if (!label) return { ok: false, message: "Enter a label (e.g. Holiday)." };

  const existing = await prisma.holiday.findUnique({ where: { date } });
  if (existing) {
    await prisma.holiday.update({ where: { date }, data: { label } });
    await writeAudit(user.id, "holiday.update", `Updated ${formData.get("date")}: ${label}`);
    revalidatePath("/calendar");
    return { ok: true, message: "No-class date updated." };
  }
  await prisma.holiday.create({ data: { date, label } });
  await writeAudit(user.id, "holiday.create", `Added ${formData.get("date")}: ${label}`);
  revalidatePath("/calendar");
  return { ok: true, message: "No-class date added." };
}

export async function addHolidayRange(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.CALENDAR_MANAGE);
  const start = parseISODate(String(formData.get("start") || ""));
  const end = parseISODate(String(formData.get("end") || ""));
  const label = String(formData.get("label") || "").trim();
  if (!start || !end) return { ok: false, message: "Choose a valid start and end date." };
  if (start > end) return { ok: false, message: "Start date must not be after the end date." };
  if (!label) return { ok: false, message: "Enter a label (e.g. Holiday)." };

  let count = 0;
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    await prisma.holiday.upsert({
      where: { date: d },
      update: { label },
      create: { date: d, label },
    });
    count++;
  }
  await writeAudit(user.id, "holiday.range", `Added ${count} no-class day(s): ${label}`);
  revalidatePath("/calendar");
  return { ok: true, message: `Added ${count} no-class date(s).` };
}

export async function deleteHoliday(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.CALENDAR_MANAGE);
  const id = Number(formData.get("id"));
  const row = await prisma.holiday.findUnique({ where: { id } });
  if (!row) return { ok: false, message: "Not found." };
  await prisma.holiday.delete({ where: { id } });
  await writeAudit(user.id, "holiday.delete", `Removed no-class date ${row.date.toISOString().slice(0, 10)}`);
  revalidatePath("/calendar");
  return { ok: true, message: "No-class date removed." };
}
