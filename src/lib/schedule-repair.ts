// Deterministic schedule repair engine.
//
// This module is pure: it reads worksheet rows and returns structured findings.
// It never touches the database and never calls an LLM. The same input always
// produces the same output. Its single documented hour rule is `hoursOfRange`
// from "@/lib/dates", shared with the importer and the printable sheet.
//
// See docs/schedule-repair-data-quality.md for the source-workbook findings.

import {
  parseScheduleCell,
  normaliseFacultyName,
  nameKey,
  type ParseError,
} from "@/lib/schedule-parser";
import { hoursOfRange, timeToMinutes, WEEKDAY_NAMES } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Issue catalogue
// ---------------------------------------------------------------------------

export type RepairSeverity = "info" | "warning" | "error" | "review";
export type RepairCertainty = "certain" | "likely" | "uncertain";

export const ISSUE_LABELS: Record<string, string> = {
  WS_WHITESPACE: "Stray whitespace",
  NAME_FORMAT: "Instructor name formatting",
  NAME_UNMATCHED: "Instructor not in master list",
  NAME_AMBIGUOUS: "Ambiguous instructor match",
  MISSING_INSTRUCTOR: "Missing instructor (TBA)",
  MISSING_CN: "Missing class number",
  MISSING_PROGRAM: "Missing program",
  MISSING_SCHEDULE: "Missing schedule",
  TIME_UNREADABLE: "Unreadable time",
  TIME_ZERO_LENGTH: "Zero-length class time",
  TIME_BACKWARDS: "End time before start time",
  TIME_TOO_LONG: "Class longer than 8 hours",
  DAY_UNKNOWN: "Unknown day token",
  SCHEDULE_UNPARSEABLE: "Unparseable schedule entry",
  ROOM_MISSING: "No usable room",
  ROOM_LAB_SUFFIX: "Non-standard lab room label",
  SLOT_DUP_IN_CELL: "Repeated identical entry in cell",
  DUP_EXACT: "Exact duplicate row",
  DUP_POSSIBLE: "Possible duplicate row",
  CONFLICT_OVERLAP: "Overlapping instructor meetings",
  HOURS_MISMATCH: "Scheduled vs sheet hours mismatch",
  SLOTS_OVERCAPACITY: "Enrolment over capacity",
};

export type IssueCode = keyof typeof ISSUE_LABELS;

export type RepairFinding = {
  code: IssueCode;
  severity: RepairSeverity;
  certainty: RepairCertainty;
  rowNumber: number;
  cn: string | null;
  field: string;
  original: string;
  proposed: string | null;
  explanation: string;
  evidence: string;
  autoFixable: boolean;
  requiresApproval: boolean;
};

export type RepairConflict = {
  facultyName: string;
  weekday: number;
  sameClassNumber: boolean;
  a: { rowNumber: number; cn: string; subject: string; start: string; end: string; roomCode: string };
  b: { rowNumber: number; cn: string; subject: string; start: string; end: string; roomCode: string };
  message: string;
};

export type ResolvedMeeting = {
  weekdays: number[];
  start: string;
  end: string;
  roomCode: string;
  roomType: "PHYSICAL" | "ONLINE" | "TBA";
  mode: "FACE_TO_FACE" | "ONLINE" | "LAB";
  isLab: boolean;
  hours: number;
};

export type FacultyMatch = "matched" | "new" | "ambiguous" | "unassigned";

export type RepairedRow = {
  rowNumber: number;
  cn: string;
  subject: string;
  section: string | null;
  courseCode: string;
  instructorRaw: string;
  instructorNormalized: string;
  facultyId: number | null;
  facultyMatch: FacultyMatch;
  slotsInfo: string | null;
  meetings: ResolvedMeeting[];
  scheduledHours: number;
  unassignedHours: number;
  status: "clean" | "warning" | "review" | "invalid";
  findings: RepairFinding[];
};

export type ProgramReconciliation = {
  courseCode: string;
  ok: boolean;
  expectedHours: number;
  renderedHours: number;
  unassignedMeetings: number;
  problems: string[];
};

export type RepairSummary = {
  rowsInspected: number;
  cleanRows: number;
  warningRows: number;
  reviewRows: number;
  invalidRows: number;
  findings: number;
  bySeverity: Record<RepairSeverity, number>;
  byCode: Record<string, number>;
  exactDuplicateGroups: number;
  possibleDuplicateGroups: number;
  invalidTimeRows: number;
  instructorIssueRows: number;
  conflictFindings: number;
  scheduledHours: number;
  sheetHours: number;
  unassignedMeetings: number;
  unassignedHours: number;
  roomsToCreate: string[];
  programsToCreate: string[];
  facultyToCreate: string[];
};

export type RepairReport = {
  summary: RepairSummary;
  rows: RepairedRow[];
  findings: RepairFinding[];
  conflicts: RepairConflict[];
  programs: ProgramReconciliation[];
};

