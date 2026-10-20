// Canonical display names for the college's programs. A program row is created
// during a schedule import, where the Excel file only carries the short code
// (BSIT, BSCS …), so the name has to come from here. Keeping the map in one
// place means the import, the master list and a fresh seed all agree.

const PROGRAM_NAMES: Record<string, string> = {
  ACT: "Associate in Computer Technology",
  BLIS: "Bachelor of Science in Library and Information Science",
  BSCE: "Bachelor of Science in Computer Engineering",
  "BSCE-SE": "Bachelor of Science in Computer Engineering - Software Engineering",
  BSCS: "Bachelor of Science in Computer Science",
  BSIT: "Bachelor of Science in Information Technology",
  BSIS: "Bachelor of Science in Information Systems",
};

// The code as written in the workbook, ignoring case and spacing.
export function programNameFor(code: string): string | null {
  const key = code.trim().toUpperCase();
  return PROGRAM_NAMES[key] ?? null;
}
