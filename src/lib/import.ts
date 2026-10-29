import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { normaliseFacultyName, surnameOf, nameKey, parseScheduleCell } from "@/lib/schedule-parser";
import { facultyNameKey, nameSimilarity, type RosterFaculty } from "@/lib/faculty-department";
import { normalizeSemester } from "@/lib/terms";
import { timeToMinutes, WEEKDAY_NAMES } from "@/lib/dates";
import { programNameFor } from "@/lib/program-names";
import {
  COLLEGE_DEFS,
  UNASSIGNED_COLLEGE_VALUE,
  collegeNameFor,
  normalizeCourseCode,
  programForCode,
} from "@/lib/college-catalog";

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

// How an overlapping pair should be read by a human reviewer:
//   CONFLICT  — different classes booked on the same instructor at the same time.
//   COMBINED  — the same subject taught to two sections at once (may be an
//               intentional combined class; still needs a decision).
//   DUPLICATE — one class recorded twice (same CN, or same subject+section under
//               different CNs) with overlapping times. Not a real conflict.
export type ImportConflictKind = "CONFLICT" | "COMBINED" | "DUPLICATE";

export type ImportConflictParty = {
  rowNumber: number;
  cn: string;
  subject: string;
  section: string | null;
  courseCode: string;
  start: string;
  end: string;
  roomCode: string;
};

export type ImportConflict = {
  kind: ImportConflictKind;
  blocking: boolean;
  facultyName: string;
  weekday: number;
  weekdays: number[];
  sameClassNumber: boolean;
  sameSubject: boolean;
  sameSection: boolean;
  a: ImportConflictParty;
  b: ImportConflictParty;
  // For COMBINED blocks: every class number meeting together at once.
  cnList: string[];
  message: string;
  recommendation: string;
};

export type IncompleteSchedule = {
  row: number;
  cn: string;
  subject: string;
  section: string | null;
  courseCode: string;
  schedule: string;
  message: string;
};

