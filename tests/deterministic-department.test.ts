import { describe, it, expect, vi } from "vitest";
import {
  normalizeFacultyName,
  resolveFacultyDepartmentFromRoster,
  slotBelongsToDepartment,
} from "@/lib/faculty-department";
import { planFromRows, slotInScope, type PlannedSlot } from "@/lib/import";
import { getTodayLocalDate, parseISODate, todayUtc } from "@/lib/dates";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("Deterministic Faculty Department Identification", () => {
  const roster = [
    {
      id: 1,
      fullName: "Abueme, Kimberly Kate",
      departmentCode: "CET",
      departmentName: "College of Engineering and Technology",
    },
    {
      id: 2,
      fullName: "Dela Cruz, Juan P.",
      departmentCode: "CET",
      departmentName: "College of Engineering and Technology",
    },
    {
      id: 3,
      fullName: "Santos, Maria Cbe",
      departmentCode: "CBE",
      departmentName: "College of Business Education",
    },
    {
      id: 4,
      fullName: "Reyes, Pedro Cte",
      departmentCode: "CTE",
      departmentName: "College of Teacher Education",
    },
    {
      id: 5,
      fullName: "Garcia, Ana Coahs",
      departmentCode: "COAHS",
      departmentName: "College of Allied Health Sciences",
    },
    {
      id: 6,
      fullName: "Unassigned, Teacher",
      departmentCode: null,
      departmentName: null,
    },
    {
      id: 7,
      fullName: "Ambiguous, Person",
      departmentCode: "CET",
      departmentName: "College of Engineering and Technology",
    },
    {
      id: 8,
      fullName: "Ambiguous, Person",
      departmentCode: "CBE",
      departmentName: "College of Business Education",
    },
  ];

  describe("Name normalization", () => {
    it("handles periods, commas, extra whitespace, and capitalization deterministically", () => {
      expect(normalizeFacultyName("JUAN D. DELA CRUZ")).toBe("JUAN D DELA CRUZ");
      expect(normalizeFacultyName("Juan D Dela Cruz")).toBe("JUAN D DELA CRUZ");
      expect(normalizeFacultyName("  JUAN D. DELA CRUZ  ")).toBe("JUAN D DELA CRUZ");
      expect(normalizeFacultyName("Dela Cruz, Juan P.")).toBe("DELA CRUZ JUAN P");
      expect(normalizeFacultyName("dela   cruz,  juan p.")).toBe("DELA CRUZ JUAN P");
      expect(normalizeFacultyName("D'Angelo, John")).toBe("D'ANGELO JOHN");
    });
  });

  describe("Department resolution from roster", () => {
    it("identifies a CET faculty member correctly", () => {
      const res = resolveFacultyDepartmentFromRoster("Abueme, Kimberly Kate", roster);
      expect(res.status).toBe("MATCHED");
      expect(res.departmentCode).toBe("CET");
      expect(res.faculty?.id).toBe(1);
    });

    it("keeps CET faculty teaching non-CET subjects (NSTP, GE) in CET", () => {
      // Regardless of subject taught, lookup is determined purely by instructor identity
      const res = resolveFacultyDepartmentFromRoster("dela cruz, juan p.", roster);
      expect(res.status).toBe("MATCHED");
      expect(res.departmentCode).toBe("CET");
      expect(slotBelongsToDepartment({ faculty: { departmentCode: res.departmentCode } }, "CET")).toBe(true);
      expect(slotBelongsToDepartment({ faculty: { departmentCode: res.departmentCode } }, "CBE")).toBe(false);
    });

    it("does not classify non-CET faculty teaching CET subjects as CET", () => {
      // CBE faculty teaching BSIT programming
      const resCbe = resolveFacultyDepartmentFromRoster("Santos, Maria Cbe", roster);
      expect(resCbe.status).toBe("MATCHED");
      expect(resCbe.departmentCode).toBe("CBE");
      expect(slotBelongsToDepartment({ faculty: { departmentCode: resCbe.departmentCode } }, "CET")).toBe(false);

      // CTE faculty
      const resCte = resolveFacultyDepartmentFromRoster("Reyes, Pedro Cte", roster);
      expect(resCte.status).toBe("MATCHED");
      expect(resCte.departmentCode).toBe("CTE");
      expect(slotBelongsToDepartment({ faculty: { departmentCode: resCte.departmentCode } }, "CET")).toBe(false);

      // COAHS faculty
      const resCoahs = resolveFacultyDepartmentFromRoster("Garcia, Ana Coahs", roster);
      expect(resCoahs.status).toBe("MATCHED");
      expect(resCoahs.departmentCode).toBe("COAHS");
      expect(slotBelongsToDepartment({ faculty: { departmentCode: resCoahs.departmentCode } }, "CET")).toBe(false);
    });

    it("flags unassigned faculty without silently classifying them as CET", () => {
      const res = resolveFacultyDepartmentFromRoster("Unassigned, Teacher", roster);
      expect(res.status).toBe("UNASSIGNED");
      expect(res.departmentCode).toBeNull();
      expect(res.faculty?.id).toBe(6);
      expect(slotBelongsToDepartment({ faculty: { departmentCode: res.departmentCode } }, "CET")).toBe(false);
    });

    it("flags ambiguous duplicate names for manual review without guessing", () => {
      const res = resolveFacultyDepartmentFromRoster("Ambiguous, Person", roster);
      expect(res.status).toBe("AMBIGUOUS");
      expect(res.departmentCode).toBeNull();
      expect(res.matches).toHaveLength(2);
    });

    it("flags unknown instructors as unmatched", () => {
      const res = resolveFacultyDepartmentFromRoster("Totally Unknown Person", roster);
      expect(res.status).toBe("UNMATCHED");
      expect(res.departmentCode).toBeNull();
      expect(res.faculty).toBeNull();
    });

    it("handles TBA gracefully", () => {
      expect(resolveFacultyDepartmentFromRoster("TBA", roster).status).toBe("TBA");
      expect(resolveFacultyDepartmentFromRoster("", roster).status).toBe("TBA");
      expect(resolveFacultyDepartmentFromRoster(null, roster).status).toBe("TBA");
    });
  });

  describe("Excel import department breakdown and scope filtering", () => {
    it("computes department breakdown counts correctly from parsed rows", () => {
      const rows = [
        {
          "Term Type": "Regular",
          Subject: "IT101",
          CN: "1001",
          Description: "Intro to IT",
          Unit: "3",
          Sem: "1st Semester",
          Schedule: "M 08:00 AM-09:00 AM RM101",
          Section: "A",
          Course: "BSIT",
          Slots: "1",
          Instructor: "Dela Cruz, Juan P.",
          Code: "1",
        },
        {
          "Term Type": "Regular",
          Subject: "NSTP1",
          CN: "1002",
          Description: "Civic Training",
          Unit: "3",
          Sem: "1st Semester",
          Schedule: "T 08:00 AM-09:00 AM RM102",
          Section: "B",
          Course: "NSTP",
          Slots: "1",
          Instructor: "Abueme, Kimberly Kate",
          Code: "1",
        },
        {
          "Term Type": "Regular",
          Subject: "BA101",
          CN: "1003",
          Description: "Business Admin",
          Unit: "3",
          Sem: "1st Semester",
          Schedule: "W 08:00 AM-09:00 AM RM103",
          Section: "C",
          Course: "BSBA",
          Slots: "1",
          Instructor: "Santos, Maria Cbe",
          Code: "1",
        },
        {
          "Term Type": "Regular",
          Subject: "ED101",
          CN: "1004",
          Description: "Teaching Principles",
          Unit: "3",
          Sem: "1st Semester",
          Schedule: "TH 08:00 AM-09:00 AM RM104",
          Section: "D",
          Course: "BSED",
          Slots: "1",
          Instructor: "Reyes, Pedro Cte",
          Code: "1",
        },
        {
          "Term Type": "Regular",
          Subject: "NUR101",
          CN: "1005",
          Description: "Nursing Care",
          Unit: "3",
          Sem: "1st Semester",
          Schedule: "F 08:00 AM-09:00 AM RM105",
          Section: "E",
          Course: "BSN",
          Slots: "1",
          Instructor: "Garcia, Ana Coahs",
          Code: "1",
        },
        {
          "Term Type": "Regular",
          Subject: "GEN101",
          CN: "1006",
          Description: "General Subject",
          Unit: "3",
          Sem: "1st Semester",
          Schedule: "S 08:00 AM-09:00 AM RM106",
          Section: "F",
          Course: "GEN",
          Slots: "1",
          Instructor: "Unassigned, Teacher",
          Code: "1",
        },
      ];

      const plan = planFromRows(rows, {
        faculty: roster,
        courses: [],
        rooms: [],
        existingSlots: [],
        target: { schoolYear: "2026-2027", semester: "1st Semester" },
      });

      expect(plan.summary.departmentBreakdown.cet).toBe(2); // Dela Cruz + Abueme (even though teaching NSTP!)
      expect(plan.summary.departmentBreakdown.cbe).toBe(1); // Santos
      expect(plan.summary.departmentBreakdown.cte).toBe(1); // Reyes
      expect(plan.summary.departmentBreakdown.coahs).toBe(1); // Garcia
      expect(plan.summary.departmentBreakdown.unassigned).toBe(1); // Unassigned, Teacher
    });

    it("filters slots by course/program attribution (Rule A), where Excel Course column determines program and college ownership", () => {
      const bsitGeSlot: PlannedSlot = {
        rowNumber: 2,
        cn: "1002",
        subject: "NSTP1",
        description: null,
        units: 3,
        section: "B",
        yearLevel: "1",
        courseCode: "BSIT", // GE/NSTP subject under BSIT remains BSIT schedule (Rule A)
        instructorRaw: "Abueme, Kimberly Kate",
        facultyName: "Abueme, Kimberly Kate",
        facultyDepartment: "CET",
        facultyStatus: "MATCHED",
        termType: "Regular",
        semester: "1st Semester",
        schoolYear: "2026-2027",
        weekday: 2,
        start: "08:00",
        end: "09:00",
        roomCode: "RM102",
        roomType: "PHYSICAL",
        mode: "FACE_TO_FACE",
        status: "new",
        messages: [],
      };

      const bsitCbeFacultySlot: PlannedSlot = {
        ...bsitGeSlot,
        cn: "1003",
        subject: "CC101",
        courseCode: "BSIT", // CBE instructor teaching a BSIT subject belongs to BSIT
        instructorRaw: "Santos, Maria Cbe",
        facultyName: "Santos, Maria Cbe",
        facultyDepartment: "CBE",
      };

      const cbeSlot: PlannedSlot = {
        ...bsitGeSlot,
        cn: "1004",
        subject: "TM101",
        courseCode: "BSTM", // Belongs to CBE program (Tourism Management)
        instructorRaw: "Dela Cruz, Juan P.",
        facultyName: "Dela Cruz, Juan P.",
        facultyDepartment: "CET",
      };

      // Under Rule A: Excel Course column determines ownership
      // Both BSIT slots belong to CET (and BSIT), regardless of instructor department
      expect(slotInScope(bsitGeSlot, { college: "CET" })).toBe(true);
      expect(slotInScope(bsitCbeFacultySlot, { college: "CET" })).toBe(true);
      expect(slotInScope(cbeSlot, { college: "CET" })).toBe(false);

      // BSTM slot belongs to CBE
      expect(slotInScope(bsitGeSlot, { college: "CBE" })).toBe(false);
      expect(slotInScope(bsitCbeFacultySlot, { college: "CBE" })).toBe(false);
      expect(slotInScope(cbeSlot, { college: "CBE" })).toBe(true);

      // Program-level scoping
      expect(slotInScope(bsitGeSlot, { program: "BSIT" })).toBe(true);
      expect(slotInScope(bsitCbeFacultySlot, { program: "BSIT" })).toBe(true);
      expect(slotInScope(cbeSlot, { program: "BSIT" })).toBe(false);
    });
  });

  describe("Generate page date initialization", () => {
    it("defaults to today's local date in Asia/Manila format (YYYY-MM-DD)", () => {
      const localDate = getTodayLocalDate();
      expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const parsed = parseISODate(localDate);
      expect(parsed).toBeInstanceOf(Date);
      expect(isNaN(parsed!.getTime())).toBe(false);

      // Verify todayUtc() also returns a valid Date aligned with local date
      const utc = todayUtc();
      expect(utc).toBeInstanceOf(Date);
    });
  });
});
