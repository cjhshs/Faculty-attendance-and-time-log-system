"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { normaliseFacultyName, surnameOf } from "@/lib/schedule-parser";
import { writeAudit } from "@/lib/audit";
import {
  groupSuggestionsByCollege,
  planAutoDepartmentAssignments,
} from "@/lib/faculty-auto-department";

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
  const rawDepartment = String(formData.get("departmentId") || "").trim();
  const departmentId = rawDepartment ? Number(rawDepartment) : null;
  if (departmentId !== null && !Number.isInteger(departmentId)) {
    return { ok: false, message: "Invalid department." };
  }
  if (departmentId !== null) {
    const college = await prisma.college.findUnique({ where: { id: departmentId } });
    if (!college) return { ok: false, message: "Department not found." };
  }
  const row = await prisma.faculty.create({
    data: { fullName, surname: surnameOf(fullName), departmentId },
  });
  await writeAudit(
    user.id,
    "faculty.create",
    `Created faculty #${row.id} ${fullName}${departmentId ? ` (department #${departmentId})` : ""}`,
  );
  revalidatePath("/master");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  return { ok: true, message: `Added ${fullName}.` };
}

// Assign (or clear) a faculty member's official department. Only this roster
// field decides attendance membership; the programs they teach never do. A
// change is audited and never rewrites schedules or attendance.
export async function updateFacultyDepartment(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  if (!id) return { ok: false, message: "Faculty is required." };

  const raw = String(formData.get("departmentId") || "").trim();
  const departmentId = raw ? Number(raw) : null;
  if (departmentId !== null && !Number.isInteger(departmentId)) {
    return { ok: false, message: "Invalid department." };
  }

  const [faculty, college] = await Promise.all([
    prisma.faculty.findUnique({ where: { id } }),
    departmentId ? prisma.college.findUnique({ where: { id: departmentId } }) : Promise.resolve(null),
  ]);
  if (!faculty) return { ok: false, message: "Faculty not found." };
  if (departmentId !== null && !college) return { ok: false, message: "Department not found." };

  await prisma.faculty.update({ where: { id }, data: { departmentId } });
  await writeAudit(
    user.id,
    "faculty.department",
    `${faculty.fullName} department set to ${college ? college.code : "unassigned"}`,
  );
  revalidatePath("/master");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  return {
    ok: true,
    message: `${faculty.fullName} assigned to ${college ? `${college.code} — ${college.name}` : "No department"}.`,
  };
}

// Bulk-assign a reviewed set of roster rows to one department. Rows that already
// have a department are skipped unless the reviewer explicitly asks to
// overwrite them. Nothing is created, merged or deleted.
export async function assignFacultyDepartmentBulk(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const ids = Array.from(
    new Set(
      formData
        .getAll("facultyIds")
        .map((value) => Number(value))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
  if (ids.length === 0) {
    return { ok: false, message: "Select at least one faculty member." };
  }

  const raw = String(formData.get("departmentId") || "").trim();
  const departmentId = raw ? Number(raw) : null;
  if (departmentId === null) return { ok: false, message: "Choose a department." };
  if (!Number.isInteger(departmentId)) return { ok: false, message: "Invalid department." };

  const college = await prisma.college.findUnique({ where: { id: departmentId } });
  if (!college) return { ok: false, message: "Department not found." };

  const overwrite = String(formData.get("overwrite") || "") === "1";
  const rows = await prisma.faculty.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, departmentId: true },
  });
  if (rows.length === 0) return { ok: false, message: "No matching faculty found." };

  const targets = rows.filter((row) => overwrite || row.departmentId == null);
  const skipped = rows.length - targets.length;

  if (targets.length > 0) {
    await prisma.faculty.updateMany({
      where: { id: { in: targets.map((row) => row.id) } },
      data: { departmentId },
    });
    await writeAudit(
      user.id,
      "faculty.department.bulk",
      `Bulk assigned ${targets.length} faculty to ${college.code}.` +
        (skipped ? ` Skipped ${skipped} with an existing department.` : ""),
    );
  }

  revalidatePath("/master");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");

  if (targets.length === 0) {
    return {
      ok: false,
      message: `No changes: all ${skipped} selected faculty already have a department. Tick "Overwrite existing" to replace it.`,
    };
  }
  return {
    ok: true,
    message: `Assigned ${targets.length} faculty to ${college.code} — ${college.name}.${
      skipped
        ? ` Skipped ${skipped} that already had a department.`
        : ""
    }`,
  };
}

