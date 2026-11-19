import { describe, it, expect } from "vitest";
import {
  defaultSummaryRangeMode,
  firstCutoffRange,
  formatSummaryMonth,
  formatSummaryRangeHeader,
  isSummaryRangeMode,
  resolveSummaryRange,
} from "@/lib/summary-range";
import { dateOnly, formatISODate } from "@/lib/dates";

const NOV_20 = dateOnly(2026, 11, 20);
const NOV_5 = dateOnly(2026, 11, 5);

describe("summary range modes", () => {
  it("recognizes only the three supported modes", () => {
    expect(isSummaryRangeMode("first")).toBe(true);
    expect(isSummaryRangeMode("second")).toBe(true);
    expect(isSummaryRangeMode("custom")).toBe(true);
    expect(isSummaryRangeMode("semester")).toBe(false);
  });

  it("keeps today's cutoff as the default mode", () => {
    expect(defaultSummaryRangeMode(dateOnly(2026, 11, 5))).toBe("first");
    expect(defaultSummaryRangeMode(dateOnly(2026, 11, 15))).toBe("first");
    expect(defaultSummaryRangeMode(dateOnly(2026, 11, 16))).toBe("second");
    expect(defaultSummaryRangeMode(NOV_20)).toBe("second");
  });

  it("formats the month value used by the picker", () => {
    expect(formatSummaryMonth(dateOnly(2026, 1, 9))).toBe("2026-01");
    expect(formatSummaryMonth(dateOnly(2026, 12, 31))).toBe("2026-12");
  });
});

describe("cutoff presets", () => {
  it("resolves the first cutoff as days 1–15 of the selected month", () => {
    const range = firstCutoffRange("2026-02");
    expect(range).not.toBeNull();
    expect(formatISODate(range!.start)).toBe("2026-02-01");
    expect(formatISODate(range!.end)).toBe("2026-02-15");
  });

  it("resolves the second cutoff through the last day of the month, including leap years", () => {
    const leap = firstCutoffRange("2024-02");
    expect(leap).not.toBeNull();
    const second = resolveSummaryRange({ rangeMode: "second", month: "2024-02" }, NOV_20);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(formatISODate(second.range.start)).toBe("2024-02-16");
    expect(formatISODate(second.range.end)).toBe("2024-02-29");

    const normal = resolveSummaryRange({ rangeMode: "second", month: "2026-02" }, NOV_20);
    expect(normal.ok).toBe(true);
    if (!normal.ok) return;
    expect(formatISODate(normal.range.end)).toBe("2026-02-28");
  });

  it("rejects an invalid selected month", () => {
    const result = resolveSummaryRange({ rangeMode: "first", month: "2026-13" }, NOV_20);
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.error).toMatch(/valid month/);
  });
});

describe("resolveSummaryRange", () => {
  it("uses the existing 15-day cutoff for a bare URL", () => {
    const result = resolveSummaryRange({}, NOV_20);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.mode).toBe("second");
    expect(result.range.month).toBe("2026-11");
    expect(formatISODate(result.range.start)).toBe("2026-11-16");
    expect(formatISODate(result.range.end)).toBe("2026-11-30");
    expect(result.range.header).toBe("Attendance Summary: November 16–30, 2026");
  });

  it("uses the first cutoff for a bare URL in the first half of the month", () => {
    const result = resolveSummaryRange({}, dateOnly(2026, 11, 5));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.mode).toBe("first");
    expect(formatISODate(result.range.start)).toBe("2026-11-01");
    expect(formatISODate(result.range.end)).toBe("2026-11-15");
  });

  it("recomputes preset dates and ignores stale start/end parameters", () => {
    const result = resolveSummaryRange(
      {
        rangeMode: "first",
        month: "2026-11",
        start: "2020-01-01",
        end: "2020-12-31",
      },
      NOV_20,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatISODate(result.range.start)).toBe("2026-11-01");
    expect(formatISODate(result.range.end)).toBe("2026-11-15");
  });

  it("resolves an inclusive custom range", () => {
    const result = resolveSummaryRange(
      { rangeMode: "custom", start: "2026-11-05", end: "2026-11-22" },
      NOV_20,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.mode).toBe("custom");
    expect(formatISODate(result.range.start)).toBe("2026-11-05");
    expect(formatISODate(result.range.end)).toBe("2026-11-22");
    expect(result.range.header).toBe("Attendance Summary: November 5–22, 2026");
  });

  it("treats legacy start/end links as a custom range", () => {
    const result = resolveSummaryRange({ start: "2026-11-05", end: "2026-11-22" }, NOV_20);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.mode).toBe("custom");
  });

  it("accepts a one-day custom range", () => {
    const result = resolveSummaryRange(
      { rangeMode: "custom", start: "2026-11-19", end: "2026-11-19" },
      NOV_20,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.header).toBe("Attendance Summary: November 19, 2026");
  });

  it("requires both custom dates", () => {
    const missingStart = resolveSummaryRange(
      { rangeMode: "custom", end: "2026-11-22" },
      NOV_20,
    );
    const missingEnd = resolveSummaryRange(
      { rangeMode: "custom", start: "2026-11-05" },
      NOV_20,
    );
    expect(missingStart).toMatchObject({ ok: false });
    expect(missingEnd).toMatchObject({ ok: false });
    if (missingStart.ok || missingEnd.ok) return;
    expect(missingStart.error).toMatch(/Start Date is required/);
    expect(missingEnd.error).toMatch(/End Date is required/);
  });

  it("rejects reversed and malformed custom dates", () => {
    const reversed = resolveSummaryRange(
      { rangeMode: "custom", start: "2026-11-22", end: "2026-11-05" },
      NOV_20,
    );
    const malformed = resolveSummaryRange(
      { rangeMode: "custom", start: "not-a-date", end: "2026-11-22" },
      NOV_20,
    );
    const rolledOver = resolveSummaryRange(
      { rangeMode: "custom", start: "2026-02-30", end: "2026-03-05" },
      NOV_20,
    );
    expect(reversed).toMatchObject({ ok: false });
    expect(malformed).toMatchObject({ ok: false });
    expect(rolledOver).toMatchObject({ ok: false });
    if (reversed.ok || malformed.ok || rolledOver.ok) return;
    expect(reversed.error).toMatch(/End Date cannot be earlier/);
  });

  it("rejects an unsupported mode and an oversized range", () => {
    const badMode = resolveSummaryRange({ rangeMode: "semester" }, NOV_20);
    const tooLarge = resolveSummaryRange(
      { rangeMode: "custom", start: "2025-01-01", end: "2026-12-31" },
      NOV_20,
    );
    expect(badMode).toMatchObject({ ok: false });
    expect(tooLarge).toMatchObject({ ok: false });
    if (tooLarge.ok) return;
    expect(tooLarge.error).toMatch(/too large/);
  });
});

describe("formatSummaryRangeHeader", () => {
  it("uses an en dash for dates in the same month", () => {
    expect(formatSummaryRangeHeader(NOV_5, dateOnly(2026, 11, 22))).toBe(
      "Attendance Summary: November 5–22, 2026",
    );
  });

  it("names both months when a custom range crosses a month", () => {
    expect(formatSummaryRangeHeader(dateOnly(2026, 11, 30), dateOnly(2026, 12, 5))).toBe(
      "Attendance Summary: November 30 – December 5, 2026",
    );
  });

  it("names both years when a custom range crosses a year", () => {
    expect(formatSummaryRangeHeader(dateOnly(2026, 12, 30), dateOnly(2027, 1, 2))).toBe(
      "Attendance Summary: December 30, 2026 – January 2, 2027",
    );
  });
});
