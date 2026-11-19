import { describe, it, expect } from "vitest";
import {
  parseImportRange,
  resolveImportRange,
  describeImportRange,
  datesForWeekday,
  describeRangeCoverage,
} from "@/lib/import-range";
import { dateOnly, formatISODate } from "@/lib/dates";
import type { AcademicPeriodRecord } from "@/lib/academic-period";

function form(fields: Record<string, string>): FormData {
  return { get: (key: string) => fields[key] ?? null } as unknown as FormData;
}

const period: AcademicPeriodRecord = {
  schoolYear: "2026-2027",
  semester: "1st Semester",
  startDate: dateOnly(2026, 10, 27),
  endDate: dateOnly(2026, 11, 27),
  status: "ACTIVE",
  configured: true,
};

const TERM = "2026-2027 · 1st Semester";

describe("parseImportRange — form parsing and basic validation", () => {
  it("defaults to the semester range when no fields are present", () => {
    const r = parseImportRange(form({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.mode).toBe("semester");
    expect(r.input.startDate).toBeNull();
  });

  it("accepts a valid custom range", () => {
    const r = parseImportRange(
      form({ rangeMode: "custom", startDate: "2026-11-01", endDate: "2026-11-30" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      mode: "custom",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
  });

  it("rejects a missing start date", () => {
    const r = parseImportRange(form({ rangeMode: "custom", endDate: "2026-11-30" }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/Start Date is required/);
  });

  it("rejects a missing end date", () => {
    const r = parseImportRange(form({ rangeMode: "custom", startDate: "2026-11-01" }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/End Date is required/);
  });

  it("rejects an end date earlier than the start date", () => {
    const r = parseImportRange(
      form({ rangeMode: "custom", startDate: "2026-11-20", endDate: "2026-11-19" }),
    );
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/End Date cannot be earlier/);
  });

  it("accepts a one-day range where both dates match", () => {
    const r = parseImportRange(
      form({ rangeMode: "custom", startDate: "2026-11-19", endDate: "2026-11-19" }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a malformed date string", () => {
    const r = parseImportRange(
      form({ rangeMode: "custom", startDate: "not-a-date", endDate: "2026-11-30" }),
    );
    expect(r).toMatchObject({ ok: false });
  });
});

describe("resolveImportRange — academic-period enforcement", () => {
  it("resolves the semester default to the configured semester dates", () => {
    const r = resolveImportRange(
      { mode: "semester", startDate: null, endDate: null },
      period,
      TERM,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatISODate(r.resolved.start!)).toBe("2026-10-27");
    expect(formatISODate(r.resolved.end!)).toBe("2026-11-27");
    expect(r.resolved.warning).toBeNull();
  });

  it("warns instead of guessing when the semester has no reviewed dates", () => {
    const r = resolveImportRange(
      { mode: "semester", startDate: null, endDate: null },
      { ...period, startDate: null, endDate: null },
      TERM,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolved.start).toBeNull();
    expect(r.resolved.warning).toMatch(/no reviewed start and end dates/);
  });

  it("resolves a custom range fully inside the semester", () => {
    const r = resolveImportRange(
      { mode: "custom", startDate: "2026-11-01", endDate: "2026-11-15" },
      period,
      TERM,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatISODate(r.resolved.start!)).toBe("2026-11-01");
    expect(formatISODate(r.resolved.end!)).toBe("2026-11-15");
  });

  it("accepts a one-day custom range inside the semester", () => {
    const r = resolveImportRange(
      { mode: "custom", startDate: "2026-11-19", endDate: "2026-11-19" },
      period,
      TERM,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a custom range that starts before the semester", () => {
    const r = resolveImportRange(
      { mode: "custom", startDate: "2026-10-01", endDate: "2026-11-15" },
      period,
      TERM,
    );
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/outside the configured semester/);
  });

  it("rejects a custom range that ends after the semester", () => {
    const r = resolveImportRange(
      { mode: "custom", startDate: "2026-11-01", endDate: "2026-12-15" },
      period,
      TERM,
    );
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/outside the configured semester/);
  });

  it("rejects a custom range for an unregistered period", () => {
    const r = resolveImportRange(
      { mode: "custom", startDate: "2026-11-01", endDate: "2026-11-15" },
      null,
      TERM,
    );
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/not a registered academic period/);
  });

  it("rejects a custom range when the semester dates are unconfigured", () => {
    const r = resolveImportRange(
      { mode: "custom", startDate: "2026-11-01", endDate: "2026-11-15" },
      { ...period, startDate: null, endDate: null },
      TERM,
    );
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/no reviewed semester dates/);
  });
});

describe("range helpers", () => {
  it("describes a custom range", () => {
    const range = {
      mode: "custom" as const,
      start: dateOnly(2026, 11, 1),
      end: dateOnly(2026, 11, 30),
      warning: null,
    };
    expect(describeImportRange(range)).toBe("Custom Range: 2026-11-01 to 2026-11-30");
    expect(describeRangeCoverage(range)).toMatch(/30 calendar day/);
  });

  it("lists only the dates matching a weekday", () => {
    const range = {
      mode: "custom" as const,
      start: dateOnly(2026, 11, 16),
      end: dateOnly(2026, 11, 22),
      warning: null,
    };
    const mondays = datesForWeekday(range, 1);
    expect(mondays.map(formatISODate)).toEqual(["2026-11-16"]);
  });
});