// Apply the conservative automatic suggestions computed from each unassigned
// faculty member's complete schedule. Only unresolved rows with exactly one
// mapped college are written; manual assignments are never overwritten.
export async function autoAssignFacultyDepartments(): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);

  const rows = await prisma.faculty.findMany({
    select: {
      id: true,
      fullName: true,
      departmentId: true,
      slots: {
        select: {
          course: {
            select: {
              college: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });

  const plan = planAutoDepartmentAssignments(
    rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      departmentId: row.departmentId,
      colleges: row.slots.map((slot) => slot.course.college),
    })),
  );

  let assigned = 0;
  const groups = groupSuggestionsByCollege(plan.suggestions);
  for (const [collegeId, facultyIds] of groups) {
    const result = await prisma.faculty.updateMany({
      where: { id: { in: facultyIds }, departmentId: null },
      data: { departmentId: collegeId },
    });
    assigned += result.count;
  }

  if (assigned > 0) {
    await writeAudit(
      user.id,
      "faculty.department.auto",
      `Auto-assigned ${assigned} faculty from unambiguous schedules. ${plan.unresolved.length} left unassigned for review. Manual departments were not changed.`,
    );
    revalidatePath("/master");
    revalidatePath("/attendance/encode");
    revalidatePath("/attendance/print");
    revalidatePath("/summary");
  }

  const remaining = Math.max(0, plan.candidates - assigned);
  if (assigned === 0) {
    return {
      ok: false,
      message: `No faculty could be assigned automatically. ${plan.unresolved.length} unassigned faculty need review: ${
        plan.unresolved.filter((row) => row.reason === "no-schedule").length
      } have no schedule, ${
        plan.unresolved.filter((row) => row.reason === "mixed-colleges").length
      } teach across colleges, and ${
        plan.unresolved.filter((row) => row.reason === "unmapped-program").length
      } have an unmapped program.`,
    };
  }

  return {
    ok: true,
    message: `Assigned ${assigned} faculty automatically from their complete schedule. ${remaining} still need review; no manual assignment was overwritten.`,
  };
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
  const rawCollege = String(formData.get("collegeId") || "").trim();
  const collegeId = rawCollege ? Number(rawCollege) : null;
  if (collegeId !== null && !Number.isInteger(collegeId)) {
    return { ok: false, message: "Invalid college." };
  }
  await prisma.course.create({ data: { code, name, collegeId } });
  await writeAudit(user.id, "course.create", `Created program ${code}${collegeId ? ` in college #${collegeId}` : ""}`);
  revalidatePath("/master");
  return { ok: true, message: `Added program ${code}.` };
}

// Assign (or clear) the college of a program. This is how an unassigned course
// code found in a workbook gets a home without touching any schedule or
// attendance row; the program id and its slots stay exactly as they were.
export async function assignCourseCollege(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(PERMISSIONS.FACULTY_MANAGE);
  const id = Number(formData.get("id"));
  if (!id) return { ok: false, message: "Program is required." };

  const raw = String(formData.get("collegeId") || "").trim();
  const collegeId = raw ? Number(raw) : null;
  if (collegeId !== null && !Number.isInteger(collegeId)) {
    return { ok: false, message: "Invalid college." };
  }

  const [course, college] = await Promise.all([
    prisma.course.findUnique({ where: { id } }),
    collegeId ? prisma.college.findUnique({ where: { id: collegeId } }) : Promise.resolve(null),
  ]);
  if (!course) return { ok: false, message: "Program not found." };
  if (collegeId !== null && !college) return { ok: false, message: "College not found." };

  await prisma.course.update({ where: { id }, data: { collegeId } });
  await writeAudit(
    user.id,
    "course.college",
    `${course.code} college set to ${college ? college.code : "unassigned"}`,
  );
  revalidatePath("/master");
  revalidatePath("/schedule");
  return {
    ok: true,
    message: `${course.code} assigned to ${college ? `${college.code} — ${college.name}` : "Unassigned"}.`,
  };
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
