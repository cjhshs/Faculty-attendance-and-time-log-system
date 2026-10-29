import { describe, it, expect } from "vitest";
import {
  classifyDay,
  countAttendanceStatuses,
  draftHasChanges,
  mergeDraftWithOfficial,
  presentFromStatus,
  statusFromPresent,
  validateAttendanceReason,
  type AttendanceDraftPayload,
} from "@/lib/attendance-status";
import { attendanceDraftScopeKey, parseDraftPayload } from "@/lib/attendance-draft";

describe("attendance is tri-state", () => {
  it("treats NULL and a missing row as not encoded", () => {
    expect(statusFromPresent(null)).toBe("unset");
    expect(statusFromPresent(undefined)).toBe("unset");
    expect(statusFromPresent(true)).toBe("present");
    expect(statusFromPresent(false)).toBe("absent");
  });

  it("maps unset back to NULL, never false", () => {
    expect(presentFromStatus("unset")).toBeNull();
    expect(presentFromStatus("present")).toBe(true);
    expect(presentFromStatus("absent")).toBe(false);
  });

  it("does not count unencoded values as present or absent", () => {
    const counts = countAttendanceStatuses([true, false, null, undefined, true]);
    expect(counts).toEqual({ present: 2, absent: 1, unencoded: 2, total: 5 });
    expect(classifyDay({ present: 0, absent: 0, unencoded: 3, total: 3 })).toBe("unencoded");
  });

  it("classifies a fully unencoded day as neither present nor absent", () => {
    expect(classifyDay(countAttendanceStatuses([null, null]))).toBe("unencoded");
    expect(classifyDay(countAttendanceStatuses([true, true]))).toBe("present");
    expect(classifyDay(countAttendanceStatuses([false, false]))).toBe("absent");
    expect(classifyDay(countAttendanceStatuses([true, false]))).toBe("partial");
  });
});

describe("absence reasons", () => {
  it("requires a reason only for an explicit absence", () => {
    expect(validateAttendanceReason("absent", "").ok).toBe(false);
    expect(validateAttendanceReason("absent", "Sick leave").ok).toBe(true);
    expect(validateAttendanceReason("present", "").ok).toBe(true);
    expect(validateAttendanceReason("unset", "").ok).toBe(true);
  });

  it("trims and caps the stored reason", () => {
    const result = validateAttendanceReason("absent", "  Medical appointment  ");
    expect(result).toEqual({ ok: true, reason: "Medical appointment" });
    expect(validateAttendanceReason("absent", "x".repeat(501)).ok).toBe(false);
  });
});

describe("draft restoration never overwrites official attendance", () => {
  const official = {
    "1|08:00": { status: "present" as const, reason: "", roomOverride: "" },
    "2|08:00": { status: "unset" as const, reason: "", roomOverride: "" },
  };

  it("keeps an official present status over a stale draft absence", () => {
    const draft: AttendanceDraftPayload = {
      cells: {
        "1|08:00": { status: "absent", reason: "stale", roomOverride: "" },
        "2|08:00": { status: "absent", reason: "Draft reason", roomOverride: "" },
      },
    };
    const merged = mergeDraftWithOfficial(official, draft);
    expect(merged["1|08:00"].status).toBe("present");
    expect(merged["2|08:00"].status).toBe("absent");
    expect(merged["2|08:00"].reason).toBe("Draft reason");
  });

  it("does not create official rows from a draft", () => {
    const draft: AttendanceDraftPayload = {
      cells: { "3|09:00": { status: "present", reason: "", roomOverride: "" } },
    };
    const merged = mergeDraftWithOfficial({ "1|08:00": official["1|08:00"] }, draft);
    expect(Object.keys(merged).sort()).toEqual(["1|08:00", "3|09:00"]);
  });

  it("recognizes a draft with actual work", () => {
    expect(draftHasChanges(null)).toBe(false);
    expect(
      draftHasChanges({ cells: { a: { status: "unset", reason: "", roomOverride: "" } } }),
    ).toBe(false);
    expect(
      draftHasChanges({ cells: { a: { status: "present", reason: "", roomOverride: "" } } }),
    ).toBe(true);
  });
});

describe("draft payload validation", () => {
  it("scopes drafts by department, date and term", () => {
    expect(
      attendanceDraftScopeKey({
        department: "cet",
        date: "2026-10-27",
        schoolYear: "2026-2027",
        semester: "1st Semester",
      }),
    ).toBe("encode:CET:2026-10-27:2026-2027:1st Semester");
  });

  it("rejects a payload that is not a cell map", () => {
    expect(parseDraftPayload(null)).toBeNull();
    expect(parseDraftPayload({ cells: "nope" })).toBeNull();
  });

  it("sanitizes unknown statuses to unset and caps strings", () => {
    const parsed = parseDraftPayload({
      version: 4,
      cells: {
        a: { status: "maybe", reason: "x".repeat(700), roomOverride: "R".repeat(200) },
      },
    });
    expect(parsed?.version).toBe(4);
    expect(parsed?.cells.a.status).toBe("unset");
    expect(parsed?.cells.a.reason).toHaveLength(500);
    expect(parsed?.cells.a.roomOverride).toHaveLength(120);
  });
});