export type TbaClassroom = {
  row: number;
  cn: string;
  subject: string;
  section: string | null;
  courseCode: string;
  facultyName: string | null;
  weekdays: number[];
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

// One program (Excel `Course` value) found in the uploaded workbook, with the
// college it maps to and what will happen to it on commit. Shown to the
// administrator before anything is written.
export type ProgramMapping = {
  code: string;
  sourceCodes: string[];
  name: string | null;
  collegeCode: string | null;
  collegeName: string | null;
  official: boolean;
  inCatalog: boolean;
  rows: number;
  slots: number;
  faculty: number;
  firstRow: number;
};

// Which part of the workbook a commit should write. The preview always validates
// the whole file, so cross-department instructor conflicts stay visible.
export type ImportScope = {
  college?: string | null;
  program?: string | null;
  // Normalized program code -> college code (null = unassigned) as stored in
  // the database, so an administrator's reassignment wins over the catalog.
  collegeByCode?: Record<string, string | null>;
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
  combinedClasses: number;
  duplicateSchedules: number;
  incompleteSchedules: number;
  tbaClassrooms: number;
  programsInFile: number;
  programsMapped: number;
  programsUnassigned: number;
  programsUnknown: number;
};

export type ImportPlan = {
  summary: ImportSummary;
  targetTerm: ImportTargetTerm | null;
  slots: PlannedSlot[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  conflicts: ImportConflict[];
  combinedClasses: ImportConflict[];
  duplicateSchedules: ImportConflict[];
  incompleteSchedules: IncompleteSchedule[];
  tbaClassrooms: TbaClassroom[];
  programMapping: ProgramMapping[];
  newFacultyNames: string[];
  unassigned: { row: number; cn: string; subject: string }[];
  duplicateFacultyNames: { name: string; similarTo: string; row: number }[];
  // Instructor names that cannot be safely assigned to a roster member. The
  // parser never guesses a department from the course code or student program.
  facultyReview: FacultyReviewEntry[];
  // Distinct semester values written in the workbook's "Sem" column. They are
  // reported only; with an explicit target term they are never used to move a
  // row into a different period.
  sourceSemesters: { semester: string; rows: number }[];
  missingColumns: string[];
};

// A human must resolve these before the roster/department is trustworthy. An
// unknown name may be a new hire or a typo; an ambiguous name matches more than
// one roster row; a "no-department" match is a real faculty member whose
// official department has not been assigned yet.
export type FacultyReviewKind = "unknown" | "ambiguous" | "no-department";

export type FacultyReviewCandidate = {
  facultyId: number;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
};

export type FacultyReviewEntry = {
  name: string;
  kind: FacultyReviewKind;
  rows: number[];
  programs: string[];
  candidates: FacultyReviewCandidate[];
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

// A class is identified by CN + subject + section. Two meetings that share all
// three describe the same class, even if the sheet repeats it with a different
// room or a longer end time.
export type OverlapCandidate = {
  rowNumber: number;
  cn: string;
  subject: string;
  section: string | null;
  courseCode: string;
  facultyName: string | null;
  weekday: number;
  start: string;
  end: string;
  roomCode: string;
};

function classKey(item: OverlapCandidate): string {
  return `${item.cn.trim()}|${nameKey(item.subject)}|${(item.section ?? "").trim().toUpperCase()}`;
}

function subjectKey(item: OverlapCandidate): string {
  return nameKey(item.subject).replace(/[^a-z0-9]/g, "");
}

function sectionKey(item: OverlapCandidate): string {
  return (item.section ?? "").trim().toUpperCase();
}

function party(item: OverlapCandidate): ImportConflictParty {
  return {
    rowNumber: item.rowNumber,
    cn: item.cn,
    subject: item.subject,
    section: item.section,
    courseCode: item.courseCode,
    start: item.start,
    end: item.end,
    roomCode: item.roomCode,
  };
}

function describe(item: OverlapCandidate): string {
  const section = item.section ? ` ${item.section}` : "";
  return `${item.start}-${item.end} (CN ${item.cn} ${item.subject}${section} ${item.roomCode})`;
}

// Classify every pair of one instructor's meetings that overlap on a common day.
// Overlaps are grouped per class pair so one bad pair is reported once, listing
// every affected weekday, instead of once per day. Same-subject blocks are
// merged so a class shared by six sections is one finding, not fifteen pairs.
// Pure and deterministic: shared by the importer and the repair engine.
export function classifyOverlaps(items: OverlapCandidate[]): ImportConflict[] {
  const byFacultyDay = new Map<string, OverlapCandidate[]>();
  for (const slot of items) {
    if (!slot.facultyName) continue;
    const key = `${nameKey(slot.facultyName)}|${slot.weekday}`;
    const list = byFacultyDay.get(key) ?? [];
    list.push(slot);
    byFacultyDay.set(key, list);
  }

  type Group = { a: OverlapCandidate; b: OverlapCandidate; weekdays: Set<number>; kind: ImportConflictKind };
  const groups = new Map<string, Group>();

  for (const [key, group] of byFacultyDay) {
    const weekday = Number(key.split("|")[1]);
    const ordered = [...group].sort(
      (a, b) =>
        timeToMinutes(a.start) - timeToMinutes(b.start) || timeToMinutes(a.end) - timeToMinutes(b.end),
    );
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i];
        const b = ordered[j];
        // Half-open intervals: a class that ends at 16:00 does not overlap one
        // that starts at 16:00. Only a later start can ever be safe to skip.
        if (timeToMinutes(b.start) >= timeToMinutes(a.end)) break;

        const ka = classKey(a);
        const kb = classKey(b);
        const pairKey = ka <= kb ? `${ka}~${kb}` : `${kb}~${ka}`;
        const existing = groups.get(pairKey);
        if (existing) {
          existing.weekdays.add(weekday);
          continue;
        }
        const [first, second] = ka <= kb ? [a, b] : [b, a];
        const sameSubject = subjectKey(first) === subjectKey(second);
        // A repeated CN is the same class unless the subject disagrees, in which
        // case the CN is being reused for two different classes (bad data) and
        // the pair must stay a conflict.
        const sameCn = first.cn.trim() === second.cn.trim();
        const kind: ImportConflictKind =
          (sameCn && sameSubject) ||
          (sameSubject && sectionKey(first) === sectionKey(second))
            ? "DUPLICATE"
            : sameSubject
              ? "COMBINED"
              : "CONFLICT";
        groups.set(pairKey, { a: first, b: second, weekdays: new Set([weekday]), kind });
      }
    }
  }

  const findings: ImportConflict[] = [];
  const emit = (
    kind: ImportConflictKind,
    facultyName: string,
    a: OverlapCandidate,
    b: OverlapCandidate,
    weekdays: number[],
    cnList: string[],
  ) => {
    const sameClassNumber = a.cn.trim() === b.cn.trim();
    const sameSubject = subjectKey(a) === subjectKey(b);
    const sameSection = sectionKey(a) === sectionKey(b);
    const days = weekdays.map((d) => WEEKDAY_NAMES[d] ?? `Day ${d}`).join(", ");
    const label =
      kind === "CONFLICT"
        ? "Conflict"
        : kind === "COMBINED"
          ? "Possible combined class"
          : "Duplicate record";
    const body =
      kind === "COMBINED" && cnList.length > 2
        ? `${a.start}-${b.end} ${a.subject} is scheduled for ${cnList.length} sections at once (CN ${cnList.join(", ")}).`
        : `${describe(a)} overlaps ${describe(b)}.`;
    const recommendation =
      kind === "CONFLICT"
        ? "The same instructor cannot teach both classes. Move one class to another day/time or assign another instructor."
        : kind === "COMBINED"
          ? "Two or more sections of the same subject meet together — confirm whether this is an intentional combined class before committing."
          : sameClassNumber
            ? "Same CN appears twice with overlapping times — keep one meeting (the sheet likely lists alternative rooms/durations for one class)."
            : "Same subject and section are filed under two CNs with identical times — merge into one class number.";
    findings.push({
      kind,
      blocking: kind === "CONFLICT",
      facultyName,
      weekday: weekdays[0],
      weekdays,
      sameClassNumber,
      sameSubject,
      sameSection,
      a: party(a),
      b: party(b),
      cnList,
      message: `${label} — ${facultyName}: ${days}. ${body}`,
      recommendation,
    });
  };

  // Different classes meeting at once: one finding per class pair, listing every
  // affected weekday on a single line. Duplicate records are kept per pair too.
  // Same-subject blocks are merged so a PATHFIT class shared by six sections is
  // reported once, not once for every combination of sections.
  const blocks = new Map<
    string,
    { members: Map<string, OverlapCandidate>; weekdays: Set<number> }
  >();

  for (const g of groups.values()) {
    const weekdays = Array.from(g.weekdays).sort((x, y) => x - y);
    if (g.kind !== "COMBINED") {
      emit(g.kind, g.a.facultyName ?? "", g.a, g.b, weekdays, [g.a.cn, g.b.cn]);
      continue;
    }
    const key = `${nameKey(g.a.facultyName ?? "")}|${subjectKey(g.a)}|${g.a.start}|${weekdays.join(",")}`;
    const block = blocks.get(key) ?? { members: new Map<string, OverlapCandidate>(), weekdays: new Set<number>() };
    for (const slot of [g.a, g.b]) if (!block.members.has(classKey(slot))) block.members.set(classKey(slot), slot);
    weekdays.forEach((d) => block.weekdays.add(d));
    blocks.set(key, block);
  }

  for (const block of blocks.values()) {
    const members = Array.from(block.members.values()).sort((a, b) => a.cn.localeCompare(b.cn));
    if (members.length < 2) continue;
    const weekdays = Array.from(block.weekdays).sort((a, b) => a - b);
    const cnList = Array.from(new Set(members.map((m) => m.cn)));
    emit("COMBINED", members[0].facultyName ?? "", members[0], members[1], weekdays, cnList);
  }

  return findings.sort(
    (x, y) =>
      nameKey(x.facultyName).localeCompare(nameKey(y.facultyName)) ||
      x.weekday - y.weekday ||
      timeToMinutes(x.a.start) - timeToMinutes(y.a.start) ||
      x.a.cn.localeCompare(y.a.cn) ||
      x.b.cn.localeCompare(y.b.cn),
  );
}

