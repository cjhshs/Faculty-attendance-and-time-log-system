import { describe, it, expect } from "vitest";
import {
  describeDuplicateImport,
  importChecksum,
  isDuplicateImport,
} from "@/lib/import-checksum";

const target = { schoolYear: "2026-2027", semester: "1st Semester" };

describe("import checksum", () => {
  it("is stable for identical bytes and differs for different bytes", () => {
    const a = importChecksum(Buffer.from("schedule-a"));
    const b = importChecksum(Buffer.from("schedule-a"));
    const c = importChecksum(Buffer.from("schedule-b"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("recognises a duplicate only in the same academic period", () => {
    const checksum = importChecksum(Buffer.from("schedule"));
    expect(isDuplicateImport({ ...target, checksum }, target, checksum)).toBe(true);
    expect(
      isDuplicateImport(
        { schoolYear: "2025-2026", semester: "1st Semester", checksum },
        target,
        checksum,
      ),
    ).toBe(false);
    expect(
      isDuplicateImport(
        { schoolYear: "2026-2027", semester: "2nd Semester", checksum },
        target,
        checksum,
      ),
    ).toBe(false);
    expect(isDuplicateImport({ ...target, checksum: null }, target, checksum)).toBe(false);
  });

  it("does not treat a reformatted workbook as the exact same file", () => {
    const checksum = importChecksum(Buffer.from("schedule"));
    const other = importChecksum(Buffer.from("schedule "));
    expect(isDuplicateImport({ ...target, checksum }, target, other)).toBe(false);
  });

  it("describes the prior import without implying replacement", () => {
    const message = describeDuplicateImport({
      id: 7,
      filename: "schedule.xlsx",
      schoolYear: "2026-2027",
      semester: "1st Semester",
      slotCount: 42,
      checksum: "abc",
      createdAt: "2026-10-27T08:30:00.000Z",
    });
    expect(message).toContain("2026-2027");
    expect(message).toContain("1st Semester");
    expect(message).toContain("batch #7");
    expect(message).toContain("42 slots");
    expect(message).toContain("nothing is deleted");
  });
});
