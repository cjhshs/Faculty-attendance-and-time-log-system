// The official college/program structure plus every program code found in the
// consolidated schedule workbook. This file is the single source used by the
// seed, the importer and the tests; the database holds the same catalog so an
// administrator can reassign a program without a code change.
//
// `official` = the program appears in the school's official program list.
// Programs with `college: null` are kept but flagged for administrator review —
// the workbook gives no reliable way to choose a college for them.

export type CatalogCollegeCode = "CET" | "COAHS" | "CBE" | "CTE" | "CCJ" | "CAS";

export type CatalogProgram = {
  code: string;
  name: string;
  college: CatalogCollegeCode | null;
  official: boolean;
};

export const COLLEGE_DEFS: { code: CatalogCollegeCode; name: string; sortOrder: number }[] = [
  { code: "CET", name: "College of Engineering and Technology", sortOrder: 10 },
  { code: "COAHS", name: "College of Allied Health Sciences", sortOrder: 20 },
  { code: "CBE", name: "College of Business Education", sortOrder: 30 },
  { code: "CTE", name: "College of Teacher Education", sortOrder: 40 },
  { code: "CCJ", name: "College of Criminal Justice", sortOrder: 50 },
  { code: "CAS", name: "College of Arts and Sciences", sortOrder: 60 },
];

export const PROGRAM_CATALOG: CatalogProgram[] = [
  // CET — College of Engineering and Technology
  { code: "BSCE-SE", name: "Bachelor of Science in Civil Engineering", college: "CET", official: true },
  { code: "BSCS", name: "Bachelor of Science in Computer Science", college: "CET", official: true },
  { code: "BSIT", name: "Bachelor of Science in Information Technology", college: "CET", official: true },
  {
    code: "BLIS",
    name: "Bachelor of Science in Library and Information Science",
    college: "CET",
    official: true,
  },
  { code: "ACT", name: "Associate in Computer Technology", college: "CET", official: true },

  // COAHS — College of Allied Health Sciences
  { code: "BSN", name: "Bachelor of Science in Nursing", college: "COAHS", official: true },
  { code: "BSM", name: "Bachelor of Science in Midwifery", college: "COAHS", official: true },
  { code: "BSP", name: "Bachelor of Science in Pharmacy", college: "COAHS", official: true },
  {
    code: "BSMT",
    name: "Bachelor of Science in Medical Laboratory Science",
    college: "COAHS",
    official: false,
  },
  {
    code: "BSRT",
    name: "Bachelor of Science in Radiologic Technology",
    college: "COAHS",
    official: false,
  },

  // CBE — College of Business Education
  {
    code: "BSTM",
    name: "Bachelor of Science in Tourism Management",
    college: "CBE",
    official: true,
  },
  {
    code: "BSHM",
    name: "Bachelor of Science in Hospitality Management",
    college: "CBE",
    official: true,
  },
  {
    code: "BSREM",
    name: "Bachelor of Science in Real Estate Management",
    college: "CBE",
    official: true,
  },
  {
    code: "BSOA",
    name: "Bachelor of Science in Office Administration",
    college: "CBE",
    official: true,
  },
  {
    code: "BSBA - FM",
    name: "Bachelor of Science in Business Administration major in Financial Management",
    college: "CBE",
    official: true,
  },
  {
    code: "BSBA - MM",
    name: "Bachelor of Science in Business Administration major in Marketing Management",
    college: "CBE",
    official: true,
  },
  {
    code: "BSBA - OM",
    name: "Bachelor of Science in Business Administration major in Operations Management",
    college: "CBE",
    official: true,
  },
  {
    code: "BSA",
    name: "Bachelor of Science in Accountancy",
    college: "CBE",
    official: false,
  },
  {
    code: "BSMA",
    name: "Bachelor of Science in Management Accounting",
    college: "CBE",
    official: false,
  },
  {
    code: "BSCA",
    name: "Bachelor of Science in Customs Administration",
    college: "CBE",
    official: false,
  },

  // CTE — College of Teacher Education
  {
    code: "BECED",
    name: "Bachelor of Early Childhood Education",
    college: "CTE",
    official: true,
  },
  {
    code: "BCAED",
    name: "Bachelor of Culture and the Arts Education",
    college: "CTE",
    official: true,
  },
  {
    code: "BEED",
    name: "Bachelor in Elementary Education",
    college: "CTE",
    official: true,
  },
  {
    code: "BPED",
    name: "Bachelor of Physical Education",
    college: "CTE",
    official: true,
  },
  {
    code: "BSED - ENGLISH",
    name: "Bachelor of Secondary Education major in English",
    college: "CTE",
    official: true,
  },
  {
    code: "BSED - MATHEMATICS",
    name: "Bachelor of Secondary Education major in Mathematics",
    college: "CTE",
    official: true,
  },
  {
    code: "BSED - SCIENCE",
    name: "Bachelor of Secondary Education major in Science",
    college: "CTE",
    official: true,
  },
  {
    code: "BSED - FILIPINO",
    name: "Bachelor of Secondary Education major in Filipino",
    college: "CTE",
    official: false,
  },
  {
    code: "BSED - SOCIAL STUDIES",
    name: "Bachelor of Secondary Education major in Social Studies",
    college: "CTE",
    official: false,
  },
  {
    code: "BTLED",
    name: "Bachelor of Technology and Livelihood Education",
    college: "CTE",
    official: false,
  },

  // CCJ — College of Criminal Justice
  { code: "BSCR", name: "Bachelor of Science in Criminology", college: "CCJ", official: true },

  // CAS — College of Arts and Sciences
  { code: "BACOM", name: "Bachelor of Arts in Communication", college: "CAS", official: true },
  { code: "BSSW", name: "Bachelor of Science in Social Work", college: "CAS", official: true },
  { code: "BSMATH", name: "Bachelor of Science in Mathematics", college: "CAS", official: true },
  {
    code: "BSES",
    name: "Bachelor of Science in Environmental Science",
    college: "CAS",
    official: true,
  },
  { code: "BSBIO", name: "Bachelor of Science in Biology", college: "CAS", official: false },

  // Found in the workbook, but no college can be chosen confidently. These stay
  // visible under "Unassigned programs" until an administrator assigns them.
  { code: "BAP", name: "Bachelor of Science in Psychology", college: null, official: false },
  { code: "BAEL", name: "Bachelor of Arts in English Language", college: null, official: false },
  { code: "BPEA", name: "Bachelor of Performing Arts", college: null, official: false },
  {
    code: "BSESS",
    name: "Bachelor of Science in Exercise and Sports Science",
    college: null,
    official: false,
  },
  { code: "BPA", name: "Bachelor of Science in Public Administration", college: null, official: false },
];

// Course codes are compared without regard to case or repeated whitespace, so
// "bsed -  english" and "BSED - English" are the same program. The original
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

export function collegeNameFor(code: string | null | undefined): string | null {
  if (!code) return null;
  return COLLEGE_DEFS.find((c) => c.code === code)?.name ?? null;
}

export function programsForCollege(code: string): CatalogProgram[] {
  return PROGRAM_CATALOG.filter((p) => p.college === code);
}

export const UNASSIGNED_COLLEGE_VALUE = "unassigned";
export const ALL_COLLEGES_VALUE = "";
