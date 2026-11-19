import {
  dateOnly,
  daysBetweenInclusive,
  formatISODate,
  parseISODate,
  todayUtc,
} from "@/lib/dates";

/**
 * Pure, client-safe range selection for the Attendance Summary.
 *
 * Calendar dates in this system are UTC-midnight Date values. This module only
 * resolves which dates a report covers; the existing `buildSummary(start, end,
 * ...)` remains the single calculation engine for display, print and Excel.
 */

export const SUMMARY_RANGE_MODES = [
  { value: "first", label: "First Cutoff (1–15)" },
  { value: "second", label: "Second Cutoff (16–End of Month)" },
  { value: "custom", label: "Custom Range" },
] as const;

export type SummaryRangeMode = (typeof SUMMARY_RANGE_MODES)[number]["value"];

export type SummaryRangeSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export type ResolvedSummaryRange = {
  mode: SummaryRangeMode;
  /** YYYY-MM used by the cutoff presets. */
  month: string;
  start: Date;
  end: Date;
  /** Exact report header, e.g. "Attendance Summary: November 5–22, 2026". */
  header: string;
};

export type SummaryRangeResult =
  | { ok: true; range: ResolvedSummaryRange }
  | { ok: false; error: string };

const MAX_RANGE_DAYS = 366;
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

function readParam(source: SummaryRangeSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const value = source[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isSummaryRangeMode(value: string): value is SummaryRangeMode {
  return SUMMARY_RANGE_MODES.some((option) => option.value === value);
}

export function defaultSummaryRangeMode(reference: Date = todayUtc()): SummaryRangeMode {
  return reference.getUTCDate() <= 15 ? "first" : "second";
}

export function formatSummaryMonth(reference: Date): string {
  const month = String(reference.getUTCMonth() + 1).padStart(2, "0");
  return `${reference.getUTCFullYear()}-${month}`;
}

function parseSummaryMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Strict ISO date parsing: rejects dates that JS would silently roll over. */
function parseStrictISODate(value: string): Date | null {
  const trimmed = value.trim();
  const parsed = parseISODate(trimmed);
  if (!parsed || formatISODate(parsed) !== trimmed) return null;
  return parsed;
}

export function firstCutoffRange(month: string): { start: Date; end: Date } | null {
  const parsed = parseSummaryMonth(month);
  if (!parsed) return null;
  return {
    start: dateOnly(parsed.year, parsed.month, 1),
    end: dateOnly(parsed.year, parsed.month, 15),
  };
}

export function secondCutoffRange(month: string): { start: Date; end: Date } | null {
  const parsed = parseSummaryMonth(month);
  if (!parsed) return null;
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return {
    start: dateOnly(parsed.year, parsed.month, 16),
    end: dateOnly(parsed.year, parsed.month, lastDay),
  };
}

function monthName(date: Date): string {
  return MONTH_FORMATTER.format(date);
}

export function formatSummaryRangeHeader(start: Date, end: Date): string {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  if (sameMonth) {
    if (startDay === endDay) {
      return `Attendance Summary: ${monthName(start)} ${startDay}, ${start.getUTCFullYear()}`;
    }
    return `Attendance Summary: ${monthName(start)} ${startDay}–${endDay}, ${start.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `Attendance Summary: ${monthName(start)} ${startDay} – ${monthName(end)} ${endDay}, ${start.getUTCFullYear()}`;
  }
  return `Attendance Summary: ${monthName(start)} ${startDay}, ${start.getUTCFullYear()} – ${monthName(end)} ${endDay}, ${end.getUTCFullYear()}`;
}

function buildResult(
  mode: SummaryRangeMode,
  month: string,
  start: Date,
  end: Date,
): SummaryRangeResult {
  if (daysBetweenInclusive(start, end) > MAX_RANGE_DAYS) {
    return { ok: false, error: `Date range is too large. Choose ${MAX_RANGE_DAYS} days or fewer.` };
  }
  return {
    ok: true,
    range: { mode, month, start, end, header: formatSummaryRangeHeader(start, end) },
  };
}

/**
 * Resolve the report dates from URL/form parameters. Explicit legacy start/end
 * links are treated as a Custom Range, but a bare URL always keeps the existing
 * 15-day cutoff containing today.
 */
export function resolveSummaryRange(
  source: SummaryRangeSource,
  reference: Date = todayUtc(),
): SummaryRangeResult {
  const rawMode = (readParam(source, "rangeMode") ?? "").trim();
  const rawMonth = (readParam(source, "month") ?? "").trim();
  const rawStart = (readParam(source, "start") ?? "").trim();
  const rawEnd = (readParam(source, "end") ?? "").trim();
  const fallbackMonth = formatSummaryMonth(reference);

  let mode: SummaryRangeMode;
  if (!rawMode) {
    mode = rawStart || rawEnd ? "custom" : defaultSummaryRangeMode(reference);
  } else if (!isSummaryRangeMode(rawMode)) {
    return { ok: false, error: "The requested date range mode is not supported." };
  } else {
    mode = rawMode;
  }

  if (mode === "custom") {
    if (!rawStart) return { ok: false, error: "Start Date is required for a Custom Range." };
    if (!rawEnd) return { ok: false, error: "End Date is required for a Custom Range." };
    const start = parseStrictISODate(rawStart);
    const end = parseStrictISODate(rawEnd);
    if (!start || !end) {
      return { ok: false, error: "Enter valid Start Date and End Date values." };
    }
    if (start > end) {
      return { ok: false, error: "End Date cannot be earlier than Start Date." };
    }
    return buildResult(mode, rawMonth || fallbackMonth, start, end);
  }

  const month = rawMonth || fallbackMonth;
  const cutoff = mode === "first" ? firstCutoffRange(month) : secondCutoffRange(month);
  if (!cutoff) return { ok: false, error: "Select a valid month for the cutoff period." };
  return buildResult(mode, month, cutoff.start, cutoff.end);
}