export type RepairContext = {
  faculty: { id: number; fullName: string }[];
  courses: { id: number; code: string }[];
  rooms: { id: number; code: string }[];
};

export type WorkRow = Record<string, unknown>;

const SEVERITY_ORDER: RepairSeverity[] = ["error", "review", "warning", "info"];

// ---------------------------------------------------------------------------
// Field access + normalization helpers
// ---------------------------------------------------------------------------

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Replace any trailing parenthetical lab qualifier, e.g. "(CE LAB)" / "(Lab)",
// with the canonical "(Lab)" so the parser records the room and the lab flag.
export function canonicalizeLabSuffix(schedule: string): string {
  return schedule
    .split("||")
    .map((part) => {
      const trimmed = part.trim();
      const m = /\(([^)]*\blab\b[^)]*)\)\s*$/i.exec(trimmed);
      if (!m) return trimmed;
      return `${trimmed.slice(0, m.index).trim()} (Lab)`;
    })
    .join(" || ");
}

export function dedupeScheduleParts(schedule: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of schedule.split("||")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.join(" || ");
}

function hasStrayWhitespace(value: string): boolean {
  return value !== "" && value !== normalizeWhitespace(value);
}

// ---------------------------------------------------------------------------
// Instructor matching
// ---------------------------------------------------------------------------

function bigramSimilarity(a: string, b: string): number {
  const s1 = nameKey(a).replace(/[^a-z ]/g, "");
  const s2 = nameKey(b).replace(/[^a-z ]/g, "");
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const g1 = grams(s1);
  const g2 = grams(s2);
  let inter = 0;
  for (const g of g1) if (g2.has(g)) inter++;
  return (2 * inter) / (g1.size + g2.size);
}

export function matchInstructor(
  raw: string,
  faculty: { id: number; fullName: string }[],
): { match: FacultyMatch; facultyId: number | null; similar: { id: number; fullName: string }[] } {
  const name = normalizeWhitespace(raw);
  if (!name || name.toUpperCase() === "TBA") return { match: "unassigned", facultyId: null, similar: [] };

  const exact = faculty.filter((f) => nameKey(f.fullName) === nameKey(name));
  if (exact.length === 1) return { match: "matched", facultyId: exact[0].id, similar: [] };
  if (exact.length > 1) return { match: "ambiguous", facultyId: null, similar: exact };

  const similar = faculty.filter((f) => bigramSimilarity(name, f.fullName) >= 0.86);
  if (similar.length >= 1) {
    // A single close-but-not-exact name still needs a human to confirm.
    return { match: "ambiguous", facultyId: null, similar };
  }
  return { match: "new", facultyId: null, similar: [] };
}

// ---------------------------------------------------------------------------
// Per-row analysis
// ---------------------------------------------------------------------------

function classifyParseError(err: ParseError): { code: IssueCode; severity: RepairSeverity } {
  const m = err.message;
  if (m.includes("after the start time")) return { code: "TIME_ZERO_LENGTH", severity: "error" };
  if (m.includes("before the start time")) return { code: "TIME_BACKWARDS", severity: "error" };
  if (m.includes("longer than")) return { code: "TIME_TOO_LONG", severity: "error" };
  if (m.includes("Unreadable time")) return { code: "TIME_UNREADABLE", severity: "error" };
  if (m.includes("Unknown day token")) return { code: "DAY_UNKNOWN", severity: "error" };
  if (m.includes("No days listed")) return { code: "DAY_UNKNOWN", severity: "error" };
  if (m.includes("ASYNC")) return { code: "ROOM_MISSING", severity: "error" };
  if (m.includes("Missing room") || m.includes("No valid room")) return { code: "ROOM_MISSING", severity: "error" };
  return { code: "SCHEDULE_UNPARSEABLE", severity: "error" };
}

