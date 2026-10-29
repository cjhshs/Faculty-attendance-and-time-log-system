import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { commitPlan, type ImportPlan, type ImportScope } from "@/lib/import";
import { parseTerm, isValidTerm } from "@/lib/terms";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeCourseCode } from "@/lib/college-catalog";
import { describeDuplicateImport, importChecksum } from "@/lib/import-checksum";
import { getAcademicPeriod, saveAcademicPeriod } from "@/lib/academic-period";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const target = parseTerm(String(form.get("schoolYear") ?? ""), String(form.get("semester") ?? ""));
  if (!target || !isValidTerm(target)) {
    return NextResponse.json(
      { error: "Choose a valid target school year and semester. Schedules are never imported without an academic period." },
      { status: 400 },
    );
  }
  const college = String(form.get("college") ?? "").trim();
  const program = String(form.get("program") ?? "").trim();
  const confirmDuplicate = String(form.get("confirmDuplicate") ?? "") === "1";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = importChecksum(buffer);

    // Exact duplicate of an earlier import in the same period. The user must
    // explicitly confirm; nothing is replaced or deleted automatically.
    const previous = await prisma.importBatch.findFirst({
      where: { schoolYear: target.schoolYear, semester: target.semester, checksum },
      orderBy: { createdAt: "desc" },
    });
    if (previous && !confirmDuplicate) {
      return NextResponse.json(
        {
          error: describeDuplicateImport(previous),
          duplicateImport: {
            id: previous.id,
            filename: previous.filename,
            schoolYear: previous.schoolYear,
            semester: previous.semester,
            slotCount: previous.slotCount,
            checksum: previous.checksum,
            createdAt: previous.createdAt,
          },
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }

    // Register the explicitly chosen period if it does not exist yet. Dates stay
    // NULL because the import does not contain reviewed semester boundaries.
    const period = await getAcademicPeriod(target.schoolYear, target.semester);
    if (!period) {
      await saveAcademicPeriod({
        schoolYear: target.schoolYear,
        semester: target.semester,
        startDate: null,
        endDate: null,
        status: null,
      });
    }

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

    const { plan, result } = await commitPlan(
      buffer,
      target,
      {
        filename: file.name,
        importedById: user.id,
        checksum,
      },
      scope,
    );

    // Term mismatch is reported, never used to re-route rows. It is recorded in
    // the audit trail so a later reviewer can see the source workbook disagreed.
    const mismatches = termMismatches(plan, target, college, program);
    const termLabel = ` into ${target.schoolYear} ${target.semester}`;
    const scopeLabel = program || college ? ` (${program || college})` : " (all colleges)";
    await writeAudit(
      user.id,
      "schedule.import",
      `Imported ${file.name}${termLabel}${scopeLabel}: ${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged, ${result.skippedOutOfScope} outside scope.${result.batchId ? ` Batch #${result.batchId}.` : ""}${
        mismatches ? ` Term mismatch warning: ${mismatches}` : ""
      }`,
    );
    return NextResponse.json({
      result,
      termWarning: mismatches || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed. No changes were saved." },
      { status: 400 },
    );
  }
}

function termMismatches(
  plan: ImportPlan,
  target: { schoolYear: string; semester: string },
  college: string,
  program: string,
): string | null {
  const source = plan.sourceSemesters.filter((entry) => entry.semester !== target.semester);
  if (source.length === 0) return null;
  const label = program || college || "all colleges";
  return `The workbook's Sem column says ${source
    .map((entry) => `${entry.semester} (${entry.rows} row${entry.rows === 1 ? "" : "s"})`)
    .join(", ")} but ${label} was imported into ${target.schoolYear} · ${target.semester}. Rows were written to the selected term only.`;
}
