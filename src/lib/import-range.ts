import { eachDate, formatISODate, parseISODate, weekday, WEEKDAY_SHORT } from "@/lib/dates";
import { attendanceGenerationGate, type AcademicPeriodRecord } from "@/lib/academic-period";
import {
  isImportRangeMode,
  type ImportRangeInput,
  type ImportRangeMode,
  type ResolvedImportRange,
} from "@/lib/import-range-shared";

export {
  IMPORT_RANGE_OPTIONS,
  isImportRangeMode,
  type ImportRangeInput,
  type ImportRangeMode,
  type ResolvedImportRange,
} from "@/lib/import-range-shared";

/**
 * Import range selection.
 *
 * Schedule slots in this system are recurring weekly meetings (weekday + clock
 * times), so an Excel file has no calendar dates to filter. The range selected
 * here is the calendar span those imported meetings apply to. It is stored on
 * the import batch and used to pre-create blank attendance rows for exactly
 * those dates. Older imports keep NULL dates and behave exactly as before.
 */

export type ImportRangeResult =
  | { ok: true; input: ImportRangeInput; resolved: ResolvedImportRange }
  | { ok: false; error: string };

/** Read the range fields from the import form. Custom ranges are validated here; the final
 *  check against the academic period happens in `resolveImportRange` on the server. */
export function parseImportRange(form: FormData): ImportRangeResult {
  const rawMode = String(form.get("rangeMode") ?? "semester").trim();
  const mode: ImportRangeMode = isImportRangeMode(rawMode) ? rawMode : "semester";
  const rawStart = String(form.get("startDate") ?? "").trim();
  const rawEnd = String(form.get("endDate") ?? "").trim();

  if (mode === "semester") {
    return {
      ok: true,
      input: { mode, startDate: rawStart || null, endDate: rawEnd || null },
      resolved: { mode, start: null, end: null, warning: null },
    };
  }

  if (!rawStart) {
    return { ok: false, error: "Start Date is required for a Custom Range." };
  }
  if (!rawEnd) {
    return { ok: false, error: "End Date is required for a Custom Range." };
  }
  const start = parseISODate(rawStart);
  const end = parseISODate(rawEnd);
  if (!start || !end) {
    return { ok: false, error: "Enter valid Start Date and End Date values (YYYY-MM-DD)." };
  }
  if (start > end) {
    return { ok: false, error: "End Date cannot be earlier than Start Date." };
  }
  return {
    ok: true,
    input: { mode, startDate: formatISODate(start), endDate: formatISODate(end) },
    resolved: { mode, start: null, end: null, warning: null },
  };
}

/** Resolve the effective calendar range against the selected academic period.
 *  A custom range can never bypass the configured semester boundaries: an
 *  out-of-semester or unconfigured period is rejected, not silently clamped. */
export function resolveImportRange(
  input: ImportRangeInput,
  period: AcademicPeriodRecord | null,
  termLabel: string,
): ImportRangeResult {
  if (input.mode === "semester") {
    if (period?.startDate && period.endDate) {
      return {
        ok: true,
        input,
        resolved: { mode: input.mode, start: period.startDate, end: period.endDate, warning: null },
      };
    }
    return {
      ok: true,
      input,
      resolved: {
        mode: input.mode,
        start: null,
        end: null,
        warning:
          "This semester has no reviewed start and end dates. Schedules will be imported, but no attendance rows can be pre-created until the semester dates are set on Settings.",
      },
    };
  }

  const start = parseISODate(input.startDate);
  const end = parseISODate(input.endDate);
  if (!start || !end) {
    return { ok: false, error: "Enter valid Start Date and End Date values (YYYY-MM-DD)." };
  }
  if (start > end) {
    return { ok: false, error: "End Date cannot be earlier than Start Date." };
  }
  if (!period) {
    return {
      ok: false,
      error: `${termLabel} is not a registered academic period. Register it with semester dates on Settings before importing a Custom Range.`,
    };
  }
  if (!period.startDate || !period.endDate) {
    return {
      ok: false,
      error: `${termLabel} has no reviewed semester dates. Set them on Settings before importing a Custom Range; the range cannot bypass the semester boundary.`,
    };
  }
  for (const date of [start, end]) {
    const gate = attendanceGenerationGate(period, date);
    if (!gate.ok) {
      return {
        ok: false,
        error: `The Custom Range ${formatISODate(start)} to ${formatISODate(end)} is outside the configured semester (${formatISODate(period.startDate)} to ${formatISODate(period.endDate)}). ${gate.message}`,
      };
    }
  }
  return {
    ok: true,
    input,
    resolved: { mode: input.mode, start, end, warning: null },
  };
}

/** One readable description used by preview, the commit dialog and the audit log. */
export function describeImportRange(range: ResolvedImportRange): string {
  if (range.start && range.end) {
    return `${range.mode === "custom" ? "Custom Range" : "Semester (default)"}: ${formatISODate(range.start)} to ${formatISODate(range.end)}`;
  }
  return "Semester (default): no reviewed semester dates (no attendance rows pre-created)";
}

/** Calendar dates in the range on a given weekday, used to plan attendance rows. */
export function datesForWeekday(range: ResolvedImportRange, targetWeekday: number): Date[] {
  if (!range.start || !range.end) return [];
  return eachDate(range.start, range.end).filter((date) => weekday(date) === targetWeekday);
}

/** A short preview of the days a range covers, for the import screen. */
export function describeRangeCoverage(range: ResolvedImportRange): string {
  if (!range.start || !range.end) return "No calendar dates available";
  const days = eachDate(range.start, range.end);
  const weekdayCounts = new Map<number, number>();
  for (const date of days) weekdayCounts.set(weekday(date), (weekdayCounts.get(weekday(date)) ?? 0) + 1);
  const parts = Array.from(weekdayCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([wd, count]) => `${WEEKDAY_SHORT[wd]} ×${count}`);
  return `${days.length} calendar day(s): ${parts.join(", ")}`;
}