export function analyzeRow(row: WorkRow, rowNumber: number, ctx: RepairContext): RepairedRow {
  const findings: RepairFinding[] = [];
  const push = (f: Omit<RepairFinding, "rowNumber" | "cn" | "severity"> & { severity?: RepairSeverity }) => {
    findings.push({
      rowNumber,
      cn: cell(row["CN"]).trim() || null,
      severity: f.severity ?? defaultSeverity(f.code),
      ...f,
    });
  };

  const cn = cell(row["CN"]).trim();
  const subject = cell(row["Subject"]).trim();
  const section = cell(row["Section"]).trim() || null;
  const courseCode = cell(row["Course"]).trim().toUpperCase();
  const scheduleRaw = cell(row["Schedule"]);
  const instructorRaw = cell(row["Instructor"]);
  const slotsInfo = cell(row["Slots"]).trim() || null;

  // --- whitespace / formatting findings ---
  for (const field of ["Subject", "CN", "Description", "Section", "Course", "Code"]) {
    const value = cell(row[field]);
    if (hasStrayWhitespace(value)) {
      push({
        code: "WS_WHITESPACE",
        certainty: "certain",
        field,
        original: value,
        proposed: normalizeWhitespace(value),
        explanation: `${field} has leading, trailing or repeated spaces.`,
        evidence: JSON.stringify(value),
        autoFixable: true,
        requiresApproval: false,
      });
    }
  }
  if (hasStrayWhitespace(instructorRaw)) {
    push({
      code: "NAME_FORMAT",
      certainty: "certain",
      field: "Instructor",
      original: instructorRaw,
      proposed: normaliseFacultyName(instructorRaw),
      explanation: "Instructor name has leading, trailing or repeated spaces.",
      evidence: JSON.stringify(instructorRaw),
      autoFixable: true,
      requiresApproval: false,
    });
  }
  if (hasStrayWhitespace(scheduleRaw)) {
    push({
      code: "WS_WHITESPACE",
      certainty: "certain",
      field: "Schedule",
      original: scheduleRaw,
      proposed: scheduleRaw
        .split("||")
        .map((p) => normalizeWhitespace(p))
        .join(" || "),
      explanation: "Schedule has leading, trailing or repeated spaces.",
      evidence: JSON.stringify(scheduleRaw),
      autoFixable: true,
      requiresApproval: false,
    });
  }

  // --- non-standard lab qualifier ---
  const canonicalSchedule = canonicalizeLabSuffix(scheduleRaw);
  if (canonicalSchedule !== normalizeWhitespace(scheduleRaw).replace(/\s*\|\|\s*/g, " || ")) {
    const canonicalNormalized = canonicalSchedule
      .split("||")
      .map((p) => normalizeWhitespace(p))
      .join(" || ");
    if (canonicalNormalized !== scheduleRaw.split("||").map((p) => normalizeWhitespace(p)).join(" || ")) {
      push({
        code: "ROOM_LAB_SUFFIX",
        certainty: "certain",
        field: "Schedule",
        original: scheduleRaw,
        proposed: canonicalNormalized,
        explanation: "Room has a non-standard lab qualifier; normalized to '(Lab)'.",
        evidence: "e.g. AGM102 (CE LAB) -> AGM102 (Lab)",
        autoFixable: true,
        requiresApproval: false,
      });
    }
  }

  // --- repeated identical entry in the cell ---
  const deduped = dedupeScheduleParts(scheduleRaw);
  const rawPartCount = scheduleRaw.split("||").map((p) => p.trim()).filter(Boolean).length;
  const dedupedPartCount = deduped.split("||").filter(Boolean).length;
  if (dedupedPartCount < rawPartCount) {
    push({
      code: "SLOT_DUP_IN_CELL",
      certainty: "certain",
      field: "Schedule",
      original: scheduleRaw,
      proposed: deduped,
      explanation: "The same schedule entry is repeated inside one cell.",
      evidence: `${rawPartCount} entries -> ${dedupedPartCount} distinct`,
      autoFixable: true,
      requiresApproval: false,
    });
  }

  // --- required fields ---
  if (!cn) {
    push({ code: "MISSING_CN", certainty: "certain", field: "CN", original: "", proposed: null, explanation: "Row has no class number.", evidence: "CN empty", autoFixable: false, requiresApproval: false });
  }
  if (!courseCode) {
    push({ code: "MISSING_PROGRAM", certainty: "certain", field: "Course", original: "", proposed: null, explanation: "Row has no program/course.", evidence: "Course empty", autoFixable: false, requiresApproval: false });
  }
  if (!scheduleRaw.trim()) {
    push({ code: "MISSING_SCHEDULE", certainty: "certain", field: "Schedule", original: scheduleRaw, proposed: null, explanation: "Row has no schedule.", evidence: "Schedule empty", autoFixable: false, requiresApproval: false });
  }

  // --- parse the schedule ---
  const meetings: ResolvedMeeting[] = [];
  if (scheduleRaw.trim()) {
    const { meetings: parsed, errors } = parseScheduleCell(scheduleRaw);
    for (const err of errors) {
      const { code, severity } = classifyParseError(err);
      push({
        code,
        severity,
        certainty: "certain",
        field: "Schedule",
        original: err.raw,
        proposed: null,
        explanation: err.message,
        evidence: JSON.stringify(err.raw),
        autoFixable: false,
        requiresApproval: false,
      });
    }
    for (const m of parsed) {
      meetings.push({
        weekdays: m.weekdays,
        start: m.start,
        end: m.end,
        roomCode: m.roomCode,
        roomType: m.roomType,
        mode: m.mode,
        isLab: m.isLab,
        hours: hoursOfRange(m.start, m.end).length,
      });
    }
  }

  // --- instructor matching ---
  const normalizedInstructor = normaliseFacultyName(instructorRaw);
  const { match, facultyId, similar } = matchInstructor(instructorRaw, ctx.faculty);
  if (match === "unassigned") {
    push({
      code: "MISSING_INSTRUCTOR",
      certainty: "certain",
      field: "Instructor",
      original: instructorRaw,
      proposed: null,
      explanation: "No instructor assigned (empty or TBA). This class cannot be printed.",
      evidence: JSON.stringify(instructorRaw),
      autoFixable: false,
      requiresApproval: false,
    });
  } else if (match === "new") {
    push({
      code: "NAME_UNMATCHED",
      certainty: "likely",
      field: "Instructor",
      original: instructorRaw,
      proposed: null,
      explanation: "Instructor is not in the faculty list; a new record would be created.",
      evidence: normalizedInstructor,
      autoFixable: false,
      requiresApproval: false,
    });
  } else if (match === "ambiguous") {
    push({
      code: "NAME_AMBIGUOUS",
      certainty: "uncertain",
      field: "Instructor",
      original: instructorRaw,
      proposed: null,
      explanation: `Instructor matches more than one faculty record: ${similar.map((s) => s.fullName).join(", ")}.`,
      evidence: normalizedInstructor,
      autoFixable: false,
      requiresApproval: true,
    });
  }

  // --- over-capacity (informational only) ---
  const cap = /^(\d+)\s*\/\s*(\d+)$/.exec(slotsInfo ?? "");
  if (cap && Number(cap[1]) > Number(cap[2])) {
    push({
      code: "SLOTS_OVERCAPACITY",
      severity: "info",
      certainty: "certain",
      field: "Slots",
      original: slotsInfo ?? "",
      proposed: null,
      explanation: "Enrolment exceeds capacity; informational only.",
      evidence: slotsInfo ?? "",
      autoFixable: false,
      requiresApproval: false,
    });
  }

  const assignedMeetings = match === "unassigned" ? [] : meetings;
  const scheduledHours = assignedMeetings.reduce((n, m) => n + m.hours, 0);
  const unassignedHours = match === "unassigned" ? meetings.reduce((n, m) => n + m.hours, 0) : 0;

  const status = rowStatus(findings);

  return {
    rowNumber,
    cn,
    subject,
    section,
    courseCode,
    instructorRaw,
    instructorNormalized: normalizedInstructor,
    facultyId,
    facultyMatch: match,
    slotsInfo,
    meetings,
    scheduledHours,
    unassignedHours,
    status,
    findings,
  };
}

