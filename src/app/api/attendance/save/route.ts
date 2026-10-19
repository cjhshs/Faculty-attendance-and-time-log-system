import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { parseISODate, todayUtc, hoursOfRange } from "@/lib/dates";

type IncomingRecord = {
  slotId: number;
  hourStart: string;
  present: boolean;
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
    records?: IncomingRecord[];
    replace?: boolean;
  } | null;

  if (!body?.date || !body.courseCode || !Array.isArray(body.records)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const date = parseISODate(body.date);
  if (!date) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { code: body.courseCode } });
  if (!course) return NextResponse.json({ error: "Unknown program." }, { status: 400 });

  const existingSession = await prisma.attendanceSession.findUnique({
    where: { date_courseId: { date, courseId: course.id } },
  });

  // A day stays a draft until saved. Editing a past date OR an already-saved
  // day requires the "Edit past attendance" permission.
  const isPast = date < todayUtc();
  const isSaved = existingSession?.status === "SAVED";
  if ((isPast || isSaved) && !hasPermission(user, PERMISSIONS.ATTENDANCE_EDIT_PAST)) {
    return NextResponse.json(
      { error: "You do not have permission to edit past or already-saved attendance." },
      { status: 403 },
    );
  }

  const slots = await prisma.scheduleSlot.findMany({ where: { courseId: course.id } });
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const valid = body.records.filter((r) => {
    const slot = slotById.get(r.slotId);
    if (!slot) return false;
    return hoursOfRange(slot.startTime, slot.endTime).includes(r.hourStart);
  });

  if (isSaved && body.replace !== true) {
    return NextResponse.json(
      { error: "Attendance is already saved. Confirm replacement to continue.", needsConfirm: true },
      { status: 409 },
    );
  }

  const savedAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.upsert({
        where: { date_courseId: { date, courseId: course.id } },
        update: { status: "SAVED", savedById: user.id, savedAt },
        create: {
          date,
          courseId: course.id,
          status: "SAVED",
          savedById: user.id,
          savedAt,
        },
      });

      const keepKeys = new Set(valid.map((r) => `${r.slotId}|${r.hourStart}`));

      const existingRows = await tx.attendance.findMany({ where: { sessionId: session.id } });
      for (const row of existingRows) {
        if (!keepKeys.has(`${row.slotId}|${row.hourStart}`)) {
          await tx.attendance.delete({ where: { id: row.id } });
        }
      }

      for (const r of valid) {
        await tx.attendance.upsert({
          where: {
            slotId_date_hourStart: { slotId: r.slotId, date, hourStart: r.hourStart },
          },
          update: {
            present: r.present,
            reason: r.reason?.trim() ? r.reason.trim() : null,
            roomOverride: r.roomOverride?.trim() ? r.roomOverride.trim() : null,
            sessionId: session.id,
            encodedById: user.id,
            encodedAt: savedAt,
          },
          create: {
            slotId: r.slotId,
            sessionId: session.id,
            date,
            hourStart: r.hourStart,
            present: r.present,
            reason: r.reason?.trim() || null,
            roomOverride: r.roomOverride?.trim() || null,
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

  await writeAudit(
    user.id,
    "attendance.save",
    `Saved ${valid.length} hours for ${course.code} on ${body.date}.`,
  );

  return NextResponse.json({
    ok: true,
    saved: { savedByName: user.name, savedAt: savedAt.toISOString() },
  });
}
