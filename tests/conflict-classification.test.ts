import { describe, it, expect, vi } from "vitest";
import {
  detectScheduleConflicts,
  detectFacultyConflicts,
  planFromRows,
  readRows,
  type PlannedSlot,
} from "@/lib/import";
import { workbookBuffer } from "./workbook";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const TARGET = { schoolYear: "2026-2027", semester: "1st Semester" };

function slot(over: Partial<PlannedSlot>): PlannedSlot {
  return {
    rowNumber: 2,
    cn: "48001",
    subject: "CC101",
    description: null,
    units: 3,
    section: "IT1_S1B12627",
    yearLevel: "1",
    courseCode: "BSIT",
    instructorRaw: "Pascual, Aubrey",
    facultyName: "Pascual, Aubrey",
    termType: "LEC",
    semester: "1st Semester",
    schoolYear: "2026-2027",
    weekday: 1,
    start: "10:00",
    end: "11:00",
    roomCode: "EMM201",
    roomType: "PHYSICAL",
    mode: "FACE_TO_FACE",
    status: "new",
    messages: [],
    ...over,
  };
}

describe("A. overlap maths", () => {
  it("does not flag a class that starts exactly when another ends", () => {
    const slots = [
      slot({ cn: "1", start: "15:00", end: "16:00" }),
      slot({ cn: "2", start: "16:00", end: "17:00" }),
    ];
    expect(detectScheduleConflicts(slots)).toEqual([]);
  });

  it("flags a one-minute intrusion", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "1", subject: "CC101", start: "15:00", end: "16:00" }),
      slot({ cn: "2", subject: "CC102", start: "15:59", end: "17:00" }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("CONFLICT");
  });

  it("does not flag the same times on different weekdays", () => {
    expect(
      detectScheduleConflicts([slot({ cn: "1", weekday: 1 }), slot({ cn: "2", weekday: 2 })]),
    ).toEqual([]);
  });

  it("does not flag two instructors teaching at the same time", () => {
    expect(
      detectScheduleConflicts([
        slot({ cn: "1", facultyName: "Alpha, Ann" }),
        slot({ cn: "2", facultyName: "Beta, Ben" }),
      ]),
    ).toEqual([]);
  });

  it("does not flag unassigned (TBA) rows against each other", () => {
    expect(
      detectScheduleConflicts([
        slot({ cn: "1", facultyName: null }),
        slot({ cn: "2", facultyName: null }),
      ]),
    ).toEqual([]);
  });

  it("reports one finding for a Mon-Fri overlap, not five", () => {
    const slots = [1, 2, 3, 4, 5].flatMap((weekday) => [
      slot({ cn: "47013", weekday, subject: "IAS101" }),
      slot({ cn: "47020", weekday, subject: "CSE413", section: "CS4Y_B12526", roomCode: "EMM201" }),
    ]);
    const found = detectScheduleConflicts(slots);
    expect(found).toHaveLength(1);
    expect(found[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(found[0].message).toContain("Monday, Tuesday, Wednesday, Thursday, Friday");
  });
});

describe("B. classification", () => {
  it("treats one CN with extra time as a duplicate record, not a conflict", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "48146", subject: "CC102", section: "IT1_S1B102627", start: "07:00", end: "09:00" }),
      slot({
        cn: "48146",
        subject: "CC102",
        section: "IT1_S1B102627",
        start: "07:00",
        end: "10:00",
        roomCode: "COM A",
      }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("DUPLICATE");
    expect(found[0].blocking).toBe(false);
    expect(detectFacultyConflicts([slot({ cn: "48146" }), slot({ cn: "48146" })])).toEqual([]);
  });

  it("treats the same subject and section under two CNs as a duplicate record", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "42003", subject: "LIS105" }),
      slot({ cn: "42007", subject: "LIS105" }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("DUPLICATE");
    expect(found[0].sameSubject).toBe(true);
    expect(found[0].sameSection).toBe(true);
  });

  it("treats two sections of the same subject at once as a possible combined class", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "48112", subject: "NET102", section: "IT3_B3S12627" }),
      slot({ cn: "48173", subject: "NET102", section: "IT3_B5S12627" }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("COMBINED");
    expect(found[0].blocking).toBe(false);
  });

  it("treats different subjects at once as a hard conflict", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "44034", subject: "FIL1" }),
      slot({ cn: "48075", subject: "GE205" }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("CONFLICT");
    expect(found[0].blocking).toBe(true);
  });

  it("merges a six-section shared block into one combined finding", () => {
    const sections = ["A", "B", "C", "D", "E", "F"];
    const found = detectScheduleConflicts(
      sections.map((s, i) =>
        slot({ cn: String(100 + i), subject: "PATHFIT1", section: s, weekday: 6, start: "06:00", end: "08:00" }),
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("COMBINED");
    expect(found[0].cnList).toHaveLength(6);
  });

  it("ignores case and spacing when matching subjects and sections", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "1", subject: "Net 102", section: " it3_b3 " }),
      slot({ cn: "2", subject: "NET102", section: "IT3_B3" }),
    ]);
    expect(found[0].kind).toBe("DUPLICATE");
  });

  it("keeps a reused CN with a different subject as a real conflict", () => {
    const found = detectScheduleConflicts([
      slot({ cn: "44018", subject: "FIL1", section: "CE1_B3S12627" }),
      slot({ cn: "44018", subject: "GE205", section: "IT2_B1S1202627" }),
    ]);
    expect(found[0].kind).toBe("CONFLICT");
    expect(found[0].blocking).toBe(true);
  });
});

