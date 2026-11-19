// The official college/program structure for the CET-exclusive
// Faculty Attendance and Time Log System at Ramon Magsaysay Memorial Colleges.
//
// The system scope is strictly restricted to CET (College of Engineering and Technology).

export type CatalogCollegeCode = "CET";

export type CatalogProgram = {
  code: string;
  name: string;
  college: CatalogCollegeCode;
  official: boolean;
};

export const CET_COLLEGE_CODE: CatalogCollegeCode = "CET";
export const CET_COLLEGE_NAME = "College of Engineering and Technology";

export const COLLEGE_DEFS: { code: CatalogCollegeCode; name: string; sortOrder: number }[] = [
  { code: CET_COLLEGE_CODE, name: CET_COLLEGE_NAME, sortOrder: 10 },
];

export const PROGRAM_CATALOG: CatalogProgram[] = [
  // CET — College of Engineering and Technology official programs
  {
    code: "BSCE-SE",
    name: "Bachelor of Science in Civil Engineering",
    college: "CET",
    official: true,
  },
  {
    code: "BSCS",
    name: "Bachelor of Science in Computer Science",
    college: "CET",
    official: true,
  },
  {
    code: "BSIT",
    name: "Bachelor of Science in Information Technology",
    college: "CET",
    official: true,
  },
  {
    code: "BLIS",
    name: "Bachelor of Science in Library and Information Science",
    college: "CET",
    official: true,
  },
  {
    code: "ACT",
    name: "Associate in Computer Technology",
    college: "CET",
    official: true,
  },
];

// Course codes are compared without regard to case or repeated whitespace, so
// "bsit" and "BSIT" are the same program. The original
// value is still stored in Course.sourceCode for provenance.
export function normalizeCourseCode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const BY_CODE = new Map(PROGRAM_CATALOG.map((p) => [p.code, p]));

export function programForCode(raw: string | null | undefined): CatalogProgram | null {
  const code = normalizeCourseCode(raw);
  return code ? BY_CODE.get(code) ?? null : null;
}

export function isCetProgram(raw: string | null | undefined): boolean {
  return programForCode(raw) !== null;
}

export function collegeNameFor(code: string | null | undefined): string | null {
  if (!code) return null;
  return code.toUpperCase() === "CET" ? CET_COLLEGE_NAME : null;
}

export function programsForCollege(code: string): CatalogProgram[] {
  if (code.toUpperCase() === "CET") return PROGRAM_CATALOG;
  return [];
}

export const UNASSIGNED_COLLEGE_VALUE = "unassigned";
export const ALL_COLLEGES_VALUE = "";
