import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { commitPlan, type ImportScope } from "@/lib/import";
import { parseTerm } from "@/lib/terms";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeCourseCode } from "@/lib/college-catalog";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const target = parseTerm(String(form.get("schoolYear") ?? ""), String(form.get("semester") ?? ""));
  const college = String(form.get("college") ?? "").trim();
  const program = String(form.get("program") ?? "").trim();

  try {
    let scope: ImportScope | null =
      college || program ? { college: college || null, program: program || null } : null;
    if (scope && college && !program) {
      const courses = await prisma.course.findMany({
        select: { code: true, college: { select: { code: true } } },
      });
      scope = {
        ...scope,
        collegeByCode: Object.fromEntries(
          courses.map((c) => [normalizeCourseCode(c.code), c.college?.code ?? null]),
        ),
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { result } = await commitPlan(
      buffer,
      target,
      {
        filename: file.name,
        importedById: user.id,
      },
      scope,
    );
    const termLabel = target ? ` into ${target.schoolYear} ${target.semester}` : "";
    const scopeLabel = program || college ? ` (${program || college})` : " (all colleges)";
    await writeAudit(
      user.id,
      "schedule.import",
      `Imported ${file.name}${termLabel}${scopeLabel}: ${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged, ${result.skippedOutOfScope} outside scope.${result.batchId ? ` Batch #${result.batchId}.` : ""}`,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed. No changes were saved." },
      { status: 400 },
    );
  }
}