describe("C. multi-delivery cells", () => {
  function planFor(schedule: string) {
    const row = {
      CN: "42000",
      Subject: "LIS101",
      Course: "BLIS",
      Schedule: schedule,
      Instructor: "Claver, Priscilla De Leon",
      Section: "LIS1_B1S12627",
      Description: "",
      Unit: 3,
      Code: "1",
      "Term Type": "LEC",
      Sem: "1st",
    };
    return planFromRows([row], {
      faculty: [],
      courses: [],
      rooms: [],
      existingSlots: [],
      target: TARGET,
      worksheetRows: 2,
      missingColumns: [],
    });
  }

  it("collapses physical + OLC + ASYNC alternatives into one meeting per day", () => {
    const plan = planFor(
      "F/M 10:00 AM-11:00 AVR || F/M 10:00 AM-11:00 OLC || F/M 10:00 AM-11:00 ASYNC",
    );
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots.every((s) => s.roomCode === "AVR" && s.start === "10:00" && s.end === "11:00")).toBe(true);
    expect(plan.summary.validBlocks).toBe(1);
    expect(plan.summary.conflicts).toBe(0);
  });

  it("never turns ASYNC into a scheduled meeting of its own", () => {
    const plan = planFor("F/M 10:00 AM-11:00 AVR || F/M 10:00 AM-11:00 ASYNC");
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots.every((s) => s.roomCode === "AVR")).toBe(true);
  });

  it("keeps entries on different days as separate meetings", () => {
    const plan = planFor("M 10:00 AM-11:00 EMM201 || T 01:00 PM-02:00 OLC");
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots.map((s) => s.weekday).sort()).toEqual([1, 2]);
  });
});

describe("D. real workbook: review categories", () => {
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

  it("never reports the same class twice as a conflict", () => {
    for (const c of plan.conflicts) {
      expect(c.a.cn).not.toBe(c.b.cn);
      expect(c.blocking).toBe(true);
    }
  });

  it("lists every incomplete schedule without inventing times", () => {
    expect(plan.incompleteSchedules.map((s) => s.row).sort((a, b) => a - b)).toEqual([277, 336, 354]);
    expect(plan.incompleteSchedules.every((s) => s.message.length > 0)).toBe(true);
    expect(plan.slots.some((s) => s.cn === "48115")).toBe(false);
  });

  it("counts TBA classrooms once per class and invents no room codes", () => {
    expect(plan.tbaClassrooms).toHaveLength(96);
    expect(new Set(plan.tbaClassrooms.map((t) => t.cn)).size).toBe(96);
    expect(plan.slots.filter((s) => s.roomCode === "TBA").every((s) => s.roomType === "TBA")).toBe(true);
  });

  it("separates the three review buckets", () => {
    expect(plan.summary.conflicts).toBe(17);
    expect(plan.summary.combinedClasses).toBe(18);
    expect(plan.summary.duplicateSchedules).toBe(9);
    expect(plan.summary.incompleteSchedules).toBe(3);
    expect(plan.summary.tbaClassrooms).toBe(96);
  });
});
