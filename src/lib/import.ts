import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { normaliseFacultyName, surnameOf, nameKey, parseScheduleCell } from "@/lib/schedule-parser";
import { normalizeSemester } from "@/lib/terms";
import { timeToMinutes, WEEKDAY_NAMES } from "@/lib/dates";
import { programNameFor } from "@/lib/program-names";

export type ImportTargetTerm = { schoolYear: string; semester: string };

export const REQUIRED_COLUMNS = [
  "Term Type",
  "Subject",
  "CN",
  "Description",
  "Unit",
  "Sem",
  "Schedule",
  "Section",
  "Course",
  "Slots",
  "Instructor",
  "Code",
];

export type PlannedSlotStatus = "new" | "update" | "unchanged" | "error";

export type PlannedSlot = {
  rowNumber: number;
  cn: string;
  subject: string;
  description: string | null;
  units: number;
  section: string | null;
  yearLevel: string | null;
  courseCode: string;
  instructorRaw: string;
  facultyName: string | null;
  termType: string | null;
  semester: string | null;
  schoolYear: string | null;
  weekday: number;
  start: string;
  end: string;
  roomCode: string;
  roomType: "PHYSICAL" | "ONLINE" | "TBA";
  mode: "FACE_TO_FACE" | "ONLINE" | "LAB";
  status: PlannedSlotStatus;
  messages: string[];
};

export type ImportConflict = {
  facultyName: string;
  weekday: number;
  sameClassNumber: boolean;
  a: { rowNumber: number; cn: string; subject: string; courseCode: string; start: string; end: string; roomCode: string };
  b: { rowNumber: number; cn: string; subject: string; courseCode: string; start: string; end: string; roomCode: string };
  message: string;
};

export type ImportReconciliation = {
  worksheetRows: number;
  dataRows: number;
  parsedRows: number;
  errorRows: number;
  warningRows: number;
  meetingEntries: number;
  validBlocks: number;
};

export type ImportSummary = ImportReconciliation & {
  rowsRead: number;
  plannedSlots: number;
  importable: number;
  newFaculty: number;
  newSlots: number;
  updatedSlots: number;
  unchangedSlots: number;
  duplicateSlots: number;
  errors: number;
  warnings: number;
  conflicts: number;
};

export type ImportPlan = {
  summary: ImportSummary;
  targetTerm: ImportTargetTerm | null;
  slots: PlannedSlot[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  conflicts: ImportConflict[];
  newFacultyNames: string[];
  unassigned: { row: number; cn: string; subject: string }[];
  duplicateFacultyNames: { name: string; similarTo: string; row: number }[];
  missingColumns: string[];
};

export type ExistingSlot = {
  id: number;
  cn: string;
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: number;
  subject: string;
  description: string | null;
  facultyId: number | null;
};

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function num(value: unknown): number {
  const n = Number(cell(value));
  return Number.isFinite(n) ? n : 0;
}

export function readRows(buffer: Buffer): {
  rows: Record<string, unknown>[];
  missingColumns: string[];
  worksheetRows: number;
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes("Sheet1") ? "Sheet1" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], missingColumns: REQUIRED_COLUMNS, worksheetRows: 0 };
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows = raw.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k.trim()] = v;
    return out;
  });
  const headers = new Set<string>();
  for (const row of rows) Object.keys(row).forEach((k) => headers.add(k));
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.has(c));
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  const worksheetRows = range ? range.e.r - range.s.r + 1 : raw.length + 1;
  return { rows, missingColumns, worksheetRows };
}

// Similarity on character bigrams, used to surface likely duplicate faculty names.
function similarity(a: string, b: string): number {
  const s1 = nameKey(a).replace(/[^a-z ]/g, "");
  const s2 = nameKey(b).replace(/[^a-z ]/g, "");
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const a2 = grams(s1);
  const b2 = grams(s2);
  let inter = 0;
  for (const g of a2) if (b2.has(g)) inter++;
  return (2 * inter) / (a2.size + b2.size);
}

