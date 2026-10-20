"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  readRows,
  planFromRows,
  writePlan,
  type ExistingSlot,
  type ImportTargetTerm,
} from "@/lib/import";
import {
  analyzeWorkbook,
  applyDecisions,
  type RepairContext,
  type RepairDecision,
  type RepairFinding as EngineFinding,
  type RepairSummary,
  type WorkRow,
} from "@/lib/schedule-repair";
import { parseTerm } from "@/lib/terms";
import { isRepairAiEnabled, suggestRepairValue } from "@/lib/schedule-repair-ai";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function revalidateRepair() {
  revalidatePath("/schedule/repair");
  revalidatePath("/schedule");
  revalidatePath("/attendance/encode");
  revalidatePath("/attendance/print");
  revalidatePath("/summary");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Analyze — upload a workbook, persist an immutable source + its findings
// ---------------------------------------------------------------------------

export type RepairAnalyzeState = {
  ok: boolean;
  message: string;
  sourceId?: number;
  summary?: RepairSummary;
};

export async function analyzeRepairWorkbook(
  _prev: RepairAnalyzeState,
  formData: FormData,
): Promise<RepairAnalyzeState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_REPAIR);
  } catch {
    return { ok: false, message: "You do not have permission to repair schedules." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Choose a schedule workbook (.xlsx)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const { rows, missingColumns } = readRows(buffer);
  if (missingColumns.length > 0) {
    return { ok: false, message: `Missing required columns: ${missingColumns.join(", ")}` };
  }
  if (rows.length === 0) return { ok: false, message: "That file has no data rows." };

  const [courses, rooms, faculty] = await Promise.all([
    prisma.course.findMany(),
    prisma.room.findMany(),
    prisma.faculty.findMany(),
  ]);
  const ctx: RepairContext = {
    faculty: faculty.map((f) => ({ id: f.id, fullName: f.fullName })),
    courses: courses.map((c) => ({ id: c.id, code: c.code })),
    rooms: rooms.map((r) => ({ id: r.id, code: r.code })),
  };

  const target = parseTerm(str(formData, "schoolYear"), str(formData, "semester"));
  const report = analyzeWorkbook(rows, ctx);

  try {
    const sourceId = await prisma.$transaction(async (tx) => {
      const source = await tx.repairSource.upsert({
        where: { checksum },
        update: {
          filename: file.name,
          schoolYear: target?.schoolYear ?? null,
          semester: target?.semester ?? null,
          rowCount: rows.length,
          summary: report.summary as unknown as Prisma.InputJsonValue,
          rows: rows as unknown as Prisma.InputJsonValue,
          createdById: user.id,
        },
        create: {
          filename: file.name,
          checksum,
          schoolYear: target?.schoolYear ?? null,
          semester: target?.semester ?? null,
          rowCount: rows.length,
          summary: report.summary as unknown as Prisma.InputJsonValue,
          rows: rows as unknown as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });

      // Re-analysis of the same file replaces its previous findings so the run
      // stays idempotent (same input -> same rows).
      await tx.repairFinding.deleteMany({ where: { sourceId: source.id } });
      if (report.findings.length > 0) {
        await tx.repairFinding.createMany({
          data: report.findings.map((f) => ({
            sourceId: source.id,
            rowNumber: f.rowNumber,
            code: f.code,
            severity: f.severity,
            certainty: f.certainty,
            field: f.field,
            cn: f.cn,
            original: f.original,
            proposed: f.proposed,
            evidence: f.evidence,
            explanation: f.explanation,
            status: "open",
          })),
        });
      }
      return source.id;
    });

    await writeAudit(
      user.id,
      "schedule.repair.analyze",
      `Analyzed "${file.name}" (${rows.length} rows): ${report.findings.length} finding(s).`,
    );
    revalidateRepair();

    return {
      ok: true,
      message: `Analysis complete: ${report.findings.length} finding(s) across ${rows.length} rows. ${report.summary.invalidRows} row(s) cannot be printed until fixed.`,
      sourceId,
      summary: report.summary,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Could not analyze the workbook: ${detail}` };
  }
}

// ---------------------------------------------------------------------------
// Decide — accept / reject / mark unresolved for a single finding
// ---------------------------------------------------------------------------

export type RepairDecideState = { ok: boolean; message: string };

const DECISIONS = new Set(["accept", "reject", "unresolved"]);

export async function decideRepairFinding(
  _prev: RepairDecideState,
  formData: FormData,
): Promise<RepairDecideState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_REPAIR);
  } catch {
    return { ok: false, message: "You do not have permission to change repair decisions." };
  }

  const id = Number(str(formData, "findingId"));
  const action = str(formData, "action");
  const value = str(formData, "value");
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Missing finding reference." };
  if (!DECISIONS.has(action)) return { ok: false, message: "Choose accept, reject or unresolved." };

  const finding = await prisma.repairFinding.findUnique({ where: { id } });
  if (!finding) return { ok: false, message: "That finding no longer exists." };
  if (action === "accept" && value === "" && finding.proposed === null) {
    return { ok: false, message: "Enter the corrected value before accepting this finding." };
  }

  await prisma.repairFinding.update({
    where: { id },
    data: {
      status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "unresolved",
      appliedValue: action === "accept" ? value || finding.proposed : null,
      decidedById: user.id,
      decidedAt: new Date(),
    },
  });

  await writeAudit(
    user.id,
    "schedule.repair.decide",
    `Finding #${id} (${finding.code}, row ${finding.rowNumber}) -> ${action}${
      action === "accept" && value ? ` (value: ${value})` : ""
    }.`,
  );
  revalidateRepair();
  return { ok: true, message: `Finding marked ${action}.` };
}

// ---------------------------------------------------------------------------
// Suggest (optional AI helper) — advisory only, never writes
// ---------------------------------------------------------------------------

export type RepairSuggestState = { ok: boolean; message: string; value?: string };

export async function suggestRepairFinding(
  _prev: RepairSuggestState,
  formData: FormData,
): Promise<RepairSuggestState> {
  try {
    await assertPermission(PERMISSIONS.SCHEDULE_REPAIR);
  } catch {
    return { ok: false, message: "You do not have permission to use repair helpers." };
  }
  if (!isRepairAiEnabled()) {
    return { ok: false, message: "AI suggestions are disabled." };
  }

  const id = Number(str(formData, "findingId"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Missing finding reference." };

  const finding = await prisma.repairFinding.findUnique({
    where: { id },
    include: { source: { select: { rows: true } } },
  });
  if (!finding) return { ok: false, message: "That finding no longer exists." };

  const rows = finding.source.rows as unknown as WorkRow[] | null;
  const row = Array.isArray(rows) ? rows[finding.rowNumber - 2] : undefined;
  const currentValue = row ? String(row[finding.field] ?? "") : finding.original ?? "";

  const suggestion = await suggestRepairValue({
    code: finding.code,
    field: finding.field,
    rowSummary: JSON.stringify(row ?? {}),
    currentValue,
    options: [],
  });

  if (suggestion.status === "disabled") return { ok: false, message: "AI suggestions are disabled." };
  if (suggestion.status === "error") return { ok: false, message: suggestion.error };
  return {
    ok: true,
    value: suggestion.value,
    message: `AI suggests "${suggestion.value}"${suggestion.reason ? ` — ${suggestion.reason}` : ""}. Review before accepting.`,
  };
}

// ---------------------------------------------------------------------------
// Apply — write the approved corrections and import the cleaned schedules
// ---------------------------------------------------------------------------

export type RepairApplyState = {
  ok: boolean;
  message: string;
  created?: number;
  updated?: number;
  unchanged?: number;
  batchId?: number | null;
};

export async function applyRepairSource(
  _prev: RepairApplyState,
  formData: FormData,
): Promise<RepairApplyState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_REPAIR);
  } catch {
    return { ok: false, message: "You do not have permission to apply repairs." };
  }

  const sourceId = Number(str(formData, "sourceId"));
  const target: ImportTargetTerm | null = parseTerm(str(formData, "schoolYear"), str(formData, "semester"));
  if (!Number.isInteger(sourceId) || sourceId <= 0) return { ok: false, message: "Missing source reference." };
  if (!target) return { ok: false, message: "Choose the semester to write the repaired schedules into." };

  const source = await prisma.repairSource.findUnique({
    where: { id: sourceId },
    include: { findings: true },
  });
  if (!source) return { ok: false, message: "That analysis no longer exists." };
  if (!Array.isArray(source.rows)) return { ok: false, message: "The original workbook rows are unavailable; re-analyze the file." };

  // Unresolved findings block generation: a sheet must not be produced from a
  // schedule we know is wrong.
  const unresolved = source.findings.filter((f) => f.status === "unresolved");
  if (unresolved.length > 0) {
    return {
      ok: false,
      message: `${unresolved.length} finding(s) are marked unresolved. Resolve or reject them before applying.`,
    };
  }

  const engineFindings: EngineFinding[] = source.findings.map((f) => ({
    code: f.code as EngineFinding["code"],
    severity: f.severity as EngineFinding["severity"],
    certainty: f.certainty as EngineFinding["certainty"],
    rowNumber: f.rowNumber,
    cn: f.cn,
    field: f.field,
    original: f.original ?? "",
    proposed: f.proposed,
    explanation: f.explanation,
    evidence: f.evidence ?? "",
    autoFixable: false,
    requiresApproval: false,
  }));

  const decisions = new Map<string, RepairDecision>();
  for (const f of source.findings) {
    if (f.status === "open") continue;
    const key = `${f.rowNumber}|${f.code}|${f.field}`;
    if (f.status === "accepted") {
      decisions.set(key, { action: "accept", value: f.appliedValue ?? f.proposed ?? undefined });
    } else if (f.status === "rejected") {
      decisions.set(key, { action: "reject" });
    } else if (f.status === "unresolved") {
      decisions.set(key, { action: "unresolved" });
    }
  }

  const rows = source.rows as unknown as WorkRow[];
  const result = applyDecisions(rows, engineFindings, decisions);

  const [courses, rooms, faculty, existingSlots] = await Promise.all([
    prisma.course.findMany(),
    prisma.room.findMany(),
    prisma.faculty.findMany(),
    prisma.scheduleSlot.findMany({
      where: { schoolYear: target.schoolYear, semester: target.semester },
      select: {
        id: true,
        cn: true,
        weekday: true,
        startTime: true,
        endTime: true,
        roomId: true,
        subject: true,
        description: true,
        facultyId: true,
      },
    }),
  ]);

  const plan = planFromRows(result.rows, {
    courses: courses.map((c) => ({ id: c.id, code: c.code })),
    rooms: rooms.map((r) => ({ id: r.id, code: r.code })),
    faculty: faculty.map((f) => ({ id: f.id, fullName: f.fullName })),
    existingSlots: existingSlots as ExistingSlot[],
    target,
    worksheetRows: rows.length + 1,
    missingColumns: [],
  });

  try {
    const commit = await writePlan(plan, target, {
      filename: `repair:${source.filename}`,
      importedById: user.id,
    });

    await prisma.$transaction(async (tx) => {
      await tx.repairSource.update({
        where: { id: source.id },
        data: { appliedAt: new Date(), appliedBatchId: commit.batchId },
      });
      const appliedIds = source.findings.filter((f) => f.status === "accepted").map((f) => f.id);
      if (appliedIds.length > 0) {
        await tx.repairFinding.updateMany({
          where: { id: { in: appliedIds } },
          data: { status: "applied", appliedAt: new Date() },
        });
      }
    });

    await writeAudit(
      user.id,
      "schedule.repair.apply",
      `Applied repair source #${source.id} into ${target.schoolYear} ${target.semester}: +${commit.created}, ~${commit.updated}, =${commit.unchanged}. Batch ${commit.batchId ?? "n/a"}.`,
    );
    revalidateRepair();

    return {
      ok: true,
      message: `Repairs applied to ${target.schoolYear} · ${target.semester}: ${commit.created} added, ${commit.updated} updated, ${commit.unchanged} unchanged.${commit.batchId ? ` Import batch #${commit.batchId}.` : ""}`,
      created: commit.created,
      updated: commit.updated,
      unchanged: commit.unchanged,
      batchId: commit.batchId,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Could not apply repairs: ${detail}` };
  }
}

// ---------------------------------------------------------------------------
// Revert — remove the slots this repair wrote (attendance is always preserved)
// ---------------------------------------------------------------------------

export type RepairRevertState = { ok: boolean; message: string };

export async function revertRepairSource(
  _prev: RepairRevertState,
  formData: FormData,
): Promise<RepairRevertState> {
  let user;
  try {
    user = await assertPermission(PERMISSIONS.SCHEDULE_REPAIR);
  } catch {
    return { ok: false, message: "You do not have permission to revert repairs." };
  }

  const sourceId = Number(str(formData, "sourceId"));
  if (!Number.isInteger(sourceId) || sourceId <= 0) return { ok: false, message: "Missing source reference." };

  const source = await prisma.repairSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, message: "That analysis no longer exists." };
  if (!source.appliedBatchId) return { ok: false, message: "This analysis has not been applied, so there is nothing to revert." };

  let cleared = 0;
  let retained = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const slots = await tx.scheduleSlot.findMany({
        where: { importBatchId: source.appliedBatchId! },
        select: { id: true },
      });
      const ids = slots.map((s) => s.id);
      if (ids.length === 0) return;
      const protectedRows = await tx.attendance.findMany({
        where: { slotId: { in: ids } },
        select: { slotId: true },
        distinct: ["slotId"],
      });
      const protectedSet = new Set(protectedRows.map((r) => r.slotId));
      retained = protectedSet.size;
      const deletable = ids.filter((id) => !protectedSet.has(id));
      if (deletable.length > 0) {
        const res = await tx.scheduleSlot.deleteMany({ where: { id: { in: deletable } } });
        cleared = res.count;
      }
      await tx.importBatch.update({
        where: { id: source.appliedBatchId! },
        data: { slotCount: retained },
      });
      await tx.repairSource.update({
        where: { id: source.id },
        data: { appliedAt: null, appliedBatchId: null },
      });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Could not revert: ${detail}. Nothing was removed.` };
  }

  await writeAudit(
    user.id,
    "schedule.repair.revert",
    `Reverted repair source #${source.id}: removed ${cleared}, retained ${retained} (attendance).`,
  );
  revalidateRepair();

  return {
    ok: true,
    message: `Reverted: ${cleared} schedule(s) removed.${retained > 0 ? ` ${retained} kept because they have attendance history.` : ""}`,
  };
}
