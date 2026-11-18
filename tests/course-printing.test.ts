import { describe, it, expect, vi } from "vitest";
import {
  getQualifiedFacultyIdsForCourse,
} from "@/lib/subject-classification";
import {
  buildProgramSheet,
  flattenPrintPages,
  reconcileProgramSheet,
  type SheetSlot,
} from "@/lib/attendance-sheet";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("Course-Based Faculty Attendance Printing (Rule A + Rule B)", () => {
  const slots: SheetSlot[] = [
    // Faculty 1: Teaches CC101 (Major) + GE401 (GE) in BSIT
    {
      id: 1,
      cn: "1001",
      subject: "CC101",
      start: "08:00",
      end: "09:00",
      roomCode: "CL1",
      facultyId: 1,
      facultyName: "Cruz, Juan",
      surname: "Cruz",
    },
    {
      id: 2,
      cn: "1002",
      subject: "GE401",
      start: "09:00",
      end: "10:00",
      roomCode: "RM101",
      facultyId: 1,
      facultyName: "Cruz, Juan",
      surname: "Cruz",
    },

    // Faculty 2: Teaches ONLY GE401 in BSIT
    {
      id: 3,
      cn: "1003",
      subject: "GE401",
      start: "10:00",
      end: "11:00",
      roomCode: "RM102",
      facultyId: 2,
      facultyName: "Santos, Maria",
      surname: "Santos",
    },

    // Faculty 3: Teaches ONLY NSTP1 in BSIT
    {
      id: 4,
      cn: "1004",
      subject: "NSTP1",
      start: "13:00",
      end: "14:00",
      roomCode: "GYM",
      facultyId: 3,
      facultyName: "Reyes, Pedro",
      surname: "Reyes",
    },

    // Faculty 4: Teaches ITE211 (Major) + GE101 (Purposive Communication) in BSIT
    {
      id: 5,
      cn: "1005",
      subject: "ITE211",
      start: "14:00",
      end: "15:00",
      roomCode: "CL2",
      facultyId: 4,
      facultyName: "Garcia, Ana",
      surname: "Garcia",
    },
    {
      id: 6,
      cn: "1006",
      subject: "GE101",
      start: "15:00",
      end: "16:00",
      roomCode: "RM103",
      facultyId: 4,
      facultyName: "Garcia, Ana",
      surname: "Garcia",
    },
  ];

  it("identifies major qualified instructors for BSIT", () => {
    const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT");

    // Faculty 1 (CC101 + GE401) qualifies
    expect(qualified.has(1)).toBe(true);

    // Faculty 2 (only GE401) does not automatically qualify
    expect(qualified.has(2)).toBe(false);

    // Faculty 3 (only NSTP1) does not automatically qualify
    expect(qualified.has(3)).toBe(false);

    // Faculty 4 (ITE211 + Purposive Comm) qualifies
    expect(qualified.has(4)).toBe(true);
  });

  it("builds the printable sheet with only qualified instructors by default", () => {
    const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT");
    const activeSlots = slots.filter((s) => s.facultyId != null && qualified.has(s.facultyId));

    const sheet = buildProgramSheet(activeSlots);

    // Only Faculty 1 and Faculty 4 should appear as columns
    expect(sheet.columns).toHaveLength(2);
    const facultyIdsOnSheet = sheet.columns.map((c) => c.facultyId);
    expect(facultyIdsOnSheet).toContain(1);
    expect(facultyIdsOnSheet).toContain(4);
    expect(facultyIdsOnSheet).not.toContain(2);
    expect(facultyIdsOnSheet).not.toContain(3);

    // Both CC101 and GE401 appear for Faculty 1 in their column
    const f1Column = sheet.columns.find((c) => c.facultyId === 1)!;
    expect(f1Column.cells.some((c) => typeof c === "object" && c.room === "CL1")).toBe(true);
    expect(f1Column.cells.some((c) => typeof c === "object" && c.room === "RM101")).toBe(true);

    // Sheet reconciles without errors
    const reconciliation = reconcileProgramSheet(activeSlots, sheet);
    expect(reconciliation.ok).toBe(true);
  });

  it("includes manually added GE faculty on the BSIT printing sheet", () => {
    const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT", {
      manuallyAddedFacultyIds: new Set([2]), // Faculty 2 manually added
    });

    const activeSlots = slots.filter((s) => s.facultyId != null && qualified.has(s.facultyId));
    const sheet = buildProgramSheet(activeSlots);

    expect(sheet.columns).toHaveLength(3);
    const facultyIdsOnSheet = sheet.columns.map((c) => c.facultyId);
    expect(facultyIdsOnSheet).toContain(1);
    expect(facultyIdsOnSheet).toContain(2); // Included via manual addition!
    expect(facultyIdsOnSheet).toContain(4);
    expect(facultyIdsOnSheet).not.toContain(3);
  });

  it("excludes manually removed major faculty from the BSIT printing sheet", () => {
    const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT", {
      excludedFacultyIds: new Set([1]), // Faculty 1 manually removed
    });

    const activeSlots = slots.filter((s) => s.facultyId != null && qualified.has(s.facultyId));
    const sheet = buildProgramSheet(activeSlots);

    expect(sheet.columns).toHaveLength(1);
    const facultyIdsOnSheet = sheet.columns.map((c) => c.facultyId);
    expect(facultyIdsOnSheet).not.toContain(1); // Excluded!
    expect(facultyIdsOnSheet).toContain(4);
  });

  it("supports adding a custom faculty member who has no schedule", () => {
    const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT", {
      manuallyAddedFacultyIds: new Set([99]), // Guest faculty with no schedule
    });

    const customPlaceholder: SheetSlot = {
      id: -99,
      cn: "CUSTOM",
      subject: "CUSTOM",
      start: "",
      end: "",
      roomCode: "",
      facultyId: 99,
      facultyName: "Guest, Special",
      surname: "Guest",
      isCustom: true,
    };

    const activeSlots = [
      ...slots.filter((s) => s.facultyId != null && qualified.has(s.facultyId)),
      customPlaceholder,
    ];

    const sheet = buildProgramSheet(activeSlots);
    expect(sheet.columns).toHaveLength(3);
    const guestCol = sheet.columns.find((c) => c.facultyId === 99);
    expect(guestCol).toBeDefined();
    // All cells for guest faculty should be empty
    expect(guestCol!.cells.every((c) => c === "empty")).toBe(true);
  });

  it("paginates multiple courses cleanly into 12-column pages", () => {
    const bsitGroup = slots.filter((s) => [1, 4].includes(s.facultyId!));
    const pages = flattenPrintPages([
      { slots: bsitGroup },
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].pageIndex).toBe(0);
    expect(pages[0].courseIndex).toBe(0);
  });
});
