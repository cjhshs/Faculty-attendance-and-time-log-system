import { describe, it, expect, vi } from "vitest";
import { readRows } from "@/lib/import";
import {
  analyzeWorkbook,
  analyzeRow,
  applyDecisions,
  canonicalizeLabSuffix,
  dedupeScheduleParts,
  matchInstructor,
  normalizeWhitespace,
  recomputeProposal,
  type RepairContext,
  type RepairDecision,
  type RepairFinding,
  type WorkRow,
} from "@/lib/schedule-repair";
import { workbookBuffer } from "./workbook";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_CTX: RepairContext = { faculty: [], courses: [], rooms: [] };

function row(overrides: Partial<Record<string, unknown>> = {}): WorkRow {
  return {
    "Term Type": "1st Sem",
    Subject: "LIS101",
    CN: "42000",
    Description: "Intro",
    Unit: "3",
    Sem: "1st Sem",
    Schedule: "M 10:00 AM-11:00 AVR",
    Section: "lis1_a",
    Course: "BLIS",
    Slots: "20/40",
    Instructor: "Claver, Priscilla De Leon",
    Code: "x",
    ...overrides,
  };
}

function workbookRows(): Record<string, unknown>[] {
  return readRows(workbookBuffer()).rows;
}

function wbReport(ctx: RepairContext = EMPTY_CTX) {
  return analyzeWorkbook(workbookRows(), ctx);
}

