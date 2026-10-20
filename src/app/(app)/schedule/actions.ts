"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { timeToMinutes, formatTime12, WEEKDAY_NAMES } from "@/lib/dates";
import { formatSchoolYear, normalizeSemester } from "@/lib/terms";

export type ScheduleEditState = { ok: boolean; message: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MODES = ["FACE_TO_FACE", "ONLINE", "LAB"] as const;
type ModeValue = (typeof MODES)[number];

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function intOrNull(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export async function updateScheduleSlot(
  _prev: ScheduleEditState,
  formData: FormData,
): Promise<ScheduleEditState> {
  // ---- Permission ----
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_EDIT);
  } catch {
    return { ok: false, message: "You do not have permission to edit schedules." };
  }

  // ---- Locate existing slot ----
  const id = Number(str(formData, "id"));
  if (!id) return { ok: false, message: "Missing schedule reference." };
  const current = await prisma.scheduleSlot.findUnique({
    where: { id },
    include: { room: true, faculty: true, course: true },
  });
  if (!current) return { ok: false, message: "That schedule no longer exists." };

  // ---- Parse and validate inputs ----
  const cn = str(formData, "cn");
  const subject = str(formData, "subject");
  const description = str(formData, "description") || null;
  const section = str(formData, "section") || null;
  const yearLevel = str(formData, "yearLevel") || null;
  const termType = str(formData, "termType") || null;
  const semester = str(formData, "semester") || null;
  const units = Number(str(formData, "units") || "0");
  const weekday = Number(str(formData, "weekday"));
  const startTime = str(formData, "startTime");
  const endTime = str(formData, "endTime");
  const courseId = intOrNull(formData, "courseId");
  const roomId = intOrNull(formData, "roomId");
  const facultyId = intOrNull(formData, "facultyId");
  const mode = str(formData, "mode") as ModeValue;

  if (!cn) return { ok: false, message: "Class number (CN) is required." };
  if (!subject) return { ok: false, message: "Subject is required." };
  if (!courseId) return { ok: false, message: "Program is required." };
  if (!roomId) return { ok: false, message: "Room is required." };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    return { ok: false, message: "Choose a valid day." };
  if (!TIME_RE.test(startTime)) return { ok: false, message: "Enter a valid start time." };
  if (!TIME_RE.test(endTime)) return { ok: false, message: "Enter a valid end time." };
  if (timeToMinutes(endTime) <= timeToMinutes(startTime))
    return { ok: false, message: "The end time must be later than the start time." };
  if (!MODES.includes(mode)) return { ok: false, message: "Choose a valid class mode." };
  if (!Number.isFinite(units) || units < 0) return { ok: false, message: "Units must be a positive number." };

  const [course, room, faculty] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.room.findUnique({ where: { id: roomId } }),
    facultyId ? prisma.faculty.findUnique({ where: { id: facultyId } }) : Promise.resolve(null),
  ]);
  if (!course) return { ok: false, message: "The selected program does not exist." };
  if (!room) return { ok: false, message: "The selected room does not exist." };
  if (facultyId && !faculty) return { ok: false, message: "The selected faculty does not exist." };

  // ---- Protect historical attendance ----
  // Attendance rows are keyed to (slotId, date, scheduled hour). Editing the day
  // or the time range would not delete them, but it would desynchronise the
  // encoded hours from the slot, which would corrupt historical summaries
  // (e.g. present hours greater than scheduled hours). So we block day/time
  // changes once attendance exists, while still allowing room, faculty and other
  // informational fields to be updated.
  const attendanceCount = await prisma.attendance.count({ where: { slotId: id } });
  const timeChanged =
    weekday !== current.weekday ||
    startTime !== current.startTime ||
    endTime !== current.endTime;
  if (attendanceCount > 0 && timeChanged) {
    return {
      ok: false,
      message: `This slot has ${attendanceCount} encoded attendance record(s). To protect historical data, its day and time cannot be changed. You can still update the room, faculty, subject and other details.`,
    };
  }

  // ---- Existing conflict rule: no duplicate slot identity ----
  // The import matches rows by CN + day + start + end + room. Keep that invariant
  // so two slots never collapse into the same identity.
  const duplicate = await prisma.scheduleSlot.findFirst({
    where: {
      id: { not: id },
      cn,
      weekday,
      startTime,
      endTime,
      roomId,
    },
    select: { id: true, subject: true },
  });
  if (duplicate) {
    return {
      ok: false,
      message: `Another schedule already uses CN ${cn} on ${WEEKDAY_NAMES[weekday]} ${startTime}–${endTime} in room ${room.code}. Adjust the day, time or room to avoid a duplicate.`,
    };
  }

  // ---- Persist (update in place — never insert) ----
  try {
    await prisma.scheduleSlot.update({
      where: { id },
      data: {
        cn,
        subject,
        description,
        section,
        yearLevel,
        termType,
        semester,
        units: Math.round(units),
        courseId,
        facultyId,
        weekday,
        startTime,
        endTime,
        roomId,
        mode,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Could not save the schedule: ${detail}` };
  }

  const roomChange =
    roomId !== current.roomId ? ` — room ${current.room.code} → ${room.code}` : "";
  const facultyChange =
    facultyId !== current.facultyId ? ` — faculty ${faculty?.fullName ?? "Unassigned"}` : "";
  await writeAudit(
    user.id,
    "schedule.update",
    `Updated slot #${id} (CN ${cn})${roomChange}${facultyChange}`,
  );

  revalidatePath("/schedule");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  revalidatePath("/summary/print");
  revalidatePath("/dashboard");

  return { ok: true, message: `Schedule for CN ${cn} updated.` };
}

function revalidateScheduleViews() {
  revalidatePath("/schedule");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  revalidatePath("/summary/print");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Delete a schedule slot
// ---------------------------------------------------------------------------

export async function deleteScheduleSlot(
  _prev: ScheduleEditState,
  formData: FormData,
): Promise<ScheduleEditState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_EDIT);
  } catch {
    return { ok: false, message: "You do not have permission to delete schedules." };
  }

  const id = Number(str(formData, "id"));
  if (!id) return { ok: false, message: "Missing schedule reference." };

  const slot = await prisma.scheduleSlot.findUnique({
    where: { id },
    include: { room: true, faculty: true, course: true },
  });
  if (!slot) return { ok: false, message: "That schedule no longer exists." };

  const label = `CN ${slot.cn} (${slot.subject}) — ${WEEKDAY_NAMES[slot.weekday]} ${formatTime12(
    slot.startTime,
  )}–${formatTime12(slot.endTime)}, ${slot.room.code}${
    slot.faculty ? `, ${slot.faculty.fullName}` : ""
  }`;

  // ---- Protect attendance history ----
  // Attendance rows reference the slot. Deleting the slot would either orphan or
  // (worse) remove historical data, so a slot with recorded attendance can never
  // be permanently removed. Historical reports stay intact.
  const attendanceCount = await prisma.attendance.count({ where: { slotId: id } });
  if (attendanceCount > 0) {
    return {
      ok: false,
      message: `Cannot delete ${label}. It has ${attendanceCount} encoded attendance record(s). Deleting it would damage historical attendance and reports, so it is blocked.`,
    };
  }

  try {
    // Non-cascading delete: only ever removes this one schedule row.
    await prisma.scheduleSlot.delete({ where: { id } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      message: `Cannot delete ${label}. It is still referenced by other records. ${detail}`,
    };
  }

  await writeAudit(user.id, "schedule.delete", `Deleted slot #${id} — ${label}`);
  revalidateScheduleViews();

  return { ok: true, message: `Deleted ${label}.` };
}

// ---------------------------------------------------------------------------
// Copy a term's schedule configuration into another term (no attendance copied)
// ---------------------------------------------------------------------------

export async function copySchedulesToTerm(
  _prev: ScheduleEditState,
  formData: FormData,
): Promise<ScheduleEditState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_EDIT);
  } catch {
    return { ok: false, message: "You do not have permission to copy schedules." };
  }

  const sourceYear = formatSchoolYear(str(formData, "sourceSchoolYear"));
  const sourceSemester = str(formData, "sourceSemester");
  const targetYear = formatSchoolYear(str(formData, "targetSchoolYear"));
  const targetSemester = normalizeSemester(str(formData, "targetSemester")) ?? "";

  if (!sourceYear || !sourceSemester) return { ok: false, message: "Select a source semester." };
  if (!targetYear || !targetSemester)
    return { ok: false, message: "Choose the target academic year and semester." };
  if (!isValidYear(targetYear))
    return { ok: false, message: "Enter the target academic year as e.g. 2027-2028." };
  if (sourceYear === targetYear && sourceSemester === targetSemester)
    return { ok: false, message: "The target semester must be different from the source." };

  const sourceSlots = await prisma.scheduleSlot.findMany({
    where: { schoolYear: sourceYear, semester: sourceSemester },
  });
  if (sourceSlots.length === 0)
    return { ok: false, message: `No schedules found in ${sourceYear} ${sourceSemester}.` };

  const existingTarget = await prisma.scheduleSlot.findMany({
    where: { schoolYear: targetYear, semester: targetSemester },
    select: { cn: true, weekday: true, startTime: true, endTime: true, roomId: true },
  });
  const targetKeys = new Set(
    existingTarget.map((s) => `${s.cn}|${s.weekday}|${s.startTime}|${s.endTime}|${s.roomId}`),
  );

  let copied = 0;
  let skipped = 0;
  const toCreate: {
    cn: string;
    subject: string;
    description: string | null;
    units: number;
    section: string | null;
    yearLevel: string | null;
    courseId: number;
    facultyId: number | null;
    weekday: number;
    startTime: string;
    endTime: string;
    roomId: number;
    mode: (typeof sourceSlots)[number]["mode"];
    termType: string | null;
    schoolYear: string;
    semester: string;
  }[] = [];

  for (const s of sourceSlots) {
    const key = `${s.cn}|${s.weekday}|${s.startTime}|${s.endTime}|${s.roomId}`;
    if (targetKeys.has(key)) {
      skipped++;
      continue;
    }
    targetKeys.add(key);
    toCreate.push({
      cn: s.cn,
      subject: s.subject,
      description: s.description,
      units: s.units,
      section: s.section,
      yearLevel: s.yearLevel,
      courseId: s.courseId,
      facultyId: s.facultyId,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      roomId: s.roomId,
      mode: s.mode,
      termType: s.termType,
      schoolYear: targetYear,
      semester: targetSemester,
    });
  }

  if (toCreate.length === 0) {
    return {
      ok: false,
      message: `Nothing to copy: all ${sourceSlots.length} schedule(s) already exist in ${targetYear} ${targetSemester} (${skipped} duplicate${skipped === 1 ? "" : "s"} skipped).`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleSlot.createMany({ data: toCreate });
  });

  await writeAudit(
    user.id,
    "schedule.copy",
    `Copied ${copied === 0 ? toCreate.length : copied} slot(s) from ${sourceYear} ${sourceSemester} to ${targetYear} ${targetSemester} (${skipped} skipped).`,
  );
  revalidateScheduleViews();

  copied = toCreate.length;
  return {
    ok: true,
    message: `Copied ${copied} schedule(s) into ${targetYear} ${targetSemester}. ${skipped} duplicate(s) skipped. No attendance was copied.`,
  };
}

