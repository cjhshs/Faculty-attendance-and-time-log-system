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

describe("A. the official CET catalog", () => {
  it("lists all 5 CET program codes exactly once", () => {
    expect(PROGRAM_CATALOG).toHaveLength(5);
    expect(new Set(PROGRAM_CATALOG.map((p) => p.code)).size).toBe(5);
    for (const program of PROGRAM_CATALOG) {
      expect(program.code).toBe(normalizeCourseCode(program.code));
      expect(program.name.length).toBeGreaterThan(0);
      expect(program.college).toBe("CET");
    }
  });

  it("all 5 programs are official CET programs", () => {
    expect(PROGRAM_CATALOG.filter((p) => p.official)).toHaveLength(5);
    expect(PROGRAM_CATALOG.filter((p) => p.college === "CET")).toHaveLength(5);
  });

  it("only uses CET defined in COLLEGE_DEFS", () => {
    expect(COLLEGE_DEFS).toHaveLength(1);
    expect(COLLEGE_DEFS[0].code).toBe("CET");
    expect(COLLEGE_DEFS[0].name).toBe("College of Engineering and Technology");
  });

  it("keeps every program reachable from CET", () => {
    const total = COLLEGE_DEFS.reduce(
      (sum, college) => sum + programsForCollege(college.code).length,
      0,
    );
    expect(total).toBe(5);
    expect(programsForCollege("CET").map((p) => p.code)).toContain("BSCS");
    expect(programsForCollege("CET").map((p) => p.code)).toContain("BSIT");
    expect(programsForCollege("CET").map((p) => p.code)).toContain("BSCE-SE");
    expect(collegeNameFor("CET")).toBe("College of Engineering and Technology");
    expect(collegeNameFor("COAHS")).toBeNull();
  });
});

describe("B. course code normalization", () => {
  it("ignores case and repeated whitespace but keeps the real code", () => {
    expect(normalizeCourseCode("  bsed -   english ")).toBe("BSED - ENGLISH");
    expect(normalizeCourseCode(null)).toBe("");
    expect(programForCode("bsit")?.code).toBe("BSIT");
    expect(programForCode("  bscs  ")?.code).toBe("BSCS");
  });

  it("returns null for codes that are not in the CET catalog", () => {
    expect(programForCode("XXXX")).toBeNull();
    expect(programForCode("")).toBeNull();
    expect(programForCode("BSBA - FM")).toBeNull();
  });
});

describe("C. mapping the consolidated workbook to CET scope", () => {
  it("finds 41 programs in the multi-department file", () => {
    expect(plan.summary.programsInFile).toBe(41);
  });

  it("maps the 5 CET programs to CET and identifies 36 non-CET programs", () => {
    expect(plan.summary.programsMapped).toBe(5);
    expect(plan.summary.programsUnknown).toBe(36);
    expect(
      plan.programMapping
        .filter((m) => m.collegeCode === "CET")
        .map((m) => m.code)
        .sort(),
    ).toEqual(["ACT", "BLIS", "BSCE-SE", "BSCS", "BSIT"]);
  });

  it("accounts for every row and slot in the file", () => {
    const rows = plan.programMapping.reduce((sum, m) => sum + m.rows, 0);
    const slots = plan.programMapping.reduce((sum, m) => sum + m.slots, 0);
    expect(rows).toBe(plan.summary.dataRows);
    expect(slots).toBe(plan.summary.plannedSlots);
    expect(plan.summary.dataRows).toBe(1985);
  });

  it("orders programs with CET first, non-CET last", () => {
    const last = plan.programMapping.at(-1);
    expect(last?.collegeCode).toBeNull();
    const firstCodes = plan.programMapping.slice(0, 5).map((m) => m.collegeCode);
    expect(new Set(firstCodes)).toEqual(new Set(["CET"]));
  });
});

describe("D. import scope", () => {
  it("writes everything when no scope is selected", () => {
    expect(slotInScope("BSCS")).toBe(true);
    expect(slotInScope("BSCS", {})).toBe(true);
    expect(slotInScope("BSCS", { college: "", program: "" })).toBe(true);
  });

  it("narrows to one program regardless of code formatting", () => {
    expect(slotInScope("BSIT", { program: "bsit" })).toBe(true);
    expect(slotInScope("BSCS", { program: "BSIT" })).toBe(false);
  });

  it("narrows to CET using the catalog", () => {
    expect(slotInScope("BSCS", { college: "CET" })).toBe(true);
    expect(slotInScope("BSN", { college: "CET" })).toBe(false);
    expect(slotInScope("BSN", { college: UNASSIGNED_COLLEGE_VALUE })).toBe(true);
    expect(slotInScope("BSCS", { college: UNASSIGNED_COLLEGE_VALUE })).toBe(false);
  });

  it("prefers the database assignment over the catalog", () => {
    const scope = {
      college: "CET",
      collegeByCode: { BSCS: "CET", BSN: null } as Record<string, string | null>,
    };
    expect(slotInScope("BSCS", scope)).toBe(true);
    expect(slotInScope("BSN", scope)).toBe(false);
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
