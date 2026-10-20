import { describe, it, expect, vi } from "vitest";
import { readRows, planFromRows, type ImportPlan, type PlannedSlot } from "@/lib/import";
import { workbookBuffer } from "./workbook";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const TARGET = { schoolYear: "2026-2027", semester: "1st Semester" };

function realPlan(): ImportPlan {
  const { rows, worksheetRows, missingColumns } = readRows(workbookBuffer());
  return planFromRows(rows, {
    faculty: [],
    courses: [],
    rooms: [],
    existingSlots: [],
    target: TARGET,
    worksheetRows,
    missingColumns,
  });
}

const plan = realPlan();

function mondayCounts(slots: PlannedSlot[]) {
  const byCourse: Record<string, number> = {};
  for (const s of slots.filter((s) => s.weekday === 1)) {
    byCourse[s.courseCode] = (byCourse[s.courseCode] ?? 0) + 1;
  }
  return byCourse;
}

describe("A. reconciliation totals against the real workbook", () => {
  it("reads every worksheet row and accounts for all of them", () => {
    expect(plan.summary.worksheetRows).toBe(383);
    expect(plan.summary.dataRows).toBe(382);
    expect(plan.summary.errorRows).toBe(3);
    expect(plan.summary.parsedRows).toBe(379);
    expect(plan.summary.meetingEntries).toBe(763);
    expect(plan.summary.validBlocks).toBe(464);
  });

  it("plans one slot per meeting per weekday", () => {
    expect(plan.summary.plannedSlots).toBe(1149);
    expect(plan.summary.importable).toBe(1149);
  });

  it("accounts for every data row as parsed or errored", () => {
    expect(plan.summary.parsedRows + plan.summary.errorRows).toBe(plan.summary.dataRows);
  });
});

describe("B. invalid rows are flagged, never skipped", () => {
  it("flags exactly rows 277, 336 and 354", () => {
    expect(plan.errors.map((e) => e.row).sort((a, b) => a - b)).toEqual([277, 336, 354]);
  });

  it("describes the zero-length and unparseable rows", () => {
    const byRow = new Map(plan.errors.map((e) => [e.row, e.message]));
    expect(byRow.get(277)).toContain("after the start time");
    expect(byRow.get(336)).toContain("after the start time");
    expect(byRow.get(354)).toContain("Could not parse");
  });
});

describe("C. per-program counts (program isolation)", () => {
  it("matches the verified Monday distribution", () => {
    expect(mondayCounts(plan.slots)).toEqual({
      ACT: 2,
      BSCS: 16,
      "BSCE-SE": 81,
      BSIT: 98,
      BLIS: 17,
    });
  });
});

describe("D. no cross-program contamination", () => {
  const bsit = plan.slots.filter((s) => s.courseCode === "BSIT");

  it("never places Claver or Atienza in BSIT", () => {
    expect(bsit.some((s) => /Claver|Atienza/i.test(s.facultyName ?? ""))).toBe(false);
  });

  it("places CN 44017 in BSCE-SE with Siose, not BSIT with Claver", () => {
    const slots = plan.slots.filter((s) => s.cn === "44017");
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.courseCode === "BSCE-SE")).toBe(true);
    expect(slots.every((s) => /Siose/i.test(s.facultyName ?? ""))).toBe(true);
  });

  it("places CN 44018 in BSCE-SE with Tabal, not BSIT with Atienza", () => {
    const slots = plan.slots.filter((s) => s.cn === "44018");
    expect(slots.every((s) => s.courseCode === "BSCE-SE")).toBe(true);
    expect(slots.every((s) => /Tabal/i.test(s.facultyName ?? ""))).toBe(true);
  });
});

describe("E. faculty conflicts are detected, not resolved", () => {
  it("reports the known double-bookings", () => {
    const pairs = (faculty: string) =>
      plan.conflicts
        .filter((c) => c.facultyName.startsWith(faculty) && c.weekday === 1)
        .map((c) => [c.a.cn, c.b.cn].sort().join("/"));
    expect(pairs("Buhat")).toContain(["48173", "48112"].sort().join("/"));
    expect(pairs("Fajartin")).toContain(["48103", "48142"].sort().join("/"));
    expect(pairs("Pascual")).toContain(["48113", "48101"].sort().join("/"));
  });

  it("reports every overlapping pair and marks same-CN overlaps", () => {
    expect(plan.conflicts.length).toBeGreaterThan(100);
    expect(plan.conflicts.some((c) => c.sameClassNumber)).toBe(true);
  });
});

describe("F. unassigned instructors", () => {
  it("reports TBA rows 68 and 84 as unassigned", () => {
    expect(plan.unassigned.map((u) => u.row).sort((a, b) => a - b)).toEqual([68, 84]);
  });

  it("keeps Espinosa's Monday BSIT class as a TBA meeting", () => {
    const slot = plan.slots.find(
      (s) => s.courseCode === "BSIT" && /Espinosa/i.test(s.facultyName ?? "") && s.weekday === 1,
    );
    expect(slot).toBeDefined();
    expect(slot!.cn).toBe("48132");
    expect(slot!.roomCode).toBe("TBA");
    expect(slot!.start).toBe("07:00");
    expect(slot!.end).toBe("09:00");
  });
});

describe("G. a legitimate long block survives parsing", () => {
  it("imports the 7-hour Sunday block for CN 44185", () => {
    const slot = plan.slots.find((s) => s.cn === "44185" && s.weekday === 0);
    expect(slot).toBeDefined();
    expect(slot!.start).toBe("07:00");
    expect(slot!.end).toBe("14:00");
  });
});
