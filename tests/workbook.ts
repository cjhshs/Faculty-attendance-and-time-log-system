import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const WORKBOOK_PATH = fileURLToPath(
  new URL("./fixtures/attendance_to_import.xlsx", import.meta.url),
);

export function workbookBuffer(): Buffer {
  return readFileSync(WORKBOOK_PATH);
}
