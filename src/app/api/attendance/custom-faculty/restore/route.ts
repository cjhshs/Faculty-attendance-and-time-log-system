import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { restoreExcludedFacultyOnSheet } from "@/lib/custom-sheet-faculty";
import { writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_PRINT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    sheetKey?: string;
    facultyId?: number;
  } | null;

  const sheetKey = String(body?.sheetKey ?? "").trim();
  const facultyId = Number(body?.facultyId);

  if (!sheetKey || !Number.isInteger(facultyId) || facultyId <= 0) {
    return NextResponse.json({ error: "Invalid sheet key or faculty ID." }, { status: 400 });
  }

  try {
    await restoreExcludedFacultyOnSheet(sheetKey, facultyId);
    await writeAudit(
      user.id,
      "attendance.custom_faculty.restore",
      `Restored excluded faculty ID ${facultyId} to sheet ${sheetKey}.`,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to restore faculty." },
      { status: 500 },
    );
  }
}
