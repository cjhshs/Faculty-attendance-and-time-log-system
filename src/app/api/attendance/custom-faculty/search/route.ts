import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { parseTerm, isValidTerm } from "@/lib/terms";
import { parseISODate, todayUtc } from "@/lib/dates";
import { searchFacultyForSheet } from "@/lib/custom-sheet-faculty";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_PRINT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const dateStr = searchParams.get("date") ?? "";
  const schoolYear = searchParams.get("schoolYear") ?? "";
  const semester = searchParams.get("semester") ?? "";
  const currentIdsRaw = searchParams.get("currentIds") ?? "";

  const date = parseISODate(dateStr) ?? todayUtc();
  const term = parseTerm(schoolYear, semester);
  if (!term || !isValidTerm(term)) {
    return NextResponse.json({ error: "Invalid academic term" }, { status: 400 });
  }

  const currentIds = currentIdsRaw
    ? currentIdsRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];

  try {
    const results = await searchFacultyForSheet(q, date, term, currentIds);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error searching faculty" },
      { status: 500 },
    );
  }
}
