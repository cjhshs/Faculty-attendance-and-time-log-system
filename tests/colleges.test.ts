import { describe, it, expect, vi } from "vitest";
import {
  COLLEGE_DEFS,
  PROGRAM_CATALOG,
  UNASSIGNED_COLLEGE_VALUE,
  collegeNameFor,
  normalizeCourseCode,
  programForCode,
  programsForCollege,
} from "@/lib/college-catalog";
import { normalizeScopeSelection, slotScopeWhere, collegeTag } from "@/lib/colleges";
import { readRows, planFromRows, slotInScope, type ImportPlan } from "@/lib/import";
import { allProgramsBuffer } from "./workbook";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

function realPlan(): ImportPlan {
  const { rows, worksheetRows, missingColumns } = readRows(allProgramsBuffer());
  return planFromRows(rows, {
    faculty: [],
    courses: [],
    rooms: [],
    existingSlots: [],
    target: { schoolYear: "2026-2027", semester: "1st Semester" },
    worksheetRows,
    missingColumns,
  });
}

const plan = realPlan();
const mapping = new Map(plan.programMapping.map((m) => [m.code, m]));

describe("A. the official catalog", () => {
  it("lists all 41 program codes exactly once", () => {
    expect(PROGRAM_CATALOG).toHaveLength(41);
    expect(new Set(PROGRAM_CATALOG.map((p) => p.code)).size).toBe(41);
    for (const program of PROGRAM_CATALOG) {
      expect(program.code).toBe(normalizeCourseCode(program.code));
      expect(program.name.length).toBeGreaterThan(0);
    }
  });

  it("splits into 27 official, 9 additional and 5 unassigned programs", () => {
    expect(PROGRAM_CATALOG.filter((p) => p.official)).toHaveLength(27);
    expect(PROGRAM_CATALOG.filter((p) => !p.official && p.college)).toHaveLength(9);
    expect(PROGRAM_CATALOG.filter((p) => p.college === null)).toHaveLength(5);
  });

  it("only uses colleges defined in COLLEGE_DEFS, in a fixed order", () => {
    const valid = new Set(COLLEGE_DEFS.map((c) => c.code));
    for (const program of PROGRAM_CATALOG) {
      if (program.college) expect(valid.has(program.college)).toBe(true);
    }
    expect(COLLEGE_DEFS.map((c) => c.sortOrder)).toEqual(
      [...COLLEGE_DEFS.map((c) => c.sortOrder)].sort((a, b) => a - b),
    );
  });

  it("keeps every program reachable from its college", () => {
    const total = COLLEGE_DEFS.reduce(
      (sum, college) => sum + programsForCollege(college.code).length,
      0,
    );
    expect(total).toBe(36);
    expect(programsForCollege("CET").map((p) => p.code)).toContain("BSCS");
    expect(collegeNameFor("COAHS")).toBe("College of Allied Health Sciences");
  });
});

describe("B. course code normalization", () => {
  it("ignores case and repeated whitespace but keeps the real code", () => {
    expect(normalizeCourseCode("  bsed -   english ")).toBe("BSED - ENGLISH");
    expect(normalizeCourseCode(null)).toBe("");
    expect(programForCode("bsit")?.code).toBe("BSIT");
    expect(programForCode("  bsba - fm  ")?.code).toBe("BSBA - FM");
  });

  it("returns null for codes that are not in the catalog", () => {
    expect(programForCode("XXXX")).toBeNull();
    expect(programForCode("")).toBeNull();
  });
});

describe("C. mapping the consolidated workbook", () => {
  it("finds 41 programs and knows every one of them", () => {
    expect(plan.summary.programsInFile).toBe(41);
    expect(plan.summary.programsUnknown).toBe(0);
    expect(plan.programMapping.every((m) => m.inCatalog)).toBe(true);
  });

  it("maps 36 programs to a college and leaves exactly 5 for review", () => {
    expect(plan.summary.programsMapped).toBe(36);
    expect(plan.summary.programsUnassigned).toBe(5);
    expect(
      plan.programMapping
        .filter((m) => !m.collegeCode)
        .map((m) => m.code)
        .sort(),
    ).toEqual(["BAEL", "BAP", "BPA", "BPEA", "BSESS"]);
  });

  it("accounts for every row and slot in the file", () => {
    const rows = plan.programMapping.reduce((sum, m) => sum + m.rows, 0);
    const slots = plan.programMapping.reduce((sum, m) => sum + m.slots, 0);
    expect(rows).toBe(plan.summary.dataRows);
    expect(slots).toBe(plan.summary.plannedSlots);
    expect(plan.summary.dataRows).toBe(1985);
  });

  it("orders programs by college, unassigned last", () => {
    const last = plan.programMapping.at(-1);
    expect(last?.collegeCode).toBeNull();
    const firstCodes = plan.programMapping.slice(0, 5).map((m) => m.collegeCode);
    expect(new Set(firstCodes)).toEqual(new Set(["CET"]));
  });

  it("counts both reused course numbers in their own programs", () => {
    expect(mapping.get("BCAED")?.rows).toBeGreaterThan(0);
    expect(mapping.get("BECED")?.rows).toBeGreaterThan(0);
  });
});