// Detect instructors booked in two places at the same time on the same weekday.
// Nothing is resolved silently: every overlapping pair is reported so the dean
// can decide which class the schedule should keep.
export function detectFacultyConflicts(slots: PlannedSlot[]): ImportConflict[] {
  const byFacultyDay = new Map<string, PlannedSlot[]>();
  for (const slot of slots) {
    if (!slot.facultyName) continue;
    const key = `${nameKey(slot.facultyName)}|${slot.weekday}`;
    const list = byFacultyDay.get(key) ?? [];
    list.push(slot);
    byFacultyDay.set(key, list);
  }

  const conflicts: ImportConflict[] = [];
  for (const [key, group] of byFacultyDay) {
    const weekday = Number(key.split("|")[1]);
    const ordered = [...group].sort(
      (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || timeToMinutes(a.end) - timeToMinutes(b.end),
    );
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i];
        const b = ordered[j];
        if (timeToMinutes(b.start) >= timeToMinutes(a.end)) break;
        const day = WEEKDAY_NAMES[weekday] ?? "";
        conflicts.push({
          facultyName: a.facultyName ?? "",
          weekday,
          sameClassNumber: a.cn === b.cn,
          a: { rowNumber: a.rowNumber, cn: a.cn, subject: a.subject, courseCode: a.courseCode, start: a.start, end: a.end, roomCode: a.roomCode },
          b: { rowNumber: b.rowNumber, cn: b.cn, subject: b.subject, courseCode: b.courseCode, start: b.start, end: b.end, roomCode: b.roomCode },
          message: `${a.facultyName}: ${day} ${a.start}-${a.end} (CN ${a.cn} ${a.subject}) overlaps ${b.start}-${b.end} (CN ${b.cn} ${b.subject}).`,
        });
      }
    }
  }
  return conflicts;
}

export type PlanContext = {
  faculty: { id: number; fullName: string }[];
  courses: { id: number; code: string }[];
  rooms: { id: number; code: string }[];
  existingSlots: ExistingSlot[];
  target?: ImportTargetTerm | null;
  worksheetRows?: number;
  missingColumns?: string[];
};

