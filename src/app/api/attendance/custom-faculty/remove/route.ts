import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { parseISODate, todayUtc } from "@/lib/dates";
import { removeFacultyFromSheet } from "@/lib/custom-sheet-faculty";
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
    isCustom?: boolean;
  } | null;

  const sheetKey = String(body?.sheetKey ?? "").trim();
  const facultyId = Number(body?.facultyId);
  const date = parseISODate(body?.date ?? null) ?? todayUtc();
  const isCustom = Boolean(body?.isCustom);

  if (!sheetKey || !Number.isInteger(facultyId) || facultyId <= 0) {
    return NextResponse.json({ error: "Invalid sheet key or faculty ID." }, { status: 400 });
  }

  try {
    const result = await removeFacultyFromSheet({
      sheetKey,
      date,
      facultyId,
      isCustom,
      userId: user.id,
    });

    await writeAudit(
      user.id,
      "attendance.custom_faculty.remove",
      `Removed faculty ID ${facultyId} (${isCustom ? "custom" : "excluded"}) from sheet ${sheetKey}. Master records and schedules preserved.`,
    );

    return NextResponse.json({ ok: true, removedType: result.removedType });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove faculty from sheet." },
      { status: 500 },
    );
  }
}
