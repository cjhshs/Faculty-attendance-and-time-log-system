import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { parseISODate, todayUtc, hoursOfRange } from "@/lib/dates";
import { parseTerm, termWhere, isValidTerm } from "@/lib/terms";
import { attendanceGenerationGate, getAcademicPeriod } from "@/lib/academic-period";
import {
  isAttendanceStatus,
  presentFromStatus,
  validateAttendanceReason,
  type AttendanceStatus,
} from "@/lib/attendance-status";

type IncomingRecord = {
  slotId: number;
  hourStart: string;
  // Omitted = leave the existing status untouched. This is what prevents an
  // unrelated edit (for example a room override) from erasing a saved status.
  status?: AttendanceStatus;
  reason?: string;
  roomOverride?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_ENCODE)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    date?: string;
    courseCode?: string;
    departmentCode?: string;
    schoolYear?: string;
    semester?: string;
    records?: IncomingRecord[];
    replace?: boolean;
  } | null;

  if (!body?.date || !Array.isArray(body.records) || (!body.courseCode && !body.departmentCode)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const date = parseISODate(body.date);
  if (!date) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  // The academic period is part of the save request and is enforced server-side:
  // a client cannot save into a slot that belongs to another term.
  const term = parseTerm(body.schoolYear, body.semester);
  if (!term || !isValidTerm(term)) {
    return NextResponse.json({ error: "Choose a valid school year and semester." }, { status: 400 });
  }

  // The academic period is enforced server-side. A missing period, missing
  // semester dates, or an out-of-range date blocks the write instead of
  // silently generating attendance outside the configured semester.
  const period = await getAcademicPeriod(term.schoolYear, term.semester);
  const gate = attendanceGenerationGate(period, date);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message, code: gate.code }, { status: 400 });
  }

  const course = body.courseCode
    ? await prisma.course.findUnique({ where: { code: body.courseCode } })
    : null;
  if (body.courseCode && !course) {
    return NextResponse.json({ error: "Unknown program." }, { status: 400 });
  }

  const departmentCode = (body.departmentCode ?? "").trim();
  const scopeWhere = course
    ? { courseId: course.id }
    : departmentCode === "unassigned"
      ? { faculty: { departmentId: null } }
      : { faculty: { department: { code: departmentCode } } };

  // Department membership is enforced here, on the server. A client cannot save
  // a slot belonging to a faculty member of another department.
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      weekday: date.getUTCDay(),
      ...scopeWhere,
      ...termWhere(term),
    },
    select: {
      id: true,
      courseId: true,
      startTime: true,
      endTime: true,
      facultyId: true,
    },
  });
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const involvedCourseIds = Array.from(new Set(slots.map((s) => s.courseId)));
  const savedSession = await prisma.attendanceSession.findFirst({
    where: {
      date,
      courseId: course ? course.id : { in: involvedCourseIds },
      status: "SAVED",
    },
  });

  // A day stays a draft until saved. Editing a past date OR an already-saved
  // day requires the "Edit past attendance" permission.
  const isPast = date < todayUtc();
  if ((isPast || savedSession) && !hasPermission(user, PERMISSIONS.ATTENDANCE_EDIT_PAST)) {
    return NextResponse.json(
      { error: "You do not have permission to edit past or already-saved attendance." },
      { status: 403 },
    );
  }

  if (savedSession && body.replace !== true) {
    return NextResponse.json(
      { error: "Attendance is already saved. Confirm replacement to continue.", needsConfirm: true },
      { status: 409 },
    );
  }

  if (body.records.length === 0) {
    return NextResponse.json(
      { error: "No attendance changes were submitted. Nothing was saved." },
      { status: 400 },
    );
  }

  const valid: (IncomingRecord & { courseId: number; statusTouched: boolean })[] = [];
  for (const record of body.records) {
    const slot = slotById.get(record.slotId);
    if (!slot) continue;
    if (!hoursOfRange(slot.startTime, slot.endTime).includes(record.hourStart)) continue;
    if (record.status !== undefined && !isAttendanceStatus(record.status)) {
      return NextResponse.json({ error: "Invalid attendance status." }, { status: 400 });
    }
    const statusTouched = record.status !== undefined;
    if (statusTouched) {
      const checked = validateAttendanceReason(record.status!, record.reason);
      if (!checked.ok) return NextResponse.json({ error: checked.message }, { status: 400 });
    }
    valid.push({ ...record, courseId: slot.courseId, statusTouched });
  }

  if (valid.length === 0) {
    return NextResponse.json(
      {
        error:
          "No scheduled hours matched this department/program, date and academic period. Nothing was saved; no other term was substituted.",
      },
      { status: 400 },
    );
  }

  const existingRows =
    valid.length > 0
      ? await prisma.attendance.findMany({
          where: {
            date,
            slotId: { in: Array.from(new Set(valid.map((r) => r.slotId))) },
            hourStart: { in: Array.from(new Set(valid.map((r) => r.hourStart))) },
          },
          select: { slotId: true, hourStart: true },
        })
      : [];
  const existingKeys = new Set(existingRows.map((r) => `${r.slotId}|${r.hourStart}`));
  const updatedCount = valid.filter((r) => existingKeys.has(`${r.slotId}|${r.hourStart}`)).length;
  const createdCount = valid.length - updatedCount;
  const skippedCount = Math.max(0, body.records.length - valid.length);
  const explicitStatusCount = valid.filter((r) => r.statusTouched).length;

  const savedAt = new Date();
  const byCourse = new Map<number, typeof valid>();
  for (const record of valid) {
    const list = byCourse.get(record.courseId) ?? [];
    list.push(record);
    byCourse.set(record.courseId, list);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const primaryCourseId = course?.id ?? byCourse.keys().next().value;
      let sessionId: number | null = null;
      if (primaryCourseId != null) {
        const session = await tx.attendanceSession.upsert({
          where: { date_courseId: { date, courseId: primaryCourseId } },
          update: { status: "SAVED", savedById: user.id, savedAt },
          create: {
            date,
            courseId: primaryCourseId,
            status: "SAVED",
            savedById: user.id,
            savedAt,
          },
        });
        sessionId = session.id;
      }

      // Additional courses involved in a department-wide save each get their own
      // session. Counting of absent hours is based on explicit status values, so
      // an untouched hour in any course remains unencoded, not absent.
      const extraSessions = new Map<number, number>();
      for (const courseId of byCourse.keys()) {
        if (courseId === primaryCourseId) continue;
        const session = await tx.attendanceSession.upsert({
          where: { date_courseId: { date, courseId } },
          update: { status: "SAVED", savedById: user.id, savedAt },
          create: { date, courseId, status: "SAVED", savedById: user.id, savedAt },
        });
        extraSessions.set(courseId, session.id);
      }

      for (const r of valid) {
        const targetSessionId = r.courseId === primaryCourseId
          ? sessionId
          : extraSessions.get(r.courseId) ?? null;
        const reason = r.reason !== undefined
          ? r.reason.trim()
            ? r.reason.trim()
            : null
          : undefined;
        const roomOverride = r.roomOverride !== undefined
          ? r.roomOverride.trim()
            ? r.roomOverride.trim()
            : null
          : undefined;

        await tx.attendance.upsert({
          where: {
            slotId_date_hourStart: { slotId: r.slotId, date, hourStart: r.hourStart },
          },
          update: {
            // Only write the status when the user actually changed the control.
            ...(r.statusTouched ? { present: presentFromStatus(r.status!) } : {}),
            ...(reason !== undefined ? { reason } : {}),
            ...(roomOverride !== undefined ? { roomOverride } : {}),
            sessionId: targetSessionId,
            encodedById: user.id,
            encodedAt: savedAt,
          },
          create: {
            slotId: r.slotId,
            sessionId: targetSessionId,
            date,
            hourStart: r.hourStart,
            // Missing status is stored as NULL (not encoded), never false.
            present: r.statusTouched ? presentFromStatus(r.status!) : null,
            reason: reason ?? null,
            roomOverride: roomOverride ?? null,
            encodedById: user.id,
          },
        });
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save attendance." },
      { status: 500 },
    );
  }

  const label = course?.code ?? `${departmentCode || "department"} (department)`;
  await writeAudit(
    user.id,
    "attendance.save",
    `Saved attendance for ${label} on ${body.date}: ${explicitStatusCount} explicit status value(s), ${createdCount} new row(s), ${updatedCount} updated row(s), ${skippedCount} skipped.`,
  );

  return NextResponse.json({
    ok: true,
    saved: { savedByName: user.name, savedAt: savedAt.toISOString() },
    result: {
      requested: body.records.length,
      saved: valid.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      explicitStatuses: explicitStatusCount,
    },
  });
}
