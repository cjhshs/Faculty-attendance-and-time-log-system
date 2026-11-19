/**
 * Pure, client-safe parts of the Excel import range selection. Keep this file
 * free of database imports so the import screen can share the option values
 * and types with the server-side validator.
 */

export const IMPORT_RANGE_OPTIONS = [
  { value: "semester", label: "Semester (default)" },
  { value: "custom", label: "Custom Range" },
] as const;

export type ImportRangeMode = (typeof IMPORT_RANGE_OPTIONS)[number]["value"];

export type ImportRangeInput = {
  mode: ImportRangeMode;
  startDate: string | null;
  endDate: string | null;
};

export type ResolvedImportRange = {
  mode: ImportRangeMode;
  /** NULL means no reviewed calendar range is available for this import. */
  start: Date | null;
  end: Date | null;
  warning: string | null;
};

export function isImportRangeMode(value: string): value is ImportRangeMode {
  return value === "semester" || value === "custom";
}