// Genuine instructor double-bookings only (different classes at the same time).
export function detectFacultyConflicts(slots: PlannedSlot[]): ImportConflict[] {
  return detectScheduleConflicts(slots).filter((c) => c.kind === "CONFLICT");
}

export function detectScheduleConflicts(slots: PlannedSlot[]): ImportConflict[] {
  return classifyOverlaps(
    slots.map((slot) => ({
      rowNumber: slot.rowNumber,
      cn: slot.cn,
      subject: slot.subject,
      section: slot.section,
      courseCode: slot.courseCode,
      facultyName: slot.facultyName,
      weekday: slot.weekday,
      start: slot.start,
      end: slot.end,
      roomCode: slot.roomCode,
    })),
  );
}

export type PlanContext = {
  faculty: {
    id: number;
    fullName: string;
    departmentCode?: string | null;
    departmentName?: string | null;
    active?: boolean;
  }[];
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
  // Roster matching ignores capitalization, repeated spaces and comma spacing,
  // but never reorders name tokens or drops middle initials. Two genuinely
  // different people therefore cannot collapse into one match.
  const facultyByKey = new Map(ctx.faculty.map((f) => [facultyNameKey(f.fullName), f]));
  const existingByKey = new Map(
    ctx.existingSlots.map((s) => {
      const roomCode = roomById.get(s.roomId)?.code ?? "";
      return [`${s.cn}|${s.weekday}|${s.startTime}|${s.endTime}|${roomCode.toUpperCase()}`, s];
    }),
  );

  const slots: PlannedSlot[] = [];
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  const unassigned: { row: number; cn: string; subject: string }[] = [];
  const incompleteSchedules: IncompleteSchedule[] = [];
  const duplicateFacultyNames: { name: string; similarTo: string; row: number }[] = [];
  const newFacultyNames = new Set<string>();
  // Every non-TBA instructor name in the file, with where it appeared. Used
  // after parsing to report unknowns/ambiguities without guessing a department.
  const instructorUsage = new Map<
    string,
    { name: string; rows: Set<number>; programs: Set<string> }
  >();
  const seenSlotKeys = new Set<string>();
  const errorRowSet = new Set<number>();
  const warningRowSet = new Set<number>();
  let meetingEntries = 0;
  let validBlocks = 0;

  // Read the workbook's own semester column so the preview can warn when the
  // file describes a different term than the one selected for import. This is
  // reported, never used to override the explicit target term.
  const sourceSemesterCounts = new Map<string, number>();
  for (const row of rows) {
    const rawSem = cell(row["Sem"]);
    if (!rawSem) continue;
    const sem = normalizeSemester(rawSem) ?? rawSem;
    sourceSemesterCounts.set(sem, (sourceSemesterCounts.get(sem) ?? 0) + 1);
  }
  const sourceSemesters = Array.from(sourceSemesterCounts.entries())
    .map(([semester, count]) => ({ semester, rows: count }))
    .sort((a, b) => a.semester.localeCompare(b.semester));

  if (missingColumns.length > 0) {
    return {
      summary: emptySummary(rows.length, worksheetRows),
      targetTerm: target,
      slots: [],
      errors: [{ row: 0, message: `Missing required columns: ${missingColumns.join(", ")}` }],
      warnings: [],
      conflicts: [],
      combinedClasses: [],
      duplicateSchedules: [],
      incompleteSchedules: [],
      tbaClassrooms: [],
      programMapping: [],
      newFacultyNames: [],
      unassigned: [],
      duplicateFacultyNames: [],
      facultyReview: [],
      sourceSemesters,
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
      incompleteSchedules.push({
        row: rowNumber,
        cn,
        subject,
        section: cell(row["Section"]) || null,
        courseCode,
        schedule,
        message: `CN ${cn}: missing day/time information — record the meeting schedule before importing.`,
      });
      fail(`CN ${cn}: missing schedule.`);
      return;
    }

    meetingEntries += schedule
      .split("||")
      .map((p) => p.trim())
      .filter(Boolean).length;

    const { meetings, errors: parseErrors } = parseScheduleCell(schedule);
    for (const pe of parseErrors) {
      incompleteSchedules.push({
        row: rowNumber,
        cn,
        subject,
        section: cell(row["Section"]) || null,
        courseCode,
        schedule,
        message: `CN ${cn}: ${pe.message} (${pe.raw})`,
      });
      fail(`CN ${cn}: ${pe.message} (${pe.raw})`);
    }
    validBlocks += meetings.length;
    if (meetings.length === 0) return;

    // Faculty assignment
    let facultyName: string | null = null;
    if (instructorRaw && instructorRaw.toUpperCase() !== "TBA") {
      facultyName = instructorRaw;
      const key = facultyNameKey(instructorRaw);
      const usage = instructorUsage.get(key) ?? {
        name: instructorRaw,
        rows: new Set<number>(),
        programs: new Set<string>(),
      };
      usage.rows.add(rowNumber);
      usage.programs.add(normalizeCourseCode(courseCode));
      instructorUsage.set(key, usage);
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
        const key = `${cn}|${weekday}|${meeting.start}|${meeting.end}|${meeting.roomCode.toUpperCase()}`;
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
            (existing.facultyId ? facultyByKey.get(facultyNameKey(instructorRaw))?.id : null) === existing.facultyId;
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
          courseCode: normalizeCourseCode(courseCode),
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

  const findings = detectScheduleConflicts(slots);
  const conflicts = findings.filter((c) => c.kind === "CONFLICT");
  const combinedClasses = findings.filter((c) => c.kind === "COMBINED");
  const duplicateSchedules = findings.filter((c) => c.kind === "DUPLICATE");

  // Instructor review. This only reports; it never assigns a department. The
  // course code, subject and student program are deliberately not used here.
  const roster: RosterFaculty[] = ctx.faculty.map((f) => ({
    id: f.id,
    fullName: f.fullName,
    departmentCode: f.departmentCode ?? null,
    departmentName: f.departmentName ?? null,
    active: f.active,
  }));
  const facultyReview: FacultyReviewEntry[] = [];
  for (const usage of instructorUsage.values()) {
    const target = facultyNameKey(usage.name);
    const exact = roster.filter((f) => facultyNameKey(f.fullName) === target);
    const candidates: FacultyReviewCandidate[] = exact.map((f) => ({
      facultyId: f.id,
      fullName: f.fullName,
      departmentCode: f.departmentCode ?? null,
      departmentName: f.departmentName ?? null,
    }));
    let kind: FacultyReviewKind | null = null;
    if (exact.length > 1) {
      kind = "ambiguous";
    } else if (exact.length === 1) {
      if (!exact[0].departmentCode) kind = "no-department";
    } else {
      kind = "unknown";
      const similar = roster
        .map((f) => ({ f, score: nameSimilarity(usage.name, f.fullName) }))
        .filter((entry) => entry.score >= 0.86)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      for (const entry of similar) {
        candidates.push({
          facultyId: entry.f.id,
          fullName: entry.f.fullName,
          departmentCode: entry.f.departmentCode ?? null,
          departmentName: entry.f.departmentName ?? null,
        });
      }
    }
    if (!kind) continue;
    facultyReview.push({
      name: usage.name,
      kind,
      rows: Array.from(usage.rows).sort((a, b) => a - b),
      programs: Array.from(usage.programs).sort(),
      candidates,
    });
  }
  facultyReview.sort((a, b) => a.name.localeCompare(b.name));

  // Classes whose time is known but whose physical room is still TBA. One entry
  // per class, not per weekday.
  const tbaByClass = new Map<string, { slot: PlannedSlot; weekdays: Set<number> }>();
  for (const slot of slots) {
    if (slot.roomCode.trim().toUpperCase() !== "TBA" && slot.roomType !== "TBA") continue;
    const key = classKey(slot);
    const entry = tbaByClass.get(key) ?? { slot, weekdays: new Set<number>() };
    entry.weekdays.add(slot.weekday);
    tbaByClass.set(key, entry);
  }
  const tbaClassrooms: TbaClassroom[] = Array.from(tbaByClass.values())
    .map(({ slot, weekdays }) => ({
      row: slot.rowNumber,
      cn: slot.cn,
      subject: slot.subject,
      section: slot.section,
      courseCode: slot.courseCode,
      facultyName: slot.facultyName,
      weekdays: Array.from(weekdays).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.cn.localeCompare(b.cn));

  const newSlots = slots.filter((s) => s.status === "new").length;
  const updatedSlots = slots.filter((s) => s.status === "update").length;
  const unchangedSlots = slots.filter((s) => s.status === "unchanged").length;

  const programMapping = buildProgramMapping(rows, slots);
  const programsMapped = programMapping.filter((p) => p.collegeCode !== null).length;
  const programsUnassigned = programMapping.filter(
    (p) => p.collegeCode === null && p.inCatalog,
  ).length;
  const programsUnknown = programMapping.filter((p) => !p.inCatalog).length;

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
      combinedClasses: combinedClasses.length,
      duplicateSchedules: duplicateSchedules.length,
      incompleteSchedules: incompleteSchedules.length,
      tbaClassrooms: tbaClassrooms.length,
      programsInFile: programMapping.length,
      programsMapped,
      programsUnassigned,
      programsUnknown,
    },
    targetTerm: target,
    slots,
    errors,
    warnings,
    conflicts,
    combinedClasses,
    duplicateSchedules,
    incompleteSchedules,
    tbaClassrooms,
    programMapping,
    newFacultyNames: Array.from(newFacultyNames),
    unassigned,
    duplicateFacultyNames,
    facultyReview,
    sourceSemesters,
    missingColumns,
  };
}

// Inventory of every program value in the file (including rows that later fail
// validation, so nothing silently disappears), joined with the catalog so the
// preview can show matched/unmatched counts before the import is committed.
function buildProgramMapping(rows: Record<string, unknown>[], slots: PlannedSlot[]): ProgramMapping[] {
  type Entry = {
    sourceCodes: Set<string>;
    rows: number;
    faculty: Set<string>;
    firstRow: number;
  };
  const entries = new Map<string, Entry>();
  rows.forEach((row, index) => {
    const raw = cell(row["Course"]);
    const code = normalizeCourseCode(raw);
    if (!code) return;
    const rowNumber = index + 2;
    const entry = entries.get(code) ?? {
      sourceCodes: new Set<string>(),
      rows: 0,
      faculty: new Set<string>(),
      firstRow: rowNumber,
    };
    entry.rows++;
    if (raw) entry.sourceCodes.add(raw);
    const instructor = normaliseFacultyName(cell(row["Instructor"]));
    if (instructor && instructor.toUpperCase() !== "TBA") entry.faculty.add(nameKey(instructor));
    entries.set(code, entry);
  });

  const slotsByCode = new Map<string, number>();
  for (const slot of slots) {
    slotsByCode.set(slot.courseCode, (slotsByCode.get(slot.courseCode) ?? 0) + 1);
  }

  const catalogOrder = new Map(COLLEGE_DEFS.map((c, index) => [c.code as string, index]));

  return Array.from(entries.entries())
    .map(([code, entry]): ProgramMapping => {
      const program = programForCode(code);
      return {
        code,
        sourceCodes: Array.from(entry.sourceCodes).sort(),
        name: program?.name ?? programNameFor(code),
        collegeCode: program?.college ?? null,
        collegeName: program?.college ? collegeNameFor(program.college) : null,
        official: program?.official ?? false,
        inCatalog: !!program,
        rows: entry.rows,
        slots: slotsByCode.get(code) ?? 0,
        faculty: entry.faculty.size,
        firstRow: entry.firstRow,
      };
    })
    .sort(
      (a, b) =>
        (a.collegeCode ? catalogOrder.get(a.collegeCode) ?? 999 : 1000) -
          (b.collegeCode ? catalogOrder.get(b.collegeCode) ?? 999 : 1000) ||
        a.code.localeCompare(b.code),
    );
}

// Whether a row falls inside the selected college/program scope. Programs that
// are not in the catalog count as unassigned.
export function slotInScope(courseCode: string, scope?: ImportScope | null): boolean {
  if (!scope) return true;
  const key = normalizeCourseCode(courseCode);
  const program = normalizeCourseCode(scope.program ?? "");
  if (program) return key === program;
  const college = (scope.college ?? "").trim();
  if (!college) return true;
  if (scope.collegeByCode && Object.prototype.hasOwnProperty.call(scope.collegeByCode, key)) {
    const assigned = scope.collegeByCode[key];
    return college === UNASSIGNED_COLLEGE_VALUE ? assigned === null : assigned === college;
  }
  const entry = programForCode(courseCode);
  if (college === UNASSIGNED_COLLEGE_VALUE) return !entry || entry.college === null;
  return entry?.college === college;
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
    combinedClasses: 0,
    duplicateSchedules: 0,
    incompleteSchedules: 0,
    tbaClassrooms: 0,
    programsInFile: 0,
    programsMapped: 0,
    programsUnassigned: 0,
    programsUnknown: 0,
  };
}

export async function buildPlan(
  buffer: Buffer,
  target?: ImportTargetTerm | null,
  collegeByCode?: Record<string, string | null>,
): Promise<ImportPlan> {
  const { rows, missingColumns, worksheetRows } = readRows(buffer);

  const [courses, rooms, faculty, allExistingSlots] = await Promise.all([
    prisma.course.findMany({ select: { id: true, code: true, college: { select: { code: true } } } }),
    prisma.room.findMany(),
    prisma.faculty.findMany({ include: { department: true } }),
    prisma.scheduleSlot.findMany(),
  ]);

  // When importing into a specific term, only compare against that term's
  // schedules so a new semester never collides with previous semesters.
  const existingSlots = target
    ? allExistingSlots.filter(
        (s) => s.schoolYear === target.schoolYear && s.semester === target.semester,
      )
    : allExistingSlots;

  const plan = planFromRows(rows, {
    courses: courses.map((c) => ({ id: c.id, code: c.code })),
    rooms: rooms.map((r) => ({ id: r.id, code: r.code })),
    faculty: faculty.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      departmentCode: f.department?.code ?? null,
      departmentName: f.department?.name ?? null,
      active: f.active,
    })),
    existingSlots,
    target,
    worksheetRows,
    missingColumns,
  });

  // The database copy of the catalog is authoritative: an administrator may
  // have moved a program to another college after the code was written.
  const overrides =
    collegeByCode ??
    Object.fromEntries(
      courses.map((c) => [normalizeCourseCode(c.code), c.college?.code ?? null]),
    );
  for (const entry of plan.programMapping) {
    if (!Object.prototype.hasOwnProperty.call(overrides, entry.code)) continue;
    entry.collegeCode = overrides[entry.code];
    entry.collegeName = collegeNameFor(overrides[entry.code]);
  }
  plan.summary.programsMapped = plan.programMapping.filter((m) => m.collegeCode).length;
  plan.summary.programsUnassigned = plan.programMapping.filter(
    (m) => !m.collegeCode,
  ).length;

  return plan;
}