function isValidYear(value: string): boolean {
  return /^\d{4}-\d{4}$/.test(value);
}

// ---------------------------------------------------------------------------
// Clear imported schedules (bulk, safe)
// ---------------------------------------------------------------------------
// Removes a whole semester's slots or a single import batch in one action. Any
// slot referenced by attendance history is retained — attendance is never
// deleted and the operation is atomic, so it never reports partial success.

export type ClearPreview = {
  mode: "term" | "batch";
  schoolYear: string | null;
  semester: string | null;
  batchId: number | null;
  scopeLabel: string;
  total: number;
  clearable: number;
  retained: number;
  retainedSample: { id: number; cn: string; subject: string; attendance: number }[];
};

export type ClearState = {
  ok: boolean;
  message: string;
  preview?: ClearPreview;
  result?: { cleared: number; retained: number; failed: number };
};

type ResolvedClearScope = {
  mode: "term" | "batch";
  batchId: number | null;
  schoolYear: string | null;
  semester: string | null;
  scopeLabel: string;
  where: { schoolYear?: string; semester?: string; importBatchId?: number };
};

type ClearScopeResult = { ok: true; scope: ResolvedClearScope } | { ok: false; message: string };

async function resolveClearScope(formData: FormData): Promise<ClearScopeResult> {
  const mode = str(formData, "mode");

  if (mode === "batch") {
    const batchId = Number(str(formData, "batchId"));
    if (!Number.isInteger(batchId) || batchId <= 0)
      return { ok: false, message: "Choose an import batch to clear." };
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) return { ok: false, message: "That import batch no longer exists." };
    return {
      ok: true,
      scope: {
        mode: "batch",
        batchId: batch.id,
        schoolYear: batch.schoolYear,
        semester: batch.semester,
        scopeLabel: `import batch #${batch.id} (${batch.filename})`,
        where: { importBatchId: batch.id },
      },
    };
  }

  if (mode === "term") {
    const schoolYear = formatSchoolYear(str(formData, "schoolYear"));
    const semester = normalizeSemester(str(formData, "semester")) ?? "";
    if (!schoolYear || !semester)
      return { ok: false, message: "Choose the academic year and semester to clear." };
    if (!isValidYear(schoolYear))
      return { ok: false, message: "Choose a valid academic year (for example 2026-2027)." };
    return {
      ok: true,
      scope: {
        mode: "term",
        batchId: null,
        schoolYear,
        semester,
        scopeLabel: `${schoolYear} · ${semester}`,
        where: { schoolYear, semester },
      },
    };
  }

  return { ok: false, message: "Choose whether to clear a whole semester or one import batch." };
}

