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
  const pairOf = (c: ImportPlan["conflicts"][number]) => [c.a.cn, c.b.cn].sort().join("/");

  it("reports only genuine double-bookings", () => {
    expect(plan.conflicts.length).toBe(17);
    expect(new Set(plan.conflicts.map((c) => c.facultyName)).size).toBe(8);
    expect(plan.conflicts.every((c) => c.kind === "CONFLICT" && c.blocking)).toBe(true);
  });

  it("finds the conflicts the source sheet really contains", () => {
    const pairs = plan.conflicts.map(pairOf);
    expect(pairs).toContain(["42000", "42011"].sort().join("/")); // Claver, LIS101 vs LIS111, 10-11
    expect(pairs).toContain(["48005", "48007"].sort().join("/")); // Saligumba, GE501 vs GE401, 8-9
    expect(pairs).toContain(["44034", "48075"].sort().join("/")); // Tabal, FIL1 vs GE205, 2-3
    expect(pairs).toContain(["48085", "48135"].sort().join("/")); // Pascual, SP101 vs CC104 Friday
    expect(pairs).toContain(["40001", "47016"].sort().join("/")); // Nosotros, Mon+Tue 5-7
  });

  it("collapses a repeated day-by-day overlap into one finding", () => {
    const jamero = plan.conflicts.filter((c) => c.facultyName.startsWith("Jamero") &&
      [c.a.cn, c.b.cn].sort().join("/") === ["47013", "47020"].sort().join("/"));
    expect(jamero).toHaveLength(1);
    expect(jamero[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(jamero[0].message.match(/Monday/g) ?? []).toHaveLength(1);
  });

  it("keeps the same class split with different end times out of conflicts", () => {
    const espinosa = plan.duplicateSchedules.find((c) => c.a.cn === "48146");
    expect(espinosa).toBeDefined();
    expect(espinosa!.kind).toBe("DUPLICATE");
    expect(plan.conflicts.some((c) => c.a.cn === "48146" && c.b.cn === "48146")).toBe(false);
  });

  it("reports the same subject taught to several sections as a possible combined class", () => {
    const buhat = plan.combinedClasses.find(
      (c) => pairOf(c) === ["48112", "48173"].sort().join("/"),
    );
    expect(buhat).toBeDefined();
    expect(buhat!.blocking).toBe(false);
    expect(plan.conflicts.some((c) => pairOf(c) === ["48112", "48173"].sort().join("/"))).toBe(false);
  });

  it("reports one combined block per time slot instead of every section pair", () => {
    const crujedo = plan.combinedClasses.filter((c) => c.facultyName.startsWith("Crujedo"));
    expect(crujedo).toHaveLength(1);
    expect(crujedo[0].cnList).toHaveLength(6);
  });

  it("reports the same subject and section split across two CNs as a duplicate", () => {
    const narciso = plan.duplicateSchedules.find(
      (c) => [c.a.cn, c.b.cn].sort().join("/") === ["42003", "42007"].sort().join("/"),
    );
    expect(narciso).toBeDefined();
    expect(narciso!.sameSubject).toBe(true);
    expect(narciso!.sameSection).toBe(true);
    expect(plan.conflicts.some((c) => pairOf(c) === ["42003", "42007"].sort().join("/"))).toBe(false);
  });

  it("never flags a consecutive class that starts when the previous one ends", () => {
    const silah = [
      ...plan.conflicts,
      ...plan.combinedClasses,
      ...plan.duplicateSchedules,
    ].filter((c) => c.facultyName.startsWith("Silah"));
    expect(silah).toEqual([]);
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