export type CommitResult = {
  created: number;
  updated: number;
  unchanged: number;
  facultyCreated: number;
  programsCreated: number;
  roomsCreated: number;
  errors: number;
  skippedOutOfScope: number;
  batchId: number | null;
};

export type ImportBatchMeta = { filename?: string; importedById?: number; checksum?: string | null };

export async function commitPlan(
  buffer: Buffer,
  target?: ImportTargetTerm | null,
  meta?: ImportBatchMeta,
  scope?: ImportScope | null,
): Promise<{ plan: ImportPlan; result: CommitResult }> {
  const plan = await buildPlan(buffer, target);
  if (plan.missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${plan.missingColumns.join(", ")}`);
  }
  const result = await writePlan(plan, target, meta, scope);
  return { plan, result };
}

// Persist an already-computed plan. Shared by the file importer and the schedule
// repair engine so both paths write slots through exactly one code path.
export async function writePlan(
  plan: ImportPlan,
  target?: ImportTargetTerm | null,
  meta?: ImportBatchMeta,
  scope?: ImportScope | null,
): Promise<CommitResult> {
  if (plan.missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${plan.missingColumns.join(", ")}`);
  }

  // The plan is always validated over the whole file; the scope only narrows
  // what is written. This keeps cross-department instructor checks intact.
  const slotsToWrite = scope ? plan.slots.filter((s) => slotInScope(s.courseCode, scope)) : plan.slots;

  const result: CommitResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    facultyCreated: 0,
    programsCreated: 0,
    roomsCreated: 0,
    errors: plan.errors.length,
    skippedOutOfScope: plan.slots.length - slotsToWrite.length,
    batchId: null,
  };

  // Only bother tracking a batch when a target term is known and the file will
  // actually create or update at least one slot. Unchanged/error rows keep
  // whatever batch they already belonged to.
  const willWrite = slotsToWrite.some((s) => s.status === "new" || s.status === "update");

  await prisma.$transaction(
    async (tx) => {
      // Import batch — lets a single upload be identified and cleared later,
      // without touching manually created or previously imported schedules.
      let batchId: number | null = null;
      if (target && willWrite) {
        const batch = await tx.importBatch.create({
          data: {
            filename: meta?.filename?.trim() || "schedule.xlsx",
            schoolYear: target.schoolYear,
            semester: target.semester,
            checksum: meta?.checksum ?? null,
            importedById: meta?.importedById ?? null,
          },
        });
        batchId = batch.id;
      }

    // Programs. New programs get their official name and college from the
    // catalog; existing rows are only filled in where they are still blank, so
    // an administrator's assignment is never overwritten.
    const courseCodes = Array.from(new Set(slotsToWrite.map((s) => s.courseCode)));
    const mappingByCode = new Map(plan.programMapping.map((m) => [m.code, m]));
    const courseMap = new Map<string, number>();
    for (const code of courseCodes) {
      const program = programForCode(code);
      const mapping = mappingByCode.get(code);
      const name = program?.name ?? programNameFor(code);
      const sourceCode = mapping?.sourceCodes[0] ?? code;
      const college = program?.college
        ? await tx.college.findUnique({ where: { code: program.college }, select: { id: true } })
        : null;
      const existing = await tx.course.findUnique({ where: { code } });
      if (existing) {
        const data: { name?: string; collegeId?: number; sourceCode?: string } = {};
        if (!existing.name && name) data.name = name;
        if (existing.collegeId == null && college) data.collegeId = college.id;
        if (!existing.sourceCode) data.sourceCode = sourceCode;
        if (Object.keys(data).length > 0) {
          await tx.course.update({ where: { id: existing.id }, data });
        }
        courseMap.set(code, existing.id);
      } else {
        const created = await tx.course.create({
          data: {
            code,
            name,
            collegeId: college?.id ?? null,
            sourceCode,
            official: program?.official ?? true,
          },
        });
        courseMap.set(code, created.id);
        result.programsCreated++;
      }
    }

    // Rooms
    const roomCodes = Array.from(new Set(slotsToWrite.map((s) => s.roomCode.toUpperCase())));
    const roomMap = new Map<string, number>();
    for (const code of roomCodes) {
      const existing = await tx.room.findUnique({ where: { code } });
      if (existing) {
        roomMap.set(code, existing.id);
      } else {
        const type = slotsToWrite.find((s) => s.roomCode.toUpperCase() === code)?.roomType ?? "PHYSICAL";
        const created = await tx.room.create({ data: { code, type } });
        roomMap.set(code, created.id);
        result.roomsCreated++;
      }
    }

    // Faculty
    const facultyNames = Array.from(
      new Set(slotsToWrite.map((s) => s.facultyName).filter((n): n is string => !!n)),
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

    // Slots. Every slot in the file is matched against the term's existing
    // rows in one query, then the loop only touches local state — a large
    // consolidated workbook (thousands of meetings) no longer times out.
    const slotKey = (cn: string, weekday: number, start: string, end: string, roomId: number) =>
      `${cn}\u0000${weekday}\u0000${start}\u0000${end}\u0000${roomId}`;
    const existingSlots = await tx.scheduleSlot.findMany({
      where: target
        ? { schoolYear: target.schoolYear, semester: target.semester }
        : undefined,
      select: { id: true, cn: true, weekday: true, startTime: true, endTime: true, roomId: true },
    });
    const existingByKey = new Map<string, number>();
    for (const row of existingSlots) {
      existingByKey.set(
        slotKey(row.cn, row.weekday, row.startTime, row.endTime, row.roomId),
        row.id,
      );
    }

    for (const slot of slotsToWrite) {
      const courseId = courseMap.get(slot.courseCode)!;
      const roomId = roomMap.get(slot.roomCode.toUpperCase())!;
      const facultyId = slot.facultyName ? facultyMap.get(nameKey(slot.facultyName)) ?? null : null;

      const key = slotKey(slot.cn, slot.weekday, slot.start, slot.end, roomId);
      const existingId = existingByKey.get(key);
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

      if (existingId !== undefined) {
        if (slot.status === "unchanged") {
          result.unchanged++;
        } else {
          await tx.scheduleSlot.update({ where: { id: existingId }, data });
          result.updated++;
        }
      } else {
        const created = await tx.scheduleSlot.create({ data, select: { id: true } });
        existingByKey.set(key, created.id);
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
    },
    { maxWait: 15000, timeout: 180000 },
  );

  return result;
}