// Explicit, order-independent severity map so identical input always yields the
// same classification (no reliance on the order findings were produced).
const SEVERITY_MAP: Record<IssueCode, RepairSeverity> = {
  // Hard errors: the row cannot become a trustworthy sheet without data entry.
  MISSING_CN: "error",
  MISSING_PROGRAM: "error",
  MISSING_SCHEDULE: "error",
  DAY_UNKNOWN: "error",
  TIME_ZERO_LENGTH: "error",
  TIME_BACKWARDS: "error",
  TIME_TOO_LONG: "error",
  TIME_UNREADABLE: "error",
  SCHEDULE_UNPARSEABLE: "error",
  ROOM_MISSING: "error",
  // Needs a human decision; never auto-applied.
  MISSING_INSTRUCTOR: "review",
  NAME_AMBIGUOUS: "review",
  DUP_EXACT: "review",
  DUP_POSSIBLE: "review",
  CONFLICT_OVERLAP: "review",
  HOURS_MISMATCH: "review",
  // Cosmetic / informational; usually auto-fixable and non-blocking.
  WS_WHITESPACE: "info",
  NAME_FORMAT: "info",
  NAME_UNMATCHED: "info",
  ROOM_LAB_SUFFIX: "info",
  SLOT_DUP_IN_CELL: "info",
  SLOTS_OVERCAPACITY: "info",
};

function defaultSeverity(code: IssueCode): RepairSeverity {
  return SEVERITY_MAP[code] ?? "error";
}