async function analyzeClearScope(scope: ResolvedClearScope) {
  const slots = await prisma.scheduleSlot.findMany({
    where: scope.where,
    select: { id: true, cn: true, subject: true },
  });
  const ids = slots.map((s) => s.id);
  const counts = ids.length
    ? await prisma.attendance.groupBy({
        by: ["slotId"],
        where: { slotId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countBySlot = new Map(counts.map((c) => [c.slotId, c._count._all]));
  const retained = slots
    .filter((s) => (countBySlot.get(s.id) ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      cn: s.cn,
      subject: s.subject,
      attendance: countBySlot.get(s.id) ?? 0,
    }));
  return { total: slots.length, clearable: slots.length - retained.length, retained };
}

export async function previewClearSchedules(
  _prev: ClearState,
  formData: FormData,
): Promise<ClearState> {
  try {
    await assertPermission(PERMISSIONS.SCHEDULE_EDIT);
  } catch {
    return { ok: false, message: "You do not have permission to clear imported schedules." };
  }

  const resolved = await resolveClearScope(formData);
  if (!resolved.ok) return { ok: false, message: resolved.message };
  const { scope } = resolved;

  const analysis = await analyzeClearScope(scope);
  return {
    ok: true,
    message: "",
    preview: {
      mode: scope.mode,
      schoolYear: scope.schoolYear,
      semester: scope.semester,
      batchId: scope.batchId,
      scopeLabel: scope.scopeLabel,
      total: analysis.total,
      clearable: analysis.clearable,
      retained: analysis.retained.length,
      retainedSample: analysis.retained.slice(0, 8),
    },
  };
}

export async function clearImportedSchedules(
  _prev: ClearState,
  formData: FormData,
): Promise<ClearState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_EDIT);
  } catch {
    return { ok: false, message: "You do not have permission to clear imported schedules." };
  }

  const resolved = await resolveClearScope(formData);
  if (!resolved.ok) return { ok: false, message: resolved.message };
  const { scope } = resolved;

  let cleared = 0;
  let retained = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const inScope = await tx.scheduleSlot.findMany({
        where: scope.where,
        select: { id: true },
      });
      const ids = inScope.map((s) => s.id);
      if (ids.length === 0) return;

      // Slots with any attendance history are protected and never deleted.
      const protectedRows = await tx.attendance.findMany({
        where: { slotId: { in: ids } },
        select: { slotId: true },
        distinct: ["slotId"],
      });
      const protectedSet = new Set(protectedRows.map((r) => r.slotId));
      retained = protectedSet.size;

      const deletable = ids.filter((id) => !protectedSet.has(id));
      if (deletable.length > 0) {
        const res = await tx.scheduleSlot.deleteMany({ where: { id: { in: deletable } } });
        cleared = res.count;
      }

      // Keep the batch's slot count in step with what remains.
      if (scope.mode === "batch" && scope.batchId) {
        const remaining = await tx.scheduleSlot.count({
          where: { importBatchId: scope.batchId },
        });
        await tx.importBatch.update({
          where: { id: scope.batchId },
          data: { slotCount: remaining },
        });
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      message: `Could not clear schedules: ${detail}. No schedules were removed.`,
    };
  }

  await writeAudit(
    user.id,
    "schedule.clear",
    `Cleared ${cleared} schedule(s) from ${scope.scopeLabel}; ${retained} retained due to attendance.`,
  );
  revalidateScheduleViews();

  const result = { cleared, retained, failed: 0 };
  const message =
    cleared === 0 && retained === 0
      ? `Nothing to clear in ${scope.scopeLabel}.`
      : `${cleared} schedule(s) cleared from ${scope.scopeLabel}.` +
        (retained > 0
          ? ` ${retained} schedule(s) were kept because they have attendance history.`
          : "");
  return { ok: true, message, result };
}
