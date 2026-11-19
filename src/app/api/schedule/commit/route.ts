import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { commitPlan, AmbiguousFacultyError, type ImportPlan, type ImportScope } from "@/lib/import";
import { parseTerm, isValidTerm } from "@/lib/terms";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeCourseCode } from "@/lib/college-catalog";
import { formatISODate } from "@/lib/dates";
import { describeDuplicateImport, importChecksum } from "@/lib/import-checksum";
import { getAcademicPeriod, saveAcademicPeriod } from "@/lib/academic-period";
import {
  describeImportRange,
  parseImportRange,
  resolveImportRange,
} from "@/lib/import-range";

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
  const rangeInput = parseImportRange(form);
  if (!rangeInput.ok) {
    return NextResponse.json({ error: rangeInput.error }, { status: 400 });
  }
  const college = String(form.get("college") ?? "CET").trim() || "CET";
  const program = String(form.get("program") ?? "").trim();
  const confirmDuplicate = String(form.get("confirmDuplicate") ?? "") === "1";
  const reprocessOnly = String(form.get("reprocessOnly") ?? "") === "1";

  let facultyAssignments: Record<string, number> = {};
  try {
    facultyAssignments = parseFacultyAssignments(form.get("facultyAssignments"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid faculty assignments." },
      { status: 400 },
    );
  }

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
    const range = resolveImportRange(
      rangeInput.input,
      period,
      `${target.schoolYear} · ${target.semester}`,
    );
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }
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
        facultyAssignments,
        reprocessOnly,
        // Reprocess is schedule-only by design (its confirmation text promises
        // no attendance records are written), so never pre-create rows there.
        attendanceRange: !reprocessOnly && range.resolved.start && range.resolved.end
          ? { start: range.resolved.start, end: range.resolved.end }
          : null,
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
      reprocessOnly ? "schedule.reprocess" : "schedule.import",
      `${
        reprocessOnly ? "Reprocessed" : "Imported"
      } ${file.name}${termLabel}${scopeLabel}: ${result.created} added, ${result.updated} updated, ${
        result.unchanged
      } unchanged, ${result.skippedOutOfScope} outside scope${
        reprocessOnly ? `, ${result.skippedNew} new slot(s) skipped` : ""
      }, ${result.ambiguousUnlinked} ambiguous instructor link(s) left unlinked.${
        result.batchId ? ` Batch #${result.batchId}.` : ""
      } ${describeImportRange(range.resolved)}: ${result.attendanceRowsCreated} unencoded attendance row(s) pre-created across ${result.attendanceDates} date(s).${
        mismatches ? ` Term mismatch warning: ${mismatches}` : ""
      }`,
    );
    return NextResponse.json({
      result,
      termWarning: mismatches || null,
      range: {
        mode: range.resolved.mode,
        warning: range.resolved.warning,
        startDate: range.resolved.start ? formatISODate(range.resolved.start) : null,
        endDate: range.resolved.end ? formatISODate(range.resolved.end) : null,
      },
    });
  } catch (error) {
    if (error instanceof AmbiguousFacultyError) {
      return NextResponse.json(
        { error: error.message, code: error.code, entries: error.entries },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed. No changes were saved." },
      { status: 400 },
    );
  }
}

// The import UI sends one JSON object: normalized instructor name -> faculty id.
// Only positive integer ids are accepted; anything else is rejected before the
// write transaction opens.
function parseFacultyAssignments(raw: FormDataEntryValue | null): Record<string, number> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Faculty assignments were not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Faculty assignments must be an object.");
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const id = Number(value);
    if (!key.trim() || !Number.isInteger(id) || id <= 0) {
      throw new Error("Each faculty assignment must use a positive faculty id.");
    }
    result[key] = id;
  }
  return result;
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
