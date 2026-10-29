import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { buildPlan } from "@/lib/import";
import { parseTerm, isValidTerm } from "@/lib/terms";
import { prisma } from "@/lib/prisma";
import { describeDuplicateImport, importChecksum } from "@/lib/import-checksum";
import { getAcademicPeriod } from "@/lib/academic-period";
import { normalizeCourseCode } from "@/lib/college-catalog";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const target = parseTerm(
    String(formData.get("schoolYear") ?? ""),
    String(formData.get("semester") ?? ""),
  );
  if (!target || !isValidTerm(target)) {
    return NextResponse.json(
      { error: "Choose a valid target school year and semester before previewing." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = importChecksum(buffer);
  // Preview must use the same database program-to-college mapping as commit, so
  // the counts a reviewer approves are the counts that will actually be written.
  const courses = await prisma.course.findMany({
    select: { code: true, college: { select: { code: true } } },
  });
  const collegeByCode = Object.fromEntries(
    courses.map((c) => [normalizeCourseCode(c.code), c.college?.code ?? null]),
  );
  const [plan, previous, period] = await Promise.all([
    buildPlan(buffer, target, collegeByCode),
    prisma.importBatch.findFirst({
      where: { schoolYear: target.schoolYear, semester: target.semester, checksum },
      orderBy: { createdAt: "desc" },
    }),
    getAcademicPeriod(target.schoolYear, target.semester),
  ]);

  return NextResponse.json({
    plan,
    duplicateImport: previous
      ? {
          id: previous.id,
          filename: previous.filename,
          schoolYear: previous.schoolYear,
          semester: previous.semester,
          slotCount: previous.slotCount,
          checksum: previous.checksum,
          createdAt: previous.createdAt,
          message: describeDuplicateImport(previous),
        }
      : null,
    period: period
      ? {
          schoolYear: period.schoolYear,
          semester: period.semester,
          configured: period.configured,
          startDate: period.startDate ? period.startDate.toISOString().slice(0, 10) : null,
          endDate: period.endDate ? period.endDate.toISOString().slice(0, 10) : null,
          status: period.status,
        }
      : null,
  });
}