function rowStatus(findings: RepairFinding[]): RepairedRow["status"] {
  if (findings.some((f) => f.severity === "error")) return "invalid";
  if (findings.some((f) => f.severity === "review")) return "review";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  return "clean";
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

function identityKey(row: WorkRow): string {
  const norm = (v: unknown) => normalizeWhitespace(cell(v)).toLowerCase();
  return [
    "Term Type", "Subject", "CN", "Description", "Unit", "Sem", "Schedule",
    "Section", "Course", "Slots", "Instructor", "Code",
  ]
    .map((k) => norm(row[k]))
    .join("\u0001");
}

function softKey(row: WorkRow): string {
  const norm = (v: unknown) => normalizeWhitespace(cell(v)).toLowerCase();
  return [norm(row["Subject"]), norm(row["Section"]), norm(row["Instructor"]), norm(row["Schedule"])].join("\u0001");
}

function findDuplicates(
  rows: WorkRow[],
  pushFinding: (rowNumber: number, finding: RepairFinding) => void,
): { exactGroups: number; possibleGroups: number } {
  const exact = new Map<string, number[]>();
  const soft = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const rn = i + 2;
    const ek = identityKey(row);
    if (!exact.has(ek)) exact.set(ek, []);
    exact.get(ek)!.push(rn);
    const sk = softKey(row);
    if (!soft.has(sk)) soft.set(sk, []);
    soft.get(sk)!.push(rn);
  });

  let exactGroups = 0;
  for (const list of exact.values()) {
    if (list.length < 2) continue;
    exactGroups++;
    const keep = list[0];
    for (const rowNumber of list.slice(1)) {
      const cn = "";
      pushFinding(rowNumber, {
        code: "DUP_EXACT",
        severity: "review",
        certainty: "certain",
        rowNumber,
        cn: cn || null,
        field: "__row__",
        original: `row ${rowNumber}`,
        proposed: `drop row ${rowNumber}, keep row ${keep}`,
        explanation: `Row ${rowNumber} is byte-identical to row ${keep}.`,
        evidence: `rows ${list.join(", ")}`,
        autoFixable: false,
        requiresApproval: true,
      });
    }
  }

  let possibleGroups = 0;
  for (const list of soft.values()) {
    if (list.length < 2) continue;
    const cns = new Set(list.map((rn) => cell(rows[rn - 2]["CN"]).trim()));
    if (cns.size < 2) continue; // identical CN already handled above
    possibleGroups++;
    for (const rowNumber of list.slice(1)) {
      pushFinding(rowNumber, {
        code: "DUP_POSSIBLE",
        severity: "review",
        certainty: "uncertain",
        rowNumber,
        cn: cell(rows[rowNumber - 2]["CN"]).trim() || null,
        field: "__row__",
        original: `CN ${cell(rows[rowNumber - 2]["CN"])} on row ${rowNumber}`,
        proposed: null,
        explanation: `Rows ${list.join(", ")} share the same subject, section, instructor and schedule but have different class numbers. Confirm whether these are separate classes.`,
        evidence: softKey(rows[rowNumber - 2]),
        autoFixable: false,
        requiresApproval: true,
      });
    }
  }

  return { exactGroups, possibleGroups };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export function detectConflicts(repaired: RepairedRow[]): RepairConflict[] {
  const byFacultyDay = new Map<string, { row: RepairedRow; meeting: ResolvedMeeting }[]>();
  for (const row of repaired) {
    if (row.facultyMatch === "unassigned") continue;
    const name = row.instructorNormalized.toLowerCase();
    for (const meeting of row.meetings) {
      for (const weekday of meeting.weekdays) {
        const key = `${name}|${weekday}`;
        const list = byFacultyDay.get(key) ?? [];
        list.push({ row, meeting });
        byFacultyDay.set(key, list);
      }
    }
  }

  const conflicts: RepairConflict[] = [];
  for (const [key, group] of byFacultyDay) {
    const weekday = Number(key.split("|")[1]);
    const ordered = [...group].sort(
      (a, b) => timeToMinutes(a.meeting.start) - timeToMinutes(b.meeting.start) || a.row.rowNumber - b.row.rowNumber,
    );
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const A = ordered[i];
        const B = ordered[j];
        if (timeToMinutes(B.meeting.start) >= timeToMinutes(A.meeting.end)) break;
        // Two different rows that share a class number are the same class listed
        // twice (handled by duplicate detection), not an instructor clash. A lab
        // and lecture on the same row is still a genuine overlap and is reported.
        if (A.row.rowNumber !== B.row.rowNumber && A.row.cn && A.row.cn === B.row.cn) continue;
        const day = WEEKDAY_NAMES[weekday] ?? "";
        conflicts.push({
          facultyName: A.row.instructorNormalized,
          weekday,
          sameClassNumber: A.row.cn === B.row.cn,
          a: { rowNumber: A.row.rowNumber, cn: A.row.cn, subject: A.row.subject, start: A.meeting.start, end: A.meeting.end, roomCode: A.meeting.roomCode },
          b: { rowNumber: B.row.rowNumber, cn: B.row.cn, subject: B.row.subject, start: B.meeting.start, end: B.meeting.end, roomCode: B.meeting.roomCode },
          message: `${A.row.instructorNormalized}: ${day} ${A.meeting.start}-${A.meeting.end} (row ${A.row.rowNumber}, CN ${A.row.cn}) overlaps ${B.meeting.start}-${B.meeting.end} (row ${B.row.rowNumber}, CN ${B.row.cn}).`,
        });
      }
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Hour reconciliation
// ---------------------------------------------------------------------------
//
// Documented rule (shared with the printed sheet):
//   scheduledHours  = sum over instructor meetings of hoursOfRange(start,end).length
//                     (an overlap is therefore counted twice)
//   sheetHours      = sum over (course, weekday, instructor) of |union of hour cells|
//                     (a printed column can only show each hour once, so genuine
//                      overlaps collapse to a single block)
// The two totals differ only when one instructor has overlapping meetings on the
// same weekday; that is exactly the condition that makes the sheet under-report.

type HourCell = number;

export function reconcileRows(repaired: RepairedRow[]): {
  programs: ProgramReconciliation[];
  scheduledHours: number;
  sheetHours: number;
  unassignedMeetings: number;
  unassignedHours: number;
} {
  // (course -> weekday -> instructorKey) -> covered hour cells
  const coverage = new Map<string, Map<number, Map<string, Set<HourCell>>>>();
  const unassignedByCourse = new Map<string, number>();
  let scheduledHours = 0;
  let unassignedMeetings = 0;

  const touch = (course: string, weekday: number, instructor: string) => {
    let byDay = coverage.get(course);
    if (!byDay) {
      byDay = new Map();
      coverage.set(course, byDay);
    }
    let byFaculty = byDay.get(weekday);
    if (!byFaculty) {
      byFaculty = new Map();
      byDay.set(weekday, byFaculty);
    }
    let cells = byFaculty.get(instructor);
    if (!cells) {
      cells = new Set();
      byFaculty.set(instructor, cells);
    }
    return cells;
  };

  for (const row of repaired) {
    if (row.meetings.length === 0) continue;
    if (row.facultyMatch === "unassigned") {
      unassignedByCourse.set(row.courseCode, (unassignedByCourse.get(row.courseCode) ?? 0) + row.meetings.length);
      unassignedMeetings += row.meetings.length;
      continue;
    }
    const instructor = row.instructorNormalized.toLowerCase();
    for (const meeting of row.meetings) {
      const hours = hoursOfRange(meeting.start, meeting.end).map((h) => timeToMinutes(h));
      for (const weekday of meeting.weekdays) {
        const cells = touch(row.courseCode, weekday, instructor);
        scheduledHours += hours.length;
        for (const h of hours) cells.add(h);
      }
    }
  }

  const programs: ProgramReconciliation[] = [];
  let sheetHours = 0;

  for (const [courseCode, byDay] of coverage) {
    let expected = 0;
    let rendered = 0;
    const problems: string[] = [];
    for (const [weekday, byFaculty] of byDay) {
      for (const [instructor, cells] of byFaculty) {
        rendered += cells.size;
        // scheduled total for this (course, weekday, instructor)
        let count = 0;
        for (const row of repaired) {
          if (row.courseCode !== courseCode || row.facultyMatch === "unassigned") continue;
          if (row.instructorNormalized.toLowerCase() !== instructor) continue;
          for (const meeting of row.meetings) {
            if (meeting.weekdays.includes(weekday)) count += hoursOfRange(meeting.start, meeting.end).length;
          }
        }
        expected += count;
        if (count !== cells.size) {
          problems.push(
            `${rowName(repaired, courseCode, instructor)}: ${count} scheduled hour(s) but the sheet can only show ${cells.size} on ${WEEKDAY_NAMES[weekday]} — overlapping classes for the same instructor.`,
          );
        }
      }
    }
    sheetHours += rendered;
    programs.push({
      courseCode,
      ok: expected === rendered,
      expectedHours: expected,
      renderedHours: rendered,
      unassignedMeetings: unassignedByCourse.get(courseCode) ?? 0,
      problems,
    });
  }

  const unassignedHours = repaired.reduce((n, r) => n + r.unassignedHours, 0);

  return { programs, scheduledHours, sheetHours, unassignedMeetings, unassignedHours };
}

function rowName(repaired: RepairedRow[], courseCode: string, instructorLower: string): string {
  const hit = repaired.find(
    (r) => r.courseCode === courseCode && r.instructorNormalized.toLowerCase() === instructorLower,
  );
  return hit?.instructorNormalized ?? instructorLower;
}

// ---------------------------------------------------------------------------
// Top-level analysis
// ---------------------------------------------------------------------------

export function analyzeWorkbook(rows: WorkRow[], ctx: RepairContext): RepairReport {
  const findings: RepairFinding[] = [];
  const repaired: RepairedRow[] = [];

  rows.forEach((row, i) => {
    const analyzed = analyzeRow(row, i + 2, ctx);
    repaired.push(analyzed);
    findings.push(...analyzed.findings);
  });

  const dup = findDuplicates(rows, (rowNumber, finding) => {
    findings.push(finding);
    const target = repaired.find((r) => r.rowNumber === rowNumber);
    if (target) target.findings.push(finding);
  });

  const conflicts = detectConflicts(repaired);
  for (const c of conflicts) {
    const finding: RepairFinding = {
      code: "CONFLICT_OVERLAP",
      severity: "review",
      certainty: "certain",
      rowNumber: c.b.rowNumber,
      cn: c.b.cn,
      field: "Schedule",
      original: `${WEEKDAY_NAMES[c.weekday]} ${c.a.start}-${c.a.end}`,
      proposed: null,
      explanation: c.message,
      evidence: `CN ${c.a.cn} vs CN ${c.b.cn}, ${WEEKDAY_NAMES[c.weekday]}`,
      autoFixable: false,
      requiresApproval: true,
    };
    findings.push(finding);
    const target = repaired.find((r) => r.rowNumber === c.b.rowNumber);
    if (target) target.findings.push(finding);
  }

  const recon = reconcileRows(repaired);
  for (const program of recon.programs) {
    if (program.ok) continue;
    const affected = repaired.filter((r) => r.courseCode === program.courseCode);
    const rowNumber = affected.find((r) => r.status !== "clean")?.rowNumber ?? affected[0]?.rowNumber ?? 0;
    const finding: RepairFinding = {
      code: "HOURS_MISMATCH",
      severity: "review",
      certainty: "certain",
      rowNumber,
      cn: null,
      field: "Hours",
      original: `${program.expectedHours} scheduled hour(s)`,
      proposed: null,
      explanation: `${program.courseCode}: schedule has ${program.expectedHours} hour(s) but the printable sheet renders ${program.renderedHours}. ${program.problems.join(" ")}`,
      evidence: program.problems.join(" | "),
      autoFixable: false,
      requiresApproval: true,
    };
    findings.push(finding);
  }

  // Recompute row status now that cross-row findings were attached.
  for (const row of repaired) row.status = rowStatus(row.findings);

  findings.sort(
    (a, b) => a.rowNumber - b.rowNumber || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.code.localeCompare(b.code),
  );

  const bySeverity: Record<RepairSeverity, number> = { info: 0, warning: 0, error: 0, review: 0 };
  const byCode: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity]++;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

  const courseCodes = new Set(ctx.courses.map((c) => c.code));
  const roomCodes = new Set(ctx.rooms.map((r) => r.code));
  const facultyKeys = new Set(ctx.faculty.map((f) => nameKey(f.fullName)));
  const roomsToCreate = Array.from(
    new Set(repaired.flatMap((r) => r.meetings.map((m) => m.roomCode))),
  ).filter((c) => c && !roomCodes.has(c) && c.toUpperCase() !== "ASYNC").sort();
  const programsToCreate = Array.from(new Set(repaired.map((r) => r.courseCode).filter(Boolean))).filter((c) => !courseCodes.has(c)).sort();
  const facultyToCreate = Array.from(new Set(repaired.filter((r) => r.facultyMatch === "new").map((r) => r.instructorNormalized))).filter((n) => !facultyKeys.has(nameKey(n))).sort();

  const summary: RepairSummary = {
    rowsInspected: rows.length,
    cleanRows: repaired.filter((r) => r.status === "clean").length,
    warningRows: repaired.filter((r) => r.status === "warning").length,
    reviewRows: repaired.filter((r) => r.status === "review").length,
    invalidRows: repaired.filter((r) => r.status === "invalid").length,
    findings: findings.length,
    bySeverity,
    byCode,
    exactDuplicateGroups: dup.exactGroups,
    possibleDuplicateGroups: dup.possibleGroups,
    invalidTimeRows: new Set(findings.filter((f) => f.code.startsWith("TIME_")).map((f) => f.rowNumber)).size,
    instructorIssueRows: new Set(
      findings.filter((f) => ["MISSING_INSTRUCTOR", "NAME_UNMATCHED", "NAME_AMBIGUOUS"].includes(f.code)).map((f) => f.rowNumber),
    ).size,
    conflictFindings: findings.filter((f) => f.code === "CONFLICT_OVERLAP").length,
    scheduledHours: recon.scheduledHours,
    sheetHours: recon.sheetHours,
    unassignedMeetings: recon.unassignedMeetings,
    unassignedHours: recon.unassignedHours,
    roomsToCreate,
    programsToCreate,
    facultyToCreate,
  };

  return { summary, rows: repaired, findings, conflicts, programs: recon.programs };
}