// Pure parse + planning core: turns worksheet rows into validated, term-stamped
// slots and reconciliation totals. It performs no database access so it can be
// unit-tested against the real workbook deterministically.
export function planFromRows(rows: Record<string, unknown>[], ctx: PlanContext): ImportPlan {
  const target = ctx.target ?? null;
  const missingColumns = ctx.missingColumns ?? [];
  const worksheetRows = ctx.worksheetRows ?? rows.length + 1;
  const roomById = new Map(ctx.rooms.map((r) => [r.id, r]));
  const facultyByKey = new Map(ctx.faculty.map((f) => [nameKey(f.fullName), f]));
  const existingByKey = new Map(
    ctx.existingSlots.map((s) => {
      const roomCode = roomById.get(s.roomId)?.code ?? "";
      return [`${s.cn}|${s.weekday}|${s.startTime}|${s.endTime}|${roomCode}`, s];
    }),
  );

  const slots: PlannedSlot[] = [];
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  const unassigned: { row: number; cn: string; subject: string }[] = [];
  const duplicateFacultyNames: { name: string; similarTo: string; row: number }[] = [];
  const newFacultyNames = new Set<string>();
  const seenSlotKeys = new Set<string>();
  const errorRowSet = new Set<number>();
  const warningRowSet = new Set<number>();
  let meetingEntries = 0;
  let validBlocks = 0;

  if (missingColumns.length > 0) {
    return {
      summary: emptySummary(rows.length, worksheetRows),
      targetTerm: target,
      slots: [],
      errors: [{ row: 0, message: `Missing required columns: ${missingColumns.join(", ")}` }],
      warnings: [],
      conflicts: [],
      newFacultyNames: [],
      unassigned: [],
      duplicateFacultyNames: [],
      missingColumns,
    };
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // row 1 is the header
    const cn = cell(row["CN"]);
    const subject = cell(row["Subject"]);
    const courseCode = cell(row["Course"]);
    const schedule = cell(row["Schedule"]);
    const instructorRaw = normaliseFacultyName(cell(row["Instructor"]));

    const fail = (message: string) => {
      errors.push({ row: rowNumber, message });
      errorRowSet.add(rowNumber);
    };

    if (!cn) {
      fail("Missing CN (class number).");
      return;
    }
    if (!courseCode) {
      fail(`CN ${cn}: missing program/course.`);
      return;
    }
    if (!schedule) {
      fail(`CN ${cn}: missing schedule.`);
      return;
    }

    meetingEntries += schedule
      .split("||")
      .map((p) => p.trim())
      .filter(Boolean).length;

    const { meetings, errors: parseErrors } = parseScheduleCell(schedule);
    for (const pe of parseErrors) {
      fail(`CN ${cn}: ${pe.message} (${pe.raw})`);
    }
    validBlocks += meetings.length;
    if (meetings.length === 0) return;

    // Faculty assignment
    let facultyName: string | null = null;
    if (instructorRaw && instructorRaw.toUpperCase() !== "TBA") {
      facultyName = instructorRaw;
      const key = nameKey(instructorRaw);
      if (!facultyByKey.has(key)) {
        newFacultyNames.add(instructorRaw);
        for (const f of ctx.faculty) {
          const score = similarity(instructorRaw, f.fullName);
          if (score >= 0.86 && score < 1) {
            duplicateFacultyNames.push({ name: instructorRaw, similarTo: f.fullName, row: rowNumber });
            break;
          }
        }
      }
    } else {
      unassigned.push({ row: rowNumber, cn, subject });
      warnings.push({ row: rowNumber, message: `CN ${cn}: unassigned instructor (TBA).` });
      warningRowSet.add(rowNumber);
    }

    for (const meeting of meetings) {
      for (const weekday of meeting.weekdays) {
        const key = `${cn}|${weekday}|${meeting.start}|${meeting.end}|${meeting.roomCode}`;
        const messages: string[] = [];
        if (seenSlotKeys.has(key)) {
          warnings.push({
            row: rowNumber,
            message: `Duplicate slot in file (CN ${cn}, same day/time/room) — ignored.`,
          });
          warningRowSet.add(rowNumber);
          continue;
        }
        seenSlotKeys.add(key);

        const existing = existingByKey.get(key);
        let status: PlannedSlotStatus = "new";
        if (existing) {
          const sameFaculty =
            (existing.facultyId ? facultyByKey.get(nameKey(instructorRaw))?.id : null) === existing.facultyId;
          const unchanged =
            existing.subject === subject && (existing.description ?? "") === cell(row["Description"]) && sameFaculty;
          status = unchanged ? "unchanged" : "update";
        }

        slots.push({
          rowNumber,
          cn,
          subject,
          description: cell(row["Description"]) || null,
          units: num(row["Unit"]),
          section: cell(row["Section"]) || null,
          yearLevel: cell(row["Code"]) || null,
          courseCode: courseCode.toUpperCase(),
          instructorRaw,
          facultyName,
          termType: cell(row["Term Type"]) || null,
          semester: target?.semester ?? normalizeSemester(cell(row["Sem"])) ?? null,
          schoolYear: target?.schoolYear ?? null,
          weekday,
          start: meeting.start,
          end: meeting.end,
          roomCode: meeting.roomCode,
          roomType: meeting.roomType,
          mode: meeting.mode,
          status,
          messages,
        });
      }
    }
  });

  const conflicts = detectFacultyConflicts(slots);

  const newSlots = slots.filter((s) => s.status === "new").length;
  const updatedSlots = slots.filter((s) => s.status === "update").length;
  const unchangedSlots = slots.filter((s) => s.status === "unchanged").length;

  return {
    summary: {
      worksheetRows,
      dataRows: rows.length,
      parsedRows: rows.length - errorRowSet.size,
      errorRows: errorRowSet.size,
      warningRows: warningRowSet.size,
      meetingEntries,
      validBlocks,
      rowsRead: rows.length,
      plannedSlots: slots.length,
      importable: newSlots + updatedSlots,
      newFaculty: newFacultyNames.size,
      newSlots,
      updatedSlots,
      unchangedSlots,
      duplicateSlots: updatedSlots + unchangedSlots,
      errors: errors.length,
      warnings: warnings.length,
      conflicts: conflicts.length,
    },
    targetTerm: target,
    slots,
    errors,
    warnings,
    conflicts,
    newFacultyNames: Array.from(newFacultyNames),
    unassigned,
    duplicateFacultyNames,
    missingColumns,
  };
}

