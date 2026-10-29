import { describe, it, expect } from "vitest";
import {
  attendanceGenerationGate,
  clampRangeToPeriod,
  periodContains,
  periodKey,
  periodRangeWarning,
  suggestedPeriodDates,
  validatePeriodInput,
} from "@/lib/academic-period";
import { dateOnly } from "@/lib/dates";

describe("academic period validation", () => {
  it("accepts a reviewed school year, semester and date range", () => {
    const check = validatePeriodInput({
      schoolYear: "2026-2027",
      semester: "First Semester",
      startDate: "2026-08-01",
      endDate: "2026-12-31",
      status: "ACTIVE",
    });
    expect(check.ok).toBe(true);
    expect(check.value?.schoolYear).toBe("2026-2027");
    expect(check.value?.semester).toBe("1st Semester");
    expect(check.value?.status).toBe("ACTIVE");
    expect(check.warnings).toHaveLength(0);
  });

  it("keeps missing dates as NULL instead of guessing boundaries", () => {
    const check = validatePeriodInput({
      schoolYear: "2025-2026",
      semester: "2nd Semester",
      startDate: "",
      endDate: "",
    });
    expect(check.ok).toBe(true);
    expect(check.value?.startDate).toBeNull();
    expect(check.value?.endDate).toBeNull();
    expect(check.warnings.join(" ")).toMatch(/No semester dates/);
  });

  it("rejects a reversed or too-short semester and one missing date", () => {
    const reversed = validatePeriodInput({
      schoolYear: "2026-2027",
      semester: "1st Semester",
      startDate: "2026-12-31",
      endDate: "2026-08-01",
    });
    expect(reversed.ok).toBe(false);

    const short = validatePeriodInput({
      schoolYear: "2026-2027",
      semester: "Summer",
      startDate: "2027-06-01",
      endDate: "2027-06-10",
    });
    expect(short.ok).toBe(false);

    const half = validatePeriodInput({
      schoolYear: "2026-2027",
      semester: "Summer",
      startDate: "2027-06-01",
      endDate: "",
    });
    expect(half.ok).toBe(false);
  });

  it("rejects an invalid school year and unknown status", () => {
    const check = validatePeriodInput({
      schoolYear: "2026",
      semester: "1st Semester",
      status: "CANCELLED",
    });
    expect(check.ok).toBe(false);
    expect(check.errors.join(" ")).toMatch(/School year/);
    expect(check.errors.join(" ")).toMatch(/status/);
  });
});

describe("period membership and range warnings", () => {
  const period = { startDate: dateOnly(2026, 8, 1), endDate: dateOnly(2026, 12, 31) };

  it("reports inside/outside/boundary membership", () => {
    expect(periodContains(period, dateOnly(2026, 8, 1))).toBe(true);
    expect(periodContains(period, dateOnly(2026, 12, 31))).toBe(true);
    expect(periodContains(period, dateOnly(2027, 1, 1))).toBe(false);
    expect(periodContains({ startDate: null, endDate: null }, dateOnly(2026, 9, 1))).toBeNull();
  });

  it("warns instead of silently falling back for unconfigured or out-of-range dates", () => {
    expect(periodRangeWarning(null, dateOnly(2026, 9, 1), dateOnly(2026, 9, 1))).toMatch(
      /not configured/,
    );
    expect(
      periodRangeWarning(
        { startDate: null, endDate: null },
        dateOnly(2026, 9, 1),
        dateOnly(2026, 9, 1),
      ),
    ).toMatch(/no semester dates/);
    expect(
      periodRangeWarning(period, dateOnly(2027, 1, 5), dateOnly(2027, 1, 5)),
    ).toMatch(/outside the configured semester/);
    expect(periodRangeWarning(period, dateOnly(2026, 9, 1), dateOnly(2026, 9, 2))).toBeNull();
  });
});