// ---------------------------------------------------------------------------
// Applying decisions (pure) — used by the approval workflow and tests
// ---------------------------------------------------------------------------

export type RepairDecision = { action: "accept" | "reject" | "unresolved"; value?: string };

export type AppliedChange = {
  rowNumber: number;
  field: string;
  code: IssueCode;
  original: string;
  newValue: string;
  reason: string;
};

export type ApplyResult = {
  rows: WorkRow[];
  changes: AppliedChange[];
  droppedRows: number[];
  conflicts: { rowNumber: number; code: IssueCode; message: string }[];
};

// Recompute the proposed value for a finding deterministically and confirm it
// matches what was stored before applying. This is the same independent check
// used to validate AI suggestions.
export function recomputeProposal(row: WorkRow, finding: RepairFinding): string | null {
  const field = finding.field;
  const current = cell(row[field]);
  switch (finding.code) {
    case "WS_WHITESPACE":
      return normalizeWhitespace(current);
    case "NAME_FORMAT":
      return normaliseFacultyName(current);
    case "ROOM_LAB_SUFFIX": {
      const canonical = canonicalizeLabSuffix(current)
        .split("||")
        .map((p) => normalizeWhitespace(p))
        .join(" || ");
      return canonical;
    }
    case "SLOT_DUP_IN_CELL":
      return dedupeScheduleParts(current);
    default:
      return null;
  }
}

