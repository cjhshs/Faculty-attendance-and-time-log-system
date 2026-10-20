"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { normaliseFacultyName, surnameOf } from "@/lib/schedule-parser";
import { writeAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; message: string };

export async function createFaculty(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const raw = String(formData.get("fullName") || "");
  const fullName = normaliseFacultyName(raw);
  if (!fullName) return { ok: false, message: "Faculty name is required." };
  const exists = await prisma.faculty.findFirst({
    where: { fullName: { equals: fullName, mode: "insensitive" } },
  });
  if (exists) return { ok: false, message: "That faculty name already exists." };
  const row = await prisma.faculty.create({ data: { fullName, surname: surnameOf(fullName) } });
  await writeAudit(user.id, "faculty.create", `Created faculty #${row.id} ${fullName}`);
  revalidatePath("/master");
  return { ok: true, message: `Added ${fullName}.` };
}

export async function updateFacultyName(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  const fullName = normaliseFacultyName(String(formData.get("fullName") || ""));
  if (!id || !fullName) return { ok: false, message: "Faculty name is required." };
  await prisma.faculty.update({ where: { id }, data: { fullName, surname: surnameOf(fullName) } });
  await writeAudit(user.id, "faculty.update", `Renamed faculty #${id} to ${fullName}`);
  revalidatePath("/master");
  return { ok: true, message: "Faculty updated." };
}

export async function toggleFaculty(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  const row = await prisma.faculty.findUnique({ where: { id } });
  if (!row) return { ok: false, message: "Faculty not found." };
  await prisma.faculty.update({ where: { id }, data: { active: !row.active } });
  await writeAudit(user.id, "faculty.toggle", `Faculty #${id} active=${!row.active}`);
  revalidatePath("/master");
  return { ok: true, message: row.active ? "Faculty deactivated." : "Faculty activated." };
}

export async function createCourse(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const name = String(formData.get("name") || "").trim() || null;
  if (!code) return { ok: false, message: "Program code is required." };
  const exists = await prisma.course.findUnique({ where: { code } });
  if (exists) return { ok: false, message: "That program already exists." };
  await prisma.course.create({ data: { code, name } });
  await writeAudit(user.id, "course.create", `Created program ${code}`);
  revalidatePath("/master");
  return { ok: true, message: `Added program ${code}.` };
}

export async function updateCourse(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim() || null;
  await prisma.course.update({ where: { id }, data: { name } });
  await writeAudit(user.id, "course.update", `Updated program #${id}`);
  revalidatePath("/master");
  return { ok: true, message: "Program updated." };
}

export async function deleteCourse(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) return { ok: false, message: "Program not found." };

  const [slots, sessions] = await Promise.all([
    prisma.scheduleSlot.count({ where: { courseId: id } }),
    prisma.attendanceSession.count({ where: { courseId: id } }),
  ]);
  if (slots > 0 || sessions > 0) {
    const parts: string[] = [];
    if (slots > 0) parts.push(`${slots} schedule slot(s)`);
    if (sessions > 0) parts.push(`${sessions} attendance record set(s)`);
    return {
      ok: false,
      message: `Cannot delete program ${course.code}: it is referenced by ${parts.join(
        " and ",
      )}. Remove those records first to preserve historical data.`,
    };
  }

  await prisma.course.delete({ where: { id } });
  await writeAudit(user.id, "course.delete", `Deleted program #${id} ${course.code}`);
  revalidatePath("/master");
  return { ok: true, message: `Deleted program ${course.code}.` };
}

export async function createRoom(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const type = String(formData.get("type") || "PHYSICAL") as "PHYSICAL" | "ONLINE" | "TBA";
  if (!code) return { ok: false, message: "Room code is required." };
  const exists = await prisma.room.findUnique({ where: { code } });
  if (exists) return { ok: false, message: "That room already exists." };
  await prisma.room.create({ data: { code, type } });
  await writeAudit(user.id, "room.create", `Created room ${code}`);
  revalidatePath("/master");
  return { ok: true, message: `Added room ${code}.` };
}

export async function deleteRoom(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  const used = await prisma.scheduleSlot.count({ where: { roomId: id } });
  if (used > 0)
    return { ok: false, message: `Room is used by ${used} schedule slot(s) and cannot be deleted.` };
  await prisma.room.delete({ where: { id } });
  await writeAudit(user.id, "room.delete", `Deleted room #${id}`);
  revalidatePath("/master");
  return { ok: true, message: "Room deleted." };
}
