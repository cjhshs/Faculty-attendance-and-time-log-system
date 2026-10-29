import { describe, it, expect, vi } from "vitest";
import {
  FACULTY_PER_PAGE,
  flattenPrintPages,
  paginateColumns,
  programPageCount,
  type SheetSlot,
} from "@/lib/attendance-sheet";
import { planFromRows } from "@/lib/import";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

function slot(facultyId: number): SheetSlot {
  return {
    id: facultyId,
    cn: `CN${facultyId}`,
    subject: "Subject",
    start: "07:00",
    end: "08:00",
    roomCode: "RM101",
    facultyId,
    facultyName: `Faculty, Number ${facultyId}`,
    surname: `Number ${facultyId}`,
  };
}

describe("stable print pagination", () => {
  it("keeps the page count fixed at the data level, not the viewport", () => {
    const exactlyOne = Array.from({ length: FACULTY_PER_PAGE }, (_, i) => slot(i + 1));
    const justOver = Array.from({ length: FACULTY_PER_PAGE + 1 }, (_, i) => slot(i + 1));
    expect(programPageCount(exactlyOne)).toBe(1);
    expect(programPageCount(justOver)).toBe(2);
    expect(programPageCount(justOver)).toBe(programPageCount(justOver));
  });

  it("maps page numbers to the same program/page in print-all and reprint", () => {
    const groupA = Array.from({ length: 13 }, (_, i) => slot(i + 1));
    const groupB = Array.from({ length: 2 }, (_, i) => slot(100 + i));
    const first = flattenPrintPages([{ slots: groupA }, { slots: groupB }]);
    const second = flattenPrintPages([{ slots: groupA }, { slots: groupB }]);
    expect(first).toEqual(second);
    expect(first.map((ref) => ref.pageNumber)).toEqual([1, 2, 3]);
    expect(first[0]).toMatchObject({ courseIndex: 0, pageIndex: 0 });
    expect(first[2]).toMatchObject({ courseIndex: 1, pageIndex: 0 });
  });

  it("never drops columns when splitting pages", () => {
    const slots = Array.from({ length: 25 }, (_, i) => slot(i + 1));
    const pages = paginateColumns(
      // A small helper build is covered indirectly by programPageCount; this
      // guard only exercises the splitter itself.
      Array.from({ length: 25 }, (_, i) => ({
        facultyId: i + 1,
        label: `F${i + 1}`,
        cells: [],
      })),
    );
    expect(pages).toHaveLength(3);
    expect(pages.flat()).toHaveLength(25);
    expect(programPageCount(slots)).toBe(3);
  });
});

const headerRow = {
  "Term Type": "Regular",
  Subject: "Subject",
  CN: "1",
  Description: "",
  Unit: "3",
  Sem: "1st Semester",
  Schedule: "M 08:00 AM-09:00 AM RM101",
  Section: "A",
  Course: "BSIT",
  Slots: "1",
  Instructor: "",
  Code: "1",
};

describe("parser instructor review is department-neutral", () => {
  function planFor(instructor: string, roster: Parameters<typeof planFromRows>[1]["faculty"]) {
    return planFromRows([{ ...headerRow, Instructor: instructor }], {
      faculty: roster,
      courses: [{ id: 1, code: "BSIT" }],
      rooms: [{ id: 1, code: "RM101" }],
      existingSlots: [],
      target: { schoolYear: "2026-2027", semester: "1st Semester" },
      worksheetRows: 2,
      missingColumns: [],
    });
  }

  const roster = [
    { id: 1, fullName: "Dela Cruz, Juan P.", departmentCode: "CET", departmentName: "Engineering" },
    { id: 2, fullName: "Doe, Jane", departmentCode: "CBE", departmentName: "Business" },
  ];

  it("does not flag a CET teacher of a BSIT subject", () => {
    const plan = planFor("Dela Cruz, Juan P.", roster);
    expect(plan.facultyReview).toHaveLength(0);
    expect(plan.slots[0]?.courseCode).toBe("BSIT");
  });

  it("does not infer a department for an unknown instructor", () => {
    const plan = planFor("Unknown, Teacher", roster);
    expect(plan.facultyReview).toHaveLength(1);
    expect(plan.facultyReview[0].kind).toBe("unknown");
    expect(plan.facultyReview[0].candidates).toEqual([]);
  });

  it("flags a roster name with no department", () => {
    const plan = planFor("Santos, Maria", [
      { id: 9, fullName: "Santos, Maria", departmentCode: null, departmentName: null },
    ]);
    expect(plan.facultyReview[0].kind).toBe("no-department");
  });

  it("flags an ambiguous duplicate roster name", () => {
    const plan = planFor("Doe, Jane", [
      ...roster,
      { id: 3, fullName: "DOE, JANE", departmentCode: "CET", departmentName: "Engineering" },
    ]);
    expect(plan.facultyReview[0].kind).toBe("ambiguous");
    expect(plan.facultyReview[0].candidates).toHaveLength(2);
  });

  it("matches names with extra spaces and capitalization", () => {
    const plan = planFor("  dela cruz,   juan p. ", roster);
    expect(plan.facultyReview).toHaveLength(0);
    expect(plan.slots.length).toBeGreaterThan(0);
  });
});