function decisionKey(f: RepairFinding): string {
  return `${f.rowNumber}|${f.code}|${f.field}`;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("normalizeWhitespace / lab canonicalization", () => {
  it("collapses internal and edge whitespace", () => {
    expect(normalizeWhitespace("  A   B  ")).toBe("A B");
  });

  it("rewrites a non-standard qualifier to the canonical '(Lab)' per part", () => {
    expect(canonicalizeLabSuffix("M 07:00 AM-08:00 AGM102 (CE LAB)")).toBe("M 07:00 AM-08:00 AGM102 (Lab)");
    expect(canonicalizeLabSuffix("T 10:00 AM-11:00 COM B || M 10:00 AM-11:00 COM B (Lab)")).toBe(
      "T 10:00 AM-11:00 COM B || M 10:00 AM-11:00 COM B (Lab)",
    );
  });

  it("removes byte-identical repeated parts only", () => {
    expect(dedupeScheduleParts("M 10:00 AM-11:00 AVR || M 10:00 AM-11:00 AVR")).toBe("M 10:00 AM-11:00 AVR");
    expect(dedupeScheduleParts("M 10:00 AM-11:00 AVR || T 10:00 AM-11:00 AVR")).toBe(
      "M 10:00 AM-11:00 AVR || T 10:00 AM-11:00 AVR",
    );
  });
});

describe("matchInstructor", () => {
  const faculty = [
    { id: 1, fullName: "Claver, Priscilla De Leon" },
    { id: 2, fullName: "Buhat, Alvin Zamora" },
  ];

  it("treats empty and TBA as unassigned", () => {
    expect(matchInstructor("", faculty).match).toBe("unassigned");
    expect(matchInstructor("tba", faculty).match).toBe("unassigned");
  });

  it("matches an exact name ignoring case and stray spaces", () => {
    const m = matchInstructor("  claver,   priscilla de leon ", faculty);
    expect(m.match).toBe("matched");
    expect(m.facultyId).toBe(1);
  });

  it("surfaces a close-but-not-exact name for human confirmation", () => {
    const m = matchInstructor("Claver, Priscilla De Leonn", faculty);
    expect(m.match).toBe("ambiguous");
    expect(m.facultyId).toBeNull();
  });

  it("flags a brand-new instructor rather than guessing", () => {
    expect(matchInstructor("Nobody, Faraway Person", faculty).match).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// Per-row rules
// ---------------------------------------------------------------------------

describe("analyzeRow — findings and proposals", () => {
  it("flags stray whitespace on text fields and proposes the trimmed value", () => {
    const r = analyzeRow(row({ Subject: "  LIS101 ", Instructor: "Claver,  Priscilla De Leon" }), 2, EMPTY_CTX);
    const ws = r.findings.filter((f) => f.code === "WS_WHITESPACE");
    expect(ws.map((f) => f.field)).toContain("Subject");
    const name = r.findings.find((f) => f.code === "NAME_FORMAT")!;
    expect(name.proposed).toBe("Claver, Priscilla De Leon");
    expect(name.autoFixable).toBe(true);
    expect(name.requiresApproval).toBe(false);
  });

  it("parses a lab qualifier into the bare room plus isLab", () => {
    const r = analyzeRow(row({ Schedule: "M 07:00 AM-08:00 AGM102 (CE LAB) (Lab)" }), 2, EMPTY_CTX);
    expect(r.meetings).toHaveLength(1);
    expect(r.meetings[0].roomCode).toBe("AGM102");
    expect(r.meetings[0].isLab).toBe(true);
    expect(r.meetings[0].mode).toBe("LAB");
  });

  it("keeps only the physical room and never prints ASYNC", () => {
    const r = analyzeRow(
      row({ Schedule: "M 10:00 AM-11:00 TBA || M 10:00 AM-11:00 OLC || M 10:00 AM-11:00 ASYNC" }),
      2,
      EMPTY_CTX,
    );
    // All three parts share day+time, so they collapse to one meeting: OLC wins.
    expect(r.meetings).toHaveLength(1);
    expect(r.meetings[0].roomCode).toBe("OLC");
    expect(r.meetings[0].mode).toBe("ONLINE");
  });

  it("does not flag an instructor as missing when only the room is TBA", () => {
    const faculty = [{ id: 1, fullName: "Espinosa, Lester John" }];
    const r = analyzeRow(row({ Instructor: "Espinosa, Lester John", Schedule: "M 07:00 AM-09:00 TBA" }), 2, {
      faculty,
      courses: [],
      rooms: [],
    });
    expect(r.findings.some((f) => f.code === "MISSING_INSTRUCTOR")).toBe(false);
    expect(r.facultyMatch).toBe("matched");
  });

  it("flags a genuine missing instructor (TBA) and blocks the row as review", () => {
    const r = analyzeRow(row({ Instructor: "TBA" }), 2, EMPTY_CTX);
    expect(r.findings.some((f) => f.code === "MISSING_INSTRUCTOR")).toBe(true);
    expect(r.status).toBe("review");
  });

  it("records the documented hour count (07:00-14:00 = 7)", () => {
    const r = analyzeRow(row({ Schedule: "Sun 07:00 AM-02:00 AGM102" }), 2, EMPTY_CTX);
    expect(r.scheduledHours).toBe(7);
  });

  it("is deterministic (same input -> identical report)", () => {
    const a = JSON.stringify(wbReport());
    const b = JSON.stringify(wbReport());
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Whole-workbook rules
// ---------------------------------------------------------------------------

describe("analyzeWorkbook — real workbook", () => {
  const report = wbReport();

  it("reads all 382 data rows without throwing", () => {
    expect(report.summary.rowsInspected).toBe(382);
    expect(report.rows).toHaveLength(382);
  });

  it("finds exactly the three unprintable rows (277, 336, 354)", () => {
    const invalid = report.rows.filter((r) => r.status === "invalid").map((r) => r.rowNumber);
    expect(invalid).toEqual([277, 336, 354]);
  });

  it("classifies the two zero-length/backwards rows as time errors", () => {
    const timeRows = report.findings.filter((f) => f.code === "TIME_ZERO_LENGTH").map((f) => f.rowNumber);
    expect(new Set(timeRows)).toEqual(new Set([277, 336]));
  });

  it("flags the three rows with no instructor (68, 84, 354)", () => {
    const rows = report.findings.filter((f) => f.code === "MISSING_INSTRUCTOR").map((f) => f.rowNumber);
    expect(rows).toEqual([68, 84, 354]);
  });

  it("detects exactly one possible duplicate (LIS105 CN 42003/42007)", () => {
    expect(report.summary.exactDuplicateGroups).toBe(0);
    expect(report.summary.possibleDuplicateGroups).toBe(1);
    const dup = report.findings.filter((f) => f.code === "DUP_POSSIBLE");
    expect(dup).toHaveLength(1);
    expect(dup[0].explanation).toContain("Rows 5, 6");
    expect(dup[0].rowNumber).toBe(6);
  });

  it("reports every real same-time instructor clash", () => {
    expect(report.summary.conflictFindings).toBe(17);
    expect(report.conflicts.length).toBe(35);
    expect(report.conflicts.filter((c) => c.kind === "CONFLICT")).toHaveLength(17);
  });

  it("separates same-subject concurrent sections from real clashes", () => {
    const combined = report.findings.filter((f) => f.code === "COMBINED_SECTIONS");
    expect(combined).toHaveLength(18);
    expect(combined.filter((f) => /Crujedo/.test(f.explanation))).toHaveLength(1);
  });

  it("never reports one class twice as a clash", () => {
    for (const c of report.conflicts) expect(c.a.cn).not.toBe(c.b.cn);
  });

  it("never renders more sheet hours than scheduled hours", () => {
    expect(report.summary.sheetHours).toBeLessThanOrEqual(report.summary.scheduledHours);
  });

  it("lists the rooms the workbook needs but the database does not have", () => {
    expect(report.summary.roomsToCreate).toContain("OLC");
    expect(report.summary.roomsToCreate).toContain("AGM102");
    expect(report.summary.roomsToCreate).not.toContain("AGM102 (CE LAB)");
    expect(report.summary.roomsToCreate).not.toContain("ASYNC");
  });

  it("marks each of the five programs for creation", () => {
    expect(report.summary.programsToCreate).toEqual(["ACT", "BLIS", "BSCE-SE", "BSCS", "BSIT"]);
  });
});

// ---------------------------------------------------------------------------
// Conflict precision
// ---------------------------------------------------------------------------

describe("detectConflicts via analyzeWorkbook", () => {
  const faculty = [{ id: 1, fullName: "Test, Teacher" }];
  const ctx: RepairContext = { faculty, courses: [], rooms: [] };

  function conflictRows(rows: WorkRow[]) {
    return analyzeWorkbook(rows, ctx).conflicts;
  }

  it("flags two different classes at the same time", () => {
    const c = conflictRows([
      row({ CN: "1", Subject: "A", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
      row({ CN: "2", Subject: "B", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].sameClassNumber).toBe(false);
  });

  it("flags a genuine partial overlap", () => {
    const c = conflictRows([
      row({ CN: "1", Subject: "A", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
      row({ CN: "2", Subject: "B", Instructor: "Test, Teacher", Schedule: "M 10:30 AM-11:30 AVR" }),
    ]);
    expect(c).toHaveLength(1);
  });

  it("ignores back-to-back classes and the same class number", () => {
    const adjacent = conflictRows([
      row({ CN: "1", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
      row({ CN: "2", Instructor: "Test, Teacher", Schedule: "M 11:00 AM-12:00 AVR" }),
    ]);
    expect(adjacent).toHaveLength(0);
    const sameCn = conflictRows([
      row({ CN: "1", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
      row({ CN: "1", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
    ]);
    expect(sameCn).toHaveLength(0);
  });

  it("does not clash across different weekdays", () => {
    const c = conflictRows([
      row({ CN: "1", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
      row({ CN: "2", Instructor: "Test, Teacher", Schedule: "T 10:00 AM-11:00 AVR" }),
    ]);
    expect(c).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hour reconciliation
// ---------------------------------------------------------------------------

describe("hour reconciliation", () => {
  const faculty = [{ id: 1, fullName: "Test, Teacher" }];
  const ctx: RepairContext = { faculty, courses: [{ id: 1, code: "BLIS" }], rooms: [] };

  it("collapses overlapping meetings in the union but counts them in the schedule", () => {
    const report = analyzeWorkbook(
      [
        row({ CN: "1", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
        row({ CN: "2", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
      ],
      ctx,
    );
    expect(report.summary.scheduledHours).toBe(2);
    expect(report.summary.sheetHours).toBe(1);
    expect(report.programs.find((p) => p.courseCode === "BLIS")!.ok).toBe(false);
  });

  it("keeps distinct times as separate sheet blocks", () => {
    const report = analyzeWorkbook(
      [
        row({ CN: "1", Instructor: "Test, Teacher", Schedule: "M 10:00 AM-11:00 AVR" }),
        row({ CN: "2", Instructor: "Test, Teacher", Schedule: "M 01:00 PM-02:00 AVR" }),
      ],
      ctx,
    );
    expect(report.summary.scheduledHours).toBe(2);
    expect(report.summary.sheetHours).toBe(2);
  });

  it("excludes unassigned meetings from the printed totals but counts them separately", () => {
    const report = analyzeWorkbook([row({ CN: "9", Instructor: "TBA", Schedule: "M 10:00 AM-11:00 AVR" })], ctx);
    expect(report.summary.unassignedMeetings).toBe(1);
    expect(report.summary.scheduledHours).toBe(0);
    expect(report.summary.sheetHours).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Approval workflow (pure) — accept / reject / unresolved, idempotency
// ---------------------------------------------------------------------------

describe("applyDecisions", () => {
  const faculty = [{ id: 1, fullName: "Claver, Priscilla De Leon" }];
  const ctx: RepairContext = { faculty, courses: [{ id: 1, code: "BLIS" }], rooms: [] };

  it("applies a whitespace fix and records original/new/reason", () => {
    const rows = [row({ Subject: "  LIS101 " })];
    const report = analyzeWorkbook(rows, ctx);
    const ws = report.findings.find((f) => f.code === "WS_WHITESPACE" && f.field === "Subject")!;
    const decisions = new Map<string, RepairDecision>([[decisionKey(ws), { action: "accept" }]]);
    const result = applyDecisions(rows, report.findings, decisions);
    expect(result.rows[0]["Subject"]).toBe("LIS101");
    const change = result.changes.find((c) => c.field === "Subject")!;
    expect(change.original).toBe("  LIS101 ");
    expect(change.newValue).toBe("LIS101");
    expect(change.reason).toBe(ws.explanation);
  });

  it("is idempotent: re-analyzing the repaired rows yields no auto-fix findings", () => {
    const rows = [row({ Subject: "  LIS101 ", Instructor: "Claver,  Priscilla De Leon", Schedule: "  M 10:00 AM-11:00 AVR  " })];
    const report = analyzeWorkbook(rows, ctx);
    const autoFix = report.findings.filter((f) => f.autoFixable);
    const decisions = new Map<string, RepairDecision>(autoFix.map((f) => [decisionKey(f), { action: "accept" }]));
    const first = applyDecisions(rows, report.findings, decisions);
    // Applying twice must not change anything further.
    const second = applyDecisions(first.rows, report.findings, decisions);
    expect(second.rows).toEqual(first.rows);
    expect(second.changes).toHaveLength(0);
    const reanalyzed = analyzeWorkbook(first.rows, ctx);
    expect(reanalyzed.findings.filter((f) => f.autoFixable)).toHaveLength(0);
  });

  it("leaves a rejected finding untouched", () => {
    const rows = [row({ Subject: "  LIS101 " })];
    const report = analyzeWorkbook(rows, ctx);
    const ws = report.findings.find((f) => f.code === "WS_WHITESPACE" && f.field === "Subject")!;
    const result = applyDecisions(rows, report.findings, new Map([[decisionKey(ws), { action: "reject" }]]));
    expect(result.rows[0]["Subject"]).toBe("  LIS101 ");
    expect(result.changes).toHaveLength(0);
  });

  it("collects unresolved findings as blocking conflicts", () => {
    const rows = [row({ Instructor: "TBA" })];
    const report = analyzeWorkbook(rows, ctx);
    const mi = report.findings.find((f) => f.code === "MISSING_INSTRUCTOR")!;
    const result = applyDecisions(rows, report.findings, new Map([[decisionKey(mi), { action: "unresolved" }]]));
    expect(result.conflicts.some((c) => c.code === "MISSING_INSTRUCTOR")).toBe(true);
  });

  it("skips a stored proposal that no longer matches the deterministic result", () => {
    const rows = [row({ Subject: "  LIS101 " })];
    const report = analyzeWorkbook(rows, ctx);
    const ws = report.findings.find((f) => f.code === "WS_WHITESPACE" && f.field === "Subject")!;
    const tampered: RepairFinding = { ...ws, proposed: "LIS999" };
    const decisions = new Map<string, RepairDecision>([[decisionKey(tampered), { action: "accept", value: "LIS999" }]]);
    const result = applyDecisions(rows, [tampered], decisions);
    expect(result.rows[0]["Subject"]).toBe("  LIS101 ");
    expect(result.conflicts).toHaveLength(1);
  });

  it("applies an explicit reviewer value for a finding with no deterministic fix", () => {
    const rows = [row({ Instructor: "TBA" })];
    const report = analyzeWorkbook(rows, ctx);
    const mi = report.findings.find((f) => f.code === "MISSING_INSTRUCTOR")!;
    const result = applyDecisions(
      rows,
      report.findings,
      new Map([[decisionKey(mi), { action: "accept", value: "Claver, Priscilla De Leon" }]]),
    );
    expect(result.rows[0]["Instructor"]).toBe("Claver, Priscilla De Leon");
    const change = result.changes.find((c) => c.field === "Instructor")!;
    expect(change.original).toBe("TBA");
    expect(change.newValue).toBe("Claver, Priscilla De Leon");
  });

  it("refuses to accept a no-fix finding without a value", () => {
    const rows = [row({ Instructor: "TBA" })];
    const report = analyzeWorkbook(rows, ctx);
    const mi = report.findings.find((f) => f.code === "MISSING_INSTRUCTOR")!;
    const result = applyDecisions(rows, report.findings, new Map([[decisionKey(mi), { action: "accept" }]]));
    expect(result.conflicts.some((c) => c.code === "MISSING_INSTRUCTOR")).toBe(true);
    expect(result.rows[0]["Instructor"]).toBe("TBA");
  });

  it("only drops a duplicate row when a drop is explicitly chosen", () => {    const rows = [
      row({ CN: "42003", Subject: "LIS105", Section: "lis1_b", Instructor: "Narciso, Jessie John Saligue", Schedule: "M 01:00 PM-02:00 TBA" }),
      row({ CN: "42007", Subject: "LIS105", Section: "lis1_b", Instructor: "Narciso, Jessie John Saligue", Schedule: "M 01:00 PM-02:00 TBA" }),
    ];
    const report = analyzeWorkbook(rows, ctx);
    const dup = report.findings.find((f) => f.code === "DUP_POSSIBLE")!;
    const keep = applyDecisions(rows, report.findings, new Map([[decisionKey(dup), { action: "reject" }]]));
    expect(keep.droppedRows).toEqual([]);
    const drop = applyDecisions(rows, report.findings, new Map([[decisionKey(dup), { action: "accept", value: "drop" }]]));
    expect(drop.droppedRows).toEqual([3]);
    expect(drop.rows).toHaveLength(1);
  });
});

describe("recomputeProposal", () => {
  it("independently derives the same value the engine proposed", () => {
    const rows = [row({ Subject: "  A  B ", Instructor: "X,  Y" })];
    const report = analyzeWorkbook(rows, EMPTY_CTX);
    for (const f of report.findings.filter((x) => x.autoFixable)) {
      const idx = f.rowNumber - 2;
      expect(recomputeProposal(rows[idx], f)).toBe(f.proposed);
    }
  });

  it("returns null for findings that have no deterministic fix", () => {
    const f = { code: "MISSING_INSTRUCTOR", field: "Instructor" } as RepairFinding;
    expect(recomputeProposal(row(), f)).toBeNull();
  });
});
