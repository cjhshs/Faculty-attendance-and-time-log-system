import { describe, it, expect, vi } from "vitest";
import { buildProgramSheet, reconcileProgramSheet, type SheetSlot } from "@/lib/attendance-sheet";
import { readRows, planFromRows, type PlannedSlot } from "@/lib/import";
import { workbookBuffer } from "./workbook";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const TARGET = { schoolYear: "2026-2027", semester: "1st Semester" };

const { rows, worksheetRows, missingColumns } = readRows(workbookBuffer());
const plan = planFromRows(rows, {
  faculty: [],
  courses: [],
  rooms: [],
  existingSlots: [],
  target: TARGET,
  worksheetRows,
  missingColumns,
});

let seq = 0;
const facultyIds = new Map<string, number>();
function facultyIdOf(name: string): number {
  if (!facultyIds.has(name)) facultyIds.set(name, facultyIds.size + 1);
  return facultyIds.get(name)!;
}

function toSheetSlot(slot: PlannedSlot): SheetSlot {
  return {
    id: ++seq,
    cn: slot.cn,
    subject: slot.subject,
    start: slot.start,
    end: slot.end,
    roomCode: slot.roomCode,
    facultyId: slot.facultyName ? facultyIdOf(slot.facultyName) : null,
    facultyName: slot.facultyName,
    surname: slot.facultyName?.split(",")[0] ?? null,
  };
}

describe("H. program isolation on the generated sheet", () => {
  const bsitMonday = plan.slots
    .filter((s) => s.courseCode === "BSIT" && s.weekday === 1)
    .map(toSheetSlot);
  const bsceMonday = plan.slots
    .filter((s) => s.courseCode === "BSCE-SE" && s.weekday === 1)
    .map(toSheetSlot);

  it("keeps other-program faculty (Claver, Atienza) out of the BSIT sheet", () => {
    const sheet = buildProgramSheet(bsitMonday);
    expect(sheet.columns.some((c) => /Claver|Atienza/i.test(c.label))).toBe(false);
  });

  it("places Atienza in the BSCE-SE sheet, never the BSIT sheet", () => {
    const bsce = buildProgramSheet(bsceMonday);
    expect(bsce.columns.some((c) => /Atienza/i.test(c.label))).toBe(true);
  });

  it("shows Espinosa's Monday BSIT class with a TBA room (filled in at encoding)", () => {
    const sheet = buildProgramSheet(bsitMonday);
    const column = sheet.columns.find((c) => /Espinosa/i.test(c.label));
    expect(column).toBeDefined();
    const rooms = column!.cells
      .filter((c) => c !== "empty" && c !== "covered")
      .map((c) => c.room);
    expect(rooms).toContain("TBA");
  });

  it("never carries a BSIT class onto the BSCE-SE sheet", () => {
    const sheet = buildProgramSheet(bsceMonday);
    expect(sheet.unassigned.some((u) => u.cn === "48132")).toBe(false);
  });
});

describe("I. sheet reconciliation", () => {
  function slot(faculty: string, start: string, end: string, room: string): SheetSlot {
    return {
      id: ++seq,
      cn: "X",
      subject: "SUB",
      start,
      end,
      roomCode: room,
      facultyId: facultyIdOf(faculty),
      facultyName: faculty,
      surname: faculty,
    };
  }

  it("passes when scheduled hours match the rendered grid", () => {
    const result = reconcileProgramSheet([
      slot("Dela Cruz, Ana", "07:00", "09:00", "AVR"),
      slot("Dela Cruz, Ana", "09:00", "10:00", "COM A"),
    ]);
    expect(result.ok).toBe(true);
    expect(result.expectedHours).toBe(3);
    expect(result.renderedHours).toBe(3);
  });

  it("fails when an instructor is double-booked at the same hour", () => {
    const result = reconcileProgramSheet([
      slot("Buhat, Alvin", "12:00", "13:00", "EMM302"),
      slot("Buhat, Alvin", "12:00", "13:00", "EMM303"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.expectedHours).toBe(2);
    expect(result.renderedHours).toBe(1);
    expect(result.problems.some((p) => /Buhat/.test(p))).toBe(true);
  });

  it("flags the real BSIT Monday sheet as unreconcilable", () => {
    const bsitMonday = plan.slots
      .filter((s) => s.courseCode === "BSIT" && s.weekday === 1)
      .map(toSheetSlot);
    const result = reconcileProgramSheet(bsitMonday);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /Buhat|Fajartin|Pascual/.test(p))).toBe(true);
  });
});
