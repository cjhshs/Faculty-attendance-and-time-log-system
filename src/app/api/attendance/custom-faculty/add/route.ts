import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { parseISODate, todayUtc } from "@/lib/dates";
import { addCustomFacultyToSheet } from "@/lib/custom-sheet-faculty";
import { writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_PRINT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    sheetKey?: string;
    date?: string;
    facultyId?: number;
    courseId?: number | null;
    notes?: string;
  } | null;

  const sheetKey = String(body?.sheetKey ?? "").trim();
  const facultyId = Number(body?.facultyId);
  const date = parseISODate(body?.date ?? null) ?? todayUtc();
  const courseId = body?.courseId ? Number(body.courseId) : null;
  const notes = body?.notes ? String(body.notes).trim() : undefined;

  if (!sheetKey || !Number.isInteger(facultyId) || facultyId <= 0) {
    return NextResponse.json({ error: "Invalid sheet key or faculty ID." }, { status: 400 });
  }

  try {
    const result = await addCustomFacultyToSheet({
      sheetKey,
      date,
      facultyId,
      courseId,
      userId: user.id,
      notes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeAudit(
      user.id,
      "attendance.custom_faculty.add",
      `Added custom faculty ID ${facultyId} (${result.sheetEntry.faculty.fullName}) to sheet ${sheetKey}.`,
    );

    return NextResponse.json({ ok: true, sheetEntry: result.sheetEntry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add faculty to sheet." },
      { status: 500 },
    );
  }
}