export function applyDecisions(
  rows: WorkRow[],
  findings: RepairFinding[],
  decisions: Map<string, RepairDecision>,
): ApplyResult {
  const changes: AppliedChange[] = [];
  const droppedRows: number[] = [];
  const conflicts: ApplyResult["conflicts"] = [];
  const out = rows.map((r) => ({ ...r }));
  const decisionKey = (f: RepairFinding) => `${f.rowNumber}|${f.code}|${f.field}`;

  for (const finding of findings) {
    const decision = decisions.get(decisionKey(finding));
    if (!decision) continue;
    if (decision.action === "reject" || decision.action === "unresolved") {
      if (decision.action === "unresolved") {
        conflicts.push({ rowNumber: finding.rowNumber, code: finding.code, message: `Row ${finding.rowNumber}: ${finding.explanation}` });
      }
      continue;
    }

    if (finding.code === "DUP_EXACT" || finding.code === "DUP_POSSIBLE") {
      // Only a review decision that explicitly selects a drop is applied.
      if (finding.field === "__row__" && decision.value === "drop") {
        droppedRows.push(finding.rowNumber);
      }
      continue;
    }

    const idx = finding.rowNumber - 2;
    if (idx < 0 || idx >= out.length) continue;

    const expected = recomputeProposal(out[idx], finding);
    // Deterministic fixes must match exactly. Findings without a deterministic
    // fix (missing instructor, overlap, unreadable time, ...) may still be
    // resolved, but only with an explicit value a human typed.
    let applied: string;
    if (expected !== null) {
      const desired = decision.value !== undefined ? decision.value : finding.proposed;
      if (desired === null || desired === undefined) {
        conflicts.push({ rowNumber: finding.rowNumber, code: finding.code, message: `Row ${finding.rowNumber}: nothing to apply for ${finding.code}.` });
        continue;
      }
      if (expected !== desired) {
        conflicts.push({
          rowNumber: finding.rowNumber,
          code: finding.code,
          message: `Row ${finding.rowNumber}: stored proposal no longer matches the deterministic result; skipped.`,
        });
        continue;
      }
      applied = expected;
    } else {
      if (decision.value === undefined || decision.value === null || decision.value === "") {
        conflicts.push({
          rowNumber: finding.rowNumber,
          code: finding.code,
          message: `Row ${finding.rowNumber}: ${finding.code} needs a value entered by a reviewer.`,
        });
        continue;
      }
      applied = decision.value;
    }

    const original = cell(out[idx][finding.field]);
    if (original === applied) continue;
    out[idx][finding.field] = applied;
    changes.push({
      rowNumber: finding.rowNumber,
      field: finding.field,
      code: finding.code,
      original,
      newValue: applied,
      reason: finding.explanation,
    });
  }

  const dropSet = new Set(droppedRows);
  const filtered = out.filter((_, i) => !dropSet.has(i + 2));

  return { rows: filtered, changes, droppedRows: [...dropSet].sort((a, b) => a - b), conflicts };
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

export function findingsByCategory(report: RepairReport) {
  const bySeverity = (s: RepairSeverity) => report.findings.filter((f) => f.severity === s);
  return {
    invalidTime: report.findings.filter((f) => f.code.startsWith("TIME_") || f.code === "DAY_UNKNOWN" || f.code === "SCHEDULE_UNPARSEABLE"),
    instructor: report.findings.filter((f) => ["MISSING_INSTRUCTOR", "NAME_UNMATCHED", "NAME_AMBIGUOUS", "NAME_FORMAT"].includes(f.code)),
    room: report.findings.filter((f) => ["ROOM_MISSING", "ROOM_LAB_SUFFIX"].includes(f.code)),
    duplicates: report.findings.filter((f) => f.code === "DUP_EXACT" || f.code === "DUP_POSSIBLE"),
    conflicts: report.findings.filter((f) => f.code === "CONFLICT_OVERLAP"),
    hours: report.findings.filter((f) => f.code === "HOURS_MISMATCH" || f.code === "SLOT_DUP_IN_CELL"),
    whitespace: report.findings.filter((f) => f.code === "WS_WHITESPACE"),
    errors: bySeverity("error"),
    review: bySeverity("review"),
    warnings: bySeverity("warning"),
    info: bySeverity("info"),
  };
}
