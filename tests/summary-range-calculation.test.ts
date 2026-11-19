import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scheduleSlot: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
  },
}));

import { buildSummary } from "@/lib/summary";
import { prisma } from "@/lib/prisma";
import { resolveSummaryRange } from "@/lib/summary-range";
import { dateOnly, formatISODate } from "@/lib/dates";

// 2026-11-05, 12, 19 and 26 are Thursdays. One recurring 08:00–10:00 slot
// therefore schedules two hours on each of those dates.
const faculty = {
  id: 1,
  fullName: "Cruz, Ana",
  surname: "Cruz",
  department: { code: "CET", name: "College of Engineering and Technology" },
};
const course = { id: 10, code: "BSIT" };
const slot = {
  id: 100,
  weekday: 4,
  startTime: "08:00",
  endTime: "10:00",
  facultyId: faculty.id,
  courseId: course.id,
  faculty,
  course,
};

const attendanceRows = [
  // Outside every November range below; a leak would inflate the totals.
  { slotId: 100, date: dateOnly(2026, 10, 29), hourStart: "08:00", present: true, reason: null },
  { slotId: 100, date: dateOnly(2026, 11, 5), hourStart: "08:00", present: true, reason: null },
  { slotId: 100, date: dateOnly(2026, 11, 5), hourStart: "09:00", present: true, reason: null },
  { slotId: 100, date: dateOnly(2026, 11, 12), hourStart: "08:00", present: true, reason: null },
  {
    slotId: 100,
    date: dateOnly(2026, 11, 12),
    hourStart: "09:00",
    present: false,
    reason: "Sick leave",
  },
  { slotId: 100, date: dateOnly(2026, 11, 19), hourStart: "08:00", present: false, reason: null },
  { slotId: 100, date: dateOnly(2026, 11, 19), hourStart: "09:00", present: false, reason: null },
];

beforeEach(() => {
  vi.mocked(prisma.scheduleSlot.findMany).mockImplementation((async (args: any) => {
    const courseIds = args?.where?.courseId?.in as number[] | undefined;
    if (courseIds && !courseIds.includes(course.id)) return [];
    return [slot];
  }) as never);
  vi.mocked(prisma.holiday.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.attendance.findMany).mockImplementation((async (args: any) => {
    const from = args.where.date.gte as Date;
    const to = args.where.date.lte as Date;
    const courseIds = args.where.slot?.courseId?.in as number[] | undefined;
    if (courseIds && !courseIds.includes(course.id)) return [];
    return attendanceRows.filter((row) => row.date >= from && row.date <= to);
  }) as never);
});

async function summaryFor(params: Record<string, string>) {
  const resolved = resolveSummaryRange(params, dateOnly(2026, 11, 20));
  if (!resolved.ok) throw new Error(resolved.error);
  const summary = await buildSummary(resolved.range.start, resolved.range.end);
  return { range: resolved.range, summary };
}

describe("summary calculations follow the selected range", () => {
  it("keeps the default cutoff calculation for a bare URL", async () => {
    const { range, summary } = await summaryFor({});
    expect(formatISODate(range.start)).toBe("2026-11-16");
    expect(formatISODate(range.end)).toBe("2026-11-30");
    expect(summary.totals).toMatchObject({
      scheduledHours: 2,
      presentHours: 0,
      absentHours: 2,
      unencodedHours: 2,
    });
    expect(summary.faculty[0].daily.map((row) => row.date)).toEqual([
      "2026-11-19",
      "2026-11-26",
    ]);
  });

  it("recalculates the first cutoff from days 1–15", async () => {
    const { range, summary } = await summaryFor({ rangeMode: "first", month: "2026-11" });
    expect(formatISODate(range.start)).toBe("2026-11-01");
    expect(formatISODate(range.end)).toBe("2026-11-15");
    expect(summary.totals).toMatchObject({
      scheduledHours: 4,
      presentHours: 3,
      absentHours: 1,
      unencodedHours: 0,
    });
    expect(summary.faculty[0].reasons).toEqual([
      { date: "2026-11-12", course: "BSIT", reason: "Sick leave" },
    ]);
  });

  it("recalculates the second cutoff through the end of month", async () => {
    const { range, summary } = await summaryFor({ rangeMode: "second", month: "2026-11" });
    expect(formatISODate(range.start)).toBe("2026-11-16");
    expect(formatISODate(range.end)).toBe("2026-11-30");
    expect(summary.totals.absentHours).toBe(2);
    expect(summary.totals.unencodedHours).toBe(2);
  });

  it("recalculates every total for an inclusive custom range", async () => {
    const { range, summary } = await summaryFor({
      rangeMode: "custom",
      start: "2026-11-05",
      end: "2026-11-22",
    });
    expect(range.header).toBe("Attendance Summary: November 5–22, 2026");
    expect(summary.totals).toMatchObject({
      facultyCount: 1,
      scheduledHours: 6,
      presentHours: 3,
      absentHours: 3,
      unencodedHours: 0,
    });
    expect(summary.faculty[0].byProgram).toEqual([
      {
        course: "BSIT",
        scheduledHours: 6,
        presentHours: 3,
        absentHours: 3,
        unencodedHours: 0,
      },
    ]);
    expect(summary.faculty[0].daily.map((row) => row.date)).toEqual([
      "2026-11-05",
      "2026-11-12",
      "2026-11-19",
    ]);
  });

  it("applies faculty/department scopes together with a custom range", async () => {
    const resolved = resolveSummaryRange(
      { rangeMode: "custom", start: "2026-11-05", end: "2026-11-22" },
      dateOnly(2026, 11, 20),
    );
    if (!resolved.ok) throw new Error(resolved.error);

    const scoped = await buildSummary(resolved.range.start, resolved.range.end, [course.id], null, {
      departmentCode: "CET",
    });
    expect(scoped.faculty).toHaveLength(1);
    expect(scoped.totals.absentHours).toBe(3);

    const wrongProgram = await buildSummary(
      resolved.range.start,
      resolved.range.end,
      [999],
      null,
      { departmentCode: "CET" },
    );
    expect(wrongProgram.faculty).toHaveLength(0);
    expect(wrongProgram.totals.absentHours).toBe(0);
  });
});
