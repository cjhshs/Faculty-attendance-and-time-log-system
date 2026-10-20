import { describe, it, expect } from "vitest";
import { parseScheduleCell, resolveEndTime } from "@/lib/schedule-parser";

describe("parseScheduleCell — day tokens", () => {
  it("maps multi-day tokens and Thursday/Th correctly", () => {
    const { meetings, errors } = parseScheduleCell("Th/T 10:00 AM-11:00 AVR");
    expect(errors).toEqual([]);
    expect(meetings).toHaveLength(1);
    expect(meetings[0].weekdays).toEqual([2, 4]); // Tue, Thu
  });

  it("maps the full weekday set F/M/T/Th/W", () => {
    const { meetings } = parseScheduleCell("F/M/T/Th/W 09:00 AM-10:00 AVR");
    expect(meetings[0].weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects an unknown day token instead of guessing", () => {
    const { meetings, errors } = parseScheduleCell("X 10:00 AM-11:00 AVR");
    expect(meetings).toHaveLength(0);
    expect(errors[0].message).toContain("Unknown day token");
  });
});

describe("resolveEndTime — meridiem inference", () => {
  it("inherits the start meridiem when the end meridiem is omitted", () => {
    expect(resolveEndTime("13:00", "02:00", false)).toEqual({ end: "14:00" });
  });

  it("rolls the end forward 12 hours across noon", () => {
    expect(resolveEndTime("11:00", "01:00", false)).toEqual({ end: "13:00" });
  });

  it("flags a zero-length interval", () => {
    const result = resolveEndTime("06:00", "06:00", false);
    expect("error" in result).toBe(true);
  });

  it("flags an explicit end before the start", () => {
    const result = resolveEndTime("14:00", "01:00", true);
    expect("error" in result).toBe(true);
  });

  it("rejects an interval longer than 8 hours", () => {
    const result = resolveEndTime("06:00", "18:00", true);
    expect("error" in result).toBe(true);
  });
});

describe("parseScheduleCell — times", () => {
  it("flags the zero-length workbook row (06:00 AM-06:00)", () => {
    const { meetings, errors } = parseScheduleCell("F 06:00 AM-06:00 PC");
    expect(meetings).toHaveLength(0);
    expect(errors[0].message).toContain("after the start time");
  });

  it("flags the backwards workbook row (08:00 PM-08:00)", () => {
    const { meetings, errors } = parseScheduleCell("F/S 08:00 PM-08:00 TBA");
    expect(meetings).toHaveLength(0);
    expect(errors[0].message).toContain("after the start time");
  });

  it("accepts a valid 7-hour block", () => {
    const { meetings, errors } = parseScheduleCell("Sun 07:00 AM-02:00 AGM102 (CE LAB)");
    expect(errors).toEqual([]);
    expect(meetings[0].start).toBe("07:00");
    expect(meetings[0].end).toBe("14:00");
  });
});

describe("parseScheduleCell — rooms and modes", () => {
  it("prefers a physical room over ASYNC", () => {
    const { meetings } = parseScheduleCell("M 10:00 AM-11:00 ASYNC || M 10:00 AM-11:00 AVR");
    expect(meetings).toHaveLength(1);
    expect(meetings[0].roomCode).toBe("AVR");
    expect(meetings[0].roomType).toBe("PHYSICAL");
  });

  it("prefers OLC over ASYNC and marks it online", () => {
    const { meetings } = parseScheduleCell("M 10:00 AM-11:00 ASYNC || M 10:00 AM-11:00 OLC");
    expect(meetings[0].roomCode).toBe("OLC");
    expect(meetings[0].mode).toBe("ONLINE");
  });

  it("errors when only ASYNC is listed", () => {
    const { meetings, errors } = parseScheduleCell("M 10:00 AM-11:00 ASYNC");
    expect(meetings).toHaveLength(0);
    expect(errors[0].message).toContain("ASYNC");
  });

  it("keeps TBA and strips the (Lab) suffix", () => {
    const { meetings } = parseScheduleCell("W 01:00 PM-03:00 COM C (Lab)");
    expect(meetings[0].roomCode).toBe("COM C");
    expect(meetings[0].isLab).toBe(true);
    expect(meetings[0].mode).toBe("LAB");
  });

  it("collapses same-day same-time room variants into one meeting", () => {
    const { meetings } = parseScheduleCell("F/S 05:00 PM-08:00 COM B || F/S 05:00 PM-07:00 EMM303");
    // Different end times are different meetings.
    expect(meetings).toHaveLength(2);
  });
});