describe("period suggestions and keys", () => {
  it("suggests a starting point but does not persist it", () => {
    expect(suggestedPeriodDates("2026-2027", "1st Semester")).toEqual({
      start: "2026-08-01",
      end: "2026-12-31",
    });
    expect(suggestedPeriodDates("2026-2027", "2nd Semester")).toEqual({
      start: "2027-01-05",
      end: "2027-05-31",
    });
    expect(suggestedPeriodDates("2026-2027", "Summer")).toEqual({
      start: "2027-06-01",
      end: "2027-07-31",
    });
  });

  it("normalizes equivalent period keys", () => {
    expect(periodKey("2026 - 2027", "First Semester")).toBe("2026-2027|1st Semester");
    expect(periodKey("2026-2027", "1st Semester")).toBe("2026-2027|1st Semester");
  });
});

describe("generation gate", () => {
  const period = {
    startDate: dateOnly(2026, 8, 1),
    endDate: dateOnly(2026, 12, 31),
  };

  it("blocks generation when the term is not registered", () => {
    const gate = attendanceGenerationGate(null, dateOnly(2026, 9, 1));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("UNREGISTERED");
  });

  it("blocks generation when either semester date is missing", () => {
    const missingStart = attendanceGenerationGate(
      { startDate: null, endDate: dateOnly(2026, 12, 31) },
      dateOnly(2026, 9, 1),
    );
    const missingEnd = attendanceGenerationGate(
      { startDate: dateOnly(2026, 8, 1), endDate: null },
      dateOnly(2026, 9, 1),
    );
    expect(missingStart.ok).toBe(false);
    expect(missingEnd.ok).toBe(false);
    if (!missingStart.ok) expect(missingStart.code).toBe("DATES_NOT_CONFIGURED");
    if (!missingEnd.ok) expect(missingEnd.code).toBe("DATES_NOT_CONFIGURED");
  });

  it("accepts both boundary dates and every date between them", () => {
    expect(attendanceGenerationGate(period, dateOnly(2026, 8, 1)).ok).toBe(true);
    expect(attendanceGenerationGate(period, dateOnly(2026, 10, 15)).ok).toBe(true);
    expect(attendanceGenerationGate(period, dateOnly(2026, 12, 31)).ok).toBe(true);
  });

  it("blocks dates outside the configured semester instead of clamping them", () => {
    const before = attendanceGenerationGate(period, dateOnly(2026, 7, 31));
    const after = attendanceGenerationGate(period, dateOnly(2027, 1, 1));
    expect(before.ok).toBe(false);
    expect(after.ok).toBe(false);
    if (!before.ok) expect(before.code).toBe("OUTSIDE_PERIOD");
    if (!after.ok) expect(after.code).toBe("OUTSIDE_PERIOD");
  });
});

describe("print range clamping", () => {
  const period = {
    startDate: dateOnly(2026, 8, 1),
    endDate: dateOnly(2026, 12, 31),
  };

  it("clips a range to the semester and reports excluded days", () => {
    const clamped = clampRangeToPeriod(period, dateOnly(2026, 7, 28), dateOnly(2027, 1, 3));
    expect(clamped).not.toBeNull();
    expect(clamped!.start).toEqual(dateOnly(2026, 8, 1));
    expect(clamped!.end).toEqual(dateOnly(2026, 12, 31));
    expect(clamped!.excludedDays).toBe(4 + 3);
    expect(clamped!.reason).toMatch(/Only dates inside the configured semester/);
  });

  it("returns null when the requested range does not overlap the semester", () => {
    expect(
      clampRangeToPeriod(period, dateOnly(2026, 6, 1), dateOnly(2026, 7, 31)),
    ).toBeNull();
    expect(
      clampRangeToPeriod(period, dateOnly(2027, 1, 1), dateOnly(2027, 2, 1)),
    ).toBeNull();
  });

  it("leaves the range unchanged when the period has no dates", () => {
    const start = dateOnly(2026, 9, 1);
    const end = dateOnly(2026, 9, 30);
    expect(clampRangeToPeriod({ startDate: null, endDate: null }, start, end)).toEqual({
      start,
      end,
      excludedDays: 0,
      reason: null,
    });
  });
});
