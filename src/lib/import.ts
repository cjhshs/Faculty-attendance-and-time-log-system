import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { normaliseFacultyName, surnameOf, nameKey, parseScheduleCell } from "@/lib/schedule-parser";

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
  weekday: number;
  start: string;
  end: string;
  roomCode: string;
  roomType: "PHYSICAL" | "ONLINE" | "TBA";
  mode: "FACE_TO_FACE" | "ONLINE" | "LAB";
  status: PlannedSlotStatus;
  messages: string[];
};

export type ImportPlan = {
  summary: {
    rowsRead: number;
    plannedSlots: number;
    importable: number;
    newFaculty: number;
    newSlots: number;
    updatedSlots: number;
    unchangedSlots: number;
    errors: number;
    warnings: number;
  };
  slots: PlannedSlot[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  newFacultyNames: string[];
  unassigned: { row: number; cn: string; subject: string }[];
  duplicateFacultyNames: { name: string; similarTo: string; row: number }[];
  missingColumns: string[];
};

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function num(value: unknown): number {
  const n = Number(cell(value));
  return Number.isFinite(n) ? n : 0;
}

function readRows(buffer: Buffer): { rows: Record<string, unknown>[]; missingColumns: string[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes("Sheet1") ? "Sheet1" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], missingColumns: REQUIRED_COLUMNS };
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows = raw.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k.trim()] = v;
    return out;
  });
  const headers = new Set<string>();
  for (const row of rows) Object.keys(row).forEach((k) => headers.add(k));
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.has(c));
  return { rows, missingColumns };
}

function slotKey(cn: string, weekday: number, start: string, end: string, roomCode: string) {
  return `${cn}|${weekday}|${start}|${end}|${roomCode}`;
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

export async function buildPlan(buffer: Buffer): Promise<ImportPlan> {
  const { rows, missingColumns } = readRows(buffer);

  const [courses, rooms, faculty, existingSlots] = await Promise.all([
    prisma.course.findMany(),
    prisma.room.findMany(),
    prisma.faculty.findMany(),
    prisma.scheduleSlot.findMany(),
  ]);

  const courseByCode = new Map(courses.map((c) => [c.code.toUpperCase(), c]));
  const roomByCode = new Map(rooms.map((r) => [r.code.toUpperCase(), r]));
  const facultyByKey = new Map(faculty.map((f) => [nameKey(f.fullName), f]));
  const existingByKey = new Map(
    existingSlots.map((s) => {
      const roomCode = rooms.find((r) => r.id === s.roomId)?.code ?? "";
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
  const newRooms = new Set<string>();
  const newCourses = new Set<string>();

  if (missingColumns.length > 0) {
    return {
      summary: emptySummary(rows.length),
      slots: [],
      errors: [{ row: 0, message: `Missing required columns: ${missingColumns.join(", ")}` }],
      warnings: [],
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

    if (!cn) {
      errors.push({ row: rowNumber, message: "Missing CN (class number)." });
      return;
    }
    if (!courseCode) {
      errors.push({ row: rowNumber, message: `CN ${cn}: missing program/course.` });
      return;
    }
    if (!schedule) {
      errors.push({ row: rowNumber, message: `CN ${cn}: missing schedule.` });
      return;
    }

    if (!courseByCode.has(courseCode.toUpperCase())) newCourses.add(courseCode.toUpperCase());

    const { meetings, errors: parseErrors } = parseScheduleCell(schedule);
    for (const pe of parseErrors) {
      errors.push({ row: rowNumber, message: `CN ${cn}: ${pe.message} (${pe.raw})` });
    }
    if (meetings.length === 0) return;

    // Faculty assignment
    let facultyName: string | null = null;
    if (instructorRaw && instructorRaw.toUpperCase() !== "TBA") {
      facultyName = instructorRaw;
      const key = nameKey(instructorRaw);
      if (!facultyByKey.has(key)) {
        newFacultyNames.add(instructorRaw);
        // Compare against existing faculty for likely duplicates
        for (const f of faculty) {
          const score = similarity(instructorRaw, f.fullName);
          if (score >= 0.86 && score < 1) {
            duplicateFacultyNames.push({
              name: instructorRaw,
              similarTo: f.fullName,
              row: rowNumber,
            });
            break;
          }
        }
      }
    } else {
      unassigned.push({ row: rowNumber, cn, subject });
    }

    for (const meeting of meetings) {
      if (!roomByCode.has(meeting.roomCode.toUpperCase())) newRooms.add(meeting.roomCode.toUpperCase());
      for (const weekday of meeting.weekdays) {
        const key = `${cn}|${weekday}|${meeting.start}|${meeting.end}|${meeting.roomCode}`;
        const messages: string[] = [];
        if (seenSlotKeys.has(key)) {
          warnings.push({
            row: rowNumber,
            message: `Duplicate slot in file (CN ${cn}, same day/time/room) — ignored.`,
          });
          continue;
        }
        seenSlotKeys.add(key);

        const existing = existingByKey.get(key);
        let status: PlannedSlotStatus = "new";
        if (existing) {
          const sameFaculty = (existing.facultyId ? facultyByKey.get(nameKey(instructorRaw))?.id : null) === existing.facultyId;
          const unchanged =
            existing.subject === subject &&
            (existing.description ?? "") === cell(row["Description"]) &&
            sameFaculty;
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
          semester: cell(row["Sem"]) || null,
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

  const newFacultyCount = newFacultyNames.size;
  const newSlots = slots.filter((s) => s.status === "new").length;
  const updatedSlots = slots.filter((s) => s.status === "update").length;
  const unchangedSlots = slots.filter((s) => s.status === "unchanged").length;

  return {
    summary: {
      rowsRead: rows.length,
      plannedSlots: slots.length,
      importable: newSlots + updatedSlots,
      newFaculty: newFacultyCount,
      newSlots,
      updatedSlots,
      unchangedSlots,
      errors: errors.length,
      warnings: warnings.length,
    },
    slots,
    errors,
    warnings,
    newFacultyNames: Array.from(newFacultyNames),
    unassigned,
    duplicateFacultyNames,
    missingColumns,
  };
}

function emptySummary(rowsRead: number): ImportPlan["summary"] {
  return {
    rowsRead,
    plannedSlots: 0,
    importable: 0,
    newFaculty: 0,
    newSlots: 0,
    updatedSlots: 0,
    unchangedSlots: 0,
    errors: 0,
    warnings: 0,
  };
}

export type CommitResult = {
  created: number;
  updated: number;
  unchanged: number;
  facultyCreated: number;
  programsCreated: number;
  roomsCreated: number;
  errors: number;
};

export async function commitPlan(buffer: Buffer): Promise<{ plan: ImportPlan; result: CommitResult }> {
  const plan = await buildPlan(buffer);
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
  };

  await prisma.$transaction(async (tx) => {
    // Programs
    const courseCodes = Array.from(new Set(plan.slots.map((s) => s.courseCode)));
    const courseMap = new Map<string, number>();
    for (const code of courseCodes) {
      const existing = await tx.course.findUnique({ where: { code } });
      if (existing) {
        courseMap.set(code, existing.id);
      } else {
        const created = await tx.course.create({ data: { code } });
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
        weekday: slot.weekday,
        startTime: slot.start,
        endTime: slot.end,
        roomId,
        mode: slot.mode,
        termType: slot.termType,
        semester: slot.semester,
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
  });

  return { plan, result };
}