function emptySummary(rowsRead: number, worksheetRows: number): ImportSummary {
  return {
    worksheetRows,
    dataRows: rowsRead,
    parsedRows: 0,
    errorRows: 0,
    warningRows: 0,
    meetingEntries: 0,
    validBlocks: 0,
    rowsRead,
    plannedSlots: 0,
    importable: 0,
    newFaculty: 0,
    newSlots: 0,
    updatedSlots: 0,
    unchangedSlots: 0,
    duplicateSlots: 0,
    errors: 0,
    warnings: 0,
    conflicts: 0,
  };
}

export async function buildPlan(
  buffer: Buffer,
  target?: ImportTargetTerm | null,
): Promise<ImportPlan> {
  const { rows, missingColumns, worksheetRows } = readRows(buffer);

  const [courses, rooms, faculty, allExistingSlots] = await Promise.all([
    prisma.course.findMany(),
    prisma.room.findMany(),
    prisma.faculty.findMany(),
    prisma.scheduleSlot.findMany(),
  ]);

  // When importing into a specific term, only compare against that term's
  // schedules so a new semester never collides with previous semesters.
  const existingSlots = target
    ? allExistingSlots.filter(
        (s) => s.schoolYear === target.schoolYear && s.semester === target.semester,
      )
    : allExistingSlots;

  return planFromRows(rows, {
    courses: courses.map((c) => ({ id: c.id, code: c.code })),
    rooms: rooms.map((r) => ({ id: r.id, code: r.code })),
    faculty: faculty.map((f) => ({ id: f.id, fullName: f.fullName })),
    existingSlots,
    target,
    worksheetRows,
    missingColumns,
  });
}

export type CommitResult = {
  created: number;
  updated: number;
  unchanged: number;
  facultyCreated: number;
  programsCreated: number;
  roomsCreated: number;
  errors: number;
  batchId: number | null;
};

export type ImportBatchMeta = { filename?: string; importedById?: number };