describe("D. import scope", () => {
  it("writes everything when no scope is selected", () => {
    expect(slotInScope("BSCS")).toBe(true);
    expect(slotInScope("BSCS", {})).toBe(true);
    expect(slotInScope("BSCS", { college: "", program: "" })).toBe(true);
  });

  it("narrows to one program regardless of code formatting", () => {
    expect(slotInScope("BSED - ENGLISH", { program: "bsed -  english" })).toBe(true);
    expect(slotInScope("BSED - SCIENCE", { program: "BSED - ENGLISH" })).toBe(false);
  });

  it("narrows to a college using the catalog", () => {
    expect(slotInScope("BSCS", { college: "CET" })).toBe(true);
    expect(slotInScope("BSN", { college: "CET" })).toBe(false);
    expect(slotInScope("BAP", { college: UNASSIGNED_COLLEGE_VALUE })).toBe(true);
    expect(slotInScope("BSCS", { college: UNASSIGNED_COLLEGE_VALUE })).toBe(false);
  });

  it("prefers the database assignment over the catalog", () => {
    const scope = {
      college: "CBE",
      collegeByCode: { BSCS: "CBE", BSN: null } as Record<string, string | null>,
    };
    expect(slotInScope("BSCS", scope)).toBe(true);
    expect(slotInScope("BSN", scope)).toBe(false);
    expect(slotInScope("BSN", { ...scope, college: UNASSIGNED_COLLEGE_VALUE })).toBe(true);
    expect(slotInScope("BSCR", { ...scope })).toBe(false);
  });

  it("treats a code the catalog does not know as unassigned", () => {
    expect(slotInScope("XXXX", { college: UNASSIGNED_COLLEGE_VALUE })).toBe(true);
    expect(slotInScope("XXXX", { college: "CET" })).toBe(false);
  });
});

describe("E. filter helpers", () => {
  const options = {
    colleges: [
      {
        id: 1,
        code: "CET",
        name: "College of Engineering and Technology",
        sortOrder: 10,
        programs: [{ id: 1, code: "BSIT", name: "IT", official: true }],
      },
    ],
    unassigned: [{ id: 2, code: "BAP", name: "Psychology", official: false }],
    all: [
      { id: 1, code: "BSIT", name: "IT", official: true },
      { id: 2, code: "BAP", name: "Psychology", official: false },
    ],
  };

  it("builds a where-clause that only narrows", () => {
    expect(slotScopeWhere({})).toEqual({});
    expect(slotScopeWhere({ college: "CET" })).toEqual({ course: { college: { code: "CET" } } });
    expect(slotScopeWhere({ college: UNASSIGNED_COLLEGE_VALUE })).toEqual({
      course: { collegeId: null },
    });
    expect(slotScopeWhere({ program: "BSIT" })).toEqual({ course: { code: "BSIT" } });
  });

  it("drops a program that no longer belongs to the selected college", () => {
    expect(normalizeScopeSelection(options, { college: "CET", program: "BSIT" })).toEqual({
      college: "CET",
      program: "BSIT",
    });
    expect(normalizeScopeSelection(options, { college: "CET", program: "BAP" })).toEqual({
      college: "CET",
      program: null,
    });
    expect(
      normalizeScopeSelection(options, {
        college: UNASSIGNED_COLLEGE_VALUE,
        program: "BAP",
      }),
    ).toEqual({ college: UNASSIGNED_COLLEGE_VALUE, program: "BAP" });
  });

  it("shortens a college name for badges", () => {
    expect(collegeTag("College of Engineering and Technology")).toBe(
      "Engineering and Technology",
    );
    expect(collegeTag(null)).toBe("Unassigned");
  });
});
