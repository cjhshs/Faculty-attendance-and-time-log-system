import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const WORKBOOK_PATH = fileURLToPath(
  new URL("./fixtures/attendance_to_import.xlsx", import.meta.url),
);

export function workbookBuffer(): Buffer {
  return readFileSync(WORKBOOK_PATH);
}

// The consolidated multi-department workbook (41 program codes, 1985 rows).
export const ALL_PROGRAMS_WORKBOOK_PATH = fileURLToPath(
  new URL("./fixtures/all-programs.xlsx", import.meta.url),
);

export function allProgramsBuffer(): Buffer {
  return readFileSync(ALL_PROGRAMS_WORKBOOK_PATH);
}