export async function commitPlan(
  buffer: Buffer,
  target?: ImportTargetTerm | null,
  meta?: ImportBatchMeta,
): Promise<{ plan: ImportPlan; result: CommitResult }> {
  const plan = await buildPlan(buffer, target);
  if (plan.missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${plan.missingColumns.join(", ")}`);
  }
  const result = await writePlan(plan, target, meta);
  return { plan, result };
}

// Persist an already-computed plan. Shared by the file importer and the schedule
// repair engine so both paths write slots through exactly one code path.
export async function writePlan(
  plan: ImportPlan,
  target?: ImportTargetTerm | null,
  meta?: ImportBatchMeta,
): Promise<CommitResult> {
  if (plan.missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${plan.missingColumns.join(", ")}`);
  }

  const result: CommitResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    facultyCreated: 0,
    programsCreated: 0,
    roomsCreated: 0,
    errors: plan.errors.length,
    batchId: null,
  };

  // Only bother tracking a batch when a target term is known and the file will
  // actually create or update at least one slot. Unchanged/error rows keep
  // whatever batch they already belonged to.
  const willWrite = plan.slots.some((s) => s.status === "new" || s.status === "update");

  await prisma.$transaction(async (tx) => {
    // Import batch — lets a single upload be identified and cleared later,
    // without touching manually created or previously imported schedules.
    let batchId: number | null = null;
    if (target && willWrite) {
      const batch = await tx.importBatch.create({
        data: {
          filename: meta?.filename?.trim() || "schedule.xlsx",
          schoolYear: target.schoolYear,
          semester: target.semester,
          importedById: meta?.importedById ?? null,
        },
      });
      batchId = batch.id;
    }

    // Programs
    const courseCodes = Array.from(new Set(plan.slots.map((s) => s.courseCode)));
    const courseMap = new Map<string, number>();
    for (const code of courseCodes) {
      const existing = await tx.course.findUnique({ where: { code } });
      if (existing) {
        // A program created by an earlier import had only a code; give it its
        // real name as soon as we know it.
        if (!existing.name && programNameFor(code)) {
          await tx.course.update({ where: { id: existing.id }, data: { name: programNameFor(code)! } });
        }
        courseMap.set(code, existing.id);
      } else {
        const created = await tx.course.create({ data: { code, name: programNameFor(code) } });
        courseMap.set(code, created.id);
        result.programsCreated++;
      }
    }

    // Rooms
    const roomCodes = Array.from(new Set(plan.slots.map((s) => s.roomCode.toUpperCase())));
    const roomMap = new Map<string, number>();
    for (const code of roomCodes) {
      const existing = await tx.room.findUnique({ where: { code } });
      if (existing) {
        roomMap.set(code, existing.id);
      } else {
        const type = plan.slots.find((s) => s.roomCode.toUpperCase() === code)?.roomType ?? "PHYSICAL";
        const created = await tx.room.create({ data: { code, type } });
        roomMap.set(code, created.id);
        result.roomsCreated++;
      }
    }

    // Faculty
    const facultyNames = Array.from(
      new Set(plan.slots.map((s) => s.facultyName).filter((n): n is string => !!n)),
    );
    const facultyMap = new Map<string, number>();
    for (const name of facultyNames) {
      const existing = await tx.faculty.findFirst({
        where: { fullName: { equals: name, mode: "insensitive" } },
      });
      if (existing) {
        facultyMap.set(nameKey(name), existing.id);
      } else {
        const created = await tx.faculty.create({ data: { fullName: name, surname: surnameOf(name) } });
        facultyMap.set(nameKey(name), created.id);
        result.facultyCreated++;
      }
    }

    // Slots
    for (const slot of plan.slots) {
      const courseId = courseMap.get(slot.courseCode)!;
      const roomId = roomMap.get(slot.roomCode.toUpperCase())!;
      const facultyId = slot.facultyName ? facultyMap.get(nameKey(slot.facultyName)) ?? null : null;

      const existing = await tx.scheduleSlot.findFirst({
        where: {
          cn: slot.cn,
          weekday: slot.weekday,
          startTime: slot.start,
          endTime: slot.end,
          roomId,
          ...(target ? { schoolYear: target.schoolYear, semester: target.semester } : {}),
        },
      });
      const data = {
        cn: slot.cn,
        subject: slot.subject,
        description: slot.description,
        units: slot.units,
        section: slot.section,
        yearLevel: slot.yearLevel,
        courseId,
        facultyId,
        termType: slot.termType,
        semester: target?.semester ?? slot.semester,
        schoolYear: target?.schoolYear ?? slot.schoolYear,
        weekday: slot.weekday,
        startTime: slot.start,
        endTime: slot.end,
        roomId,
        mode: slot.mode,
        importBatchId: batchId,
      };

      if (existing) {
        if (slot.status === "unchanged") {
          result.unchanged++;
        } else {
          await tx.scheduleSlot.update({ where: { id: existing.id }, data });
          result.updated++;
        }
      } else {
        await tx.scheduleSlot.create({ data });
        result.created++;
      }
    }

    if (batchId) {
      await tx.importBatch.update({
        where: { id: batchId },
        data: { slotCount: result.created + result.updated },
      });
      result.batchId = batchId;
    }
  });

  return result;
}
