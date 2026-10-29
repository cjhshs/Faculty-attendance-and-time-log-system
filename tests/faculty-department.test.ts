import { describe, it, expect } from "vitest";
import {
  facultyNameKey,
  findDuplicateFacultyRows,
  matchInstructor,
  nameSimilarity,
  slotBelongsToDepartment,
  type RosterFaculty,
} from "@/lib/faculty-department";
import { attendanceSignatureScopeKey, clampSignatureField } from "@/lib/print-signature";

const roster: RosterFaculty[] = [
  { id: 1, fullName: "Dela Cruz, Juan P.", departmentCode: "CET", departmentName: "Engineering" },
  { id: 2, fullName: "Doe, Jane", departmentCode: "CBE", departmentName: "Business" },
  { id: 3, fullName: "No Department, Maria", departmentCode: null, departmentName: null },
];

describe("safe instructor name normalization", () => {
  it("ignores capitalization, extra spaces and comma spacing", () => {
    expect(facultyNameKey("  dela   cruz ,  juan p. ")).toBe("dela cruz, juan p.");
    expect(facultyNameKey("Dela Cruz, Juan P.")).toBe(facultyNameKey("dela cruz , juan p."));
  });

  it("does not reorder names or merge similar but different people", () => {
    expect(facultyNameKey("Juan Dela Cruz")).not.toBe(facultyNameKey("Dela Cruz, Juan P."));
    expect(nameSimilarity("Doe, Jane", "Doe, Janet")).toBeGreaterThan(0.8);
    expect(nameSimilarity("Doe, Jane", "Doe, Jane")).toBe(1);
  });
});

describe("instructor matching never guesses a department", () => {
  it("matches one exact roster row using normalized formatting", () => {
    const result = matchInstructor("  dela cruz,  juan p. ", roster);
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.faculty.id).toBe(1);
      expect(result.faculty.departmentCode).toBe("CET");
    }
  });

  it("reports an unknown instructor with suggestions only", () => {
    const result = matchInstructor("Doe, Jan", roster);
    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") {
      expect(result.similar.map((f) => f.id)).toContain(2);
    }
  });

  it("reports an ambiguous duplicate roster name instead of merging", () => {
    const result = matchInstructor("Doe, Jane", [
      ...roster,
      { id: 4, fullName: "DOE, JANE", departmentCode: "CET" },
    ]);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((f) => f.id).sort()).toEqual([2, 4]);
    }
  });

  it("treats TBA as unassigned, not as a faculty member", () => {
    expect(matchInstructor("TBA", roster).kind).toBe("tba");
    expect(matchInstructor("", roster).kind).toBe("tba");
  });
});

describe("department membership comes from the faculty roster", () => {
  it("includes a CET instructor teaching any program", () => {
    expect(slotBelongsToDepartment({ faculty: { departmentCode: "CET" } }, "CET")).toBe(true);
  });

  it("excludes a non-CET teacher of a BSIT subject from CET", () => {
    expect(slotBelongsToDepartment({ faculty: { departmentCode: "CBE" } }, "CET")).toBe(false);
  });

  it("does not guess for a slot without faculty", () => {
    expect(slotBelongsToDepartment({ faculty: null }, "CET")).toBe(false);
  });
});

describe("duplicate roster names are reported, never merged", () => {
  it("groups names that collapse to the same safe key", () => {
    const groups = findDuplicateFacultyRows([
      { id: 1, fullName: "Dela Cruz, Juan P.", departmentCode: "CET" },
      { id: 2, fullName: "  dela   cruz , juan p. ", departmentCode: null },
      { id: 3, fullName: "Doe, Jane", departmentCode: "CBE" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual([1, 2]);
    expect(groups[0].departmentCodes).toEqual(["CET", null]);
  });

  it("does not treat similar but differently ordered names as duplicates", () => {
    const groups = findDuplicateFacultyRows([
      { id: 1, fullName: "Dela Cruz, Juan P." },
      { id: 2, fullName: "Juan Dela Cruz" },
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("print signatures are scoped and clamped", () => {
  it("separates departments and terms", () => {
    const cet = attendanceSignatureScopeKey({
      department: "cet",
      schoolYear: "2026-2027",
      semester: "1st Semester",
    });
    const cbe = attendanceSignatureScopeKey({
      department: "CBE",
      schoolYear: "2026-2027",
      semester: "1st Semester",
    });
    expect(cet).not.toBe(cbe);
    expect(cet).toContain("CET");
  });

  it("normalizes a signature name", () => {
    expect(clampSignatureField("  Maria   Santos  ")).toBe("Maria Santos");
    expect(clampSignatureField("x".repeat(300))).toHaveLength(160);
  });
});
