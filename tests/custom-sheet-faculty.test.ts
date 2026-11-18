import { describe, it, expect, vi } from "vitest";
import {
  buildSheetKey,
  searchFacultyForSheet,
  addCustomFacultyToSheet,
  removeFacultyFromSheet,
  restoreExcludedFacultyOnSheet,
  getExcludedFacultyIdsForSheet,
  getCustomFacultyForSheet,
} from "@/lib/custom-sheet-faculty";
import { buildProgramSheet, type SheetSlot } from "@/lib/attendance-sheet";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => {
  const customFacultyStore = new Map<number, any>();
  const sheetCustomFacultyStore = new Map<string, any>();
  const facultyStore = new Map<number, any>([
    [
      101,
      {
        id: 101,
        fullName: "Dela Cruz, Juan M.",
        surname: "Dela Cruz",
        departmentId: 1,
        active: true,
        department: { id: 1, code: "CET", name: "College of Engineering and Technology" },
      },
    ],
    [
      102,
      {
        id: 102,
        fullName: "Santos, Maria P.",
        surname: "Santos",
        departmentId: 2,
        active: true,
        department: { id: 2, code: "CBE", name: "College of Business Education" },
      },
    ],
    [
      103,
      {
        id: 103,
        fullName: "Aquino, Benigno S.",
        surname: "Aquino",
        departmentId: null,
        active: true,
        department: null,
      },
    ],
  ]);

  const slotsStore = [
    {
      id: 501,
      cn: "1001",
      subject: "IT101",
      startTime: "08:00",
      endTime: "10:00",
      facultyId: 102,
      weekday: 1,
      schoolYear: "2026-2027",
      semester: "1st Semester",
      room: { id: 1, code: "AVR" },
      course: { id: 1, code: "BSIT", name: "BS Information Technology" },
    },
    {
      id: 502,
      cn: "1002",
      subject: "CS102",
      startTime: "08:00",
      endTime: "10:00",
      facultyId: 102,
      weekday: 1,
      schoolYear: "2026-2027",
      semester: "1st Semester",
      room: { id: 2, code: "FGM512" },
      course: { id: 2, code: "BSCS", name: "BS Computer Science" },
    },
  ];

  const mockPrisma = {
    faculty: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
        return facultyStore.get(where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        let list = Array.from(facultyStore.values());
        if (where?.id?.in) {
          list = list.filter((f) => where.id.in.includes(f.id));
        }
        if (where?.OR) {
          const q = where.OR[0]?.fullName?.contains?.toLowerCase() ?? "";
          list = list.filter(
            (f) =>
              f.fullName.toLowerCase().includes(q) || f.surname.toLowerCase().includes(q),
          );
        }
        return list;
      }),
    },
    scheduleSlot: {
      findMany: vi.fn(async ({ where }: any) => {
        return slotsStore.filter((s) => {
          if (where.facultyId?.in && !where.facultyId.in.includes(s.facultyId)) return false;
          if (where.facultyId && typeof where.facultyId === "number" && s.facultyId !== where.facultyId)
            return false;
          if (where.weekday !== undefined && s.weekday !== where.weekday) return false;
          return true;
        });
      }),
    },
    attendance: {
      findMany: vi.fn(async () => []),
    },
    customFaculty: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = customFacultyStore.get(where.facultyId);
        const record = existing
          ? { ...existing, ...update, updatedAt: new Date() }
          : { id: where.facultyId + 1000, ...create, createdAt: new Date(), updatedAt: new Date() };
        customFacultyStore.set(where.facultyId, record);
        return record;
      }),
      findMany: vi.fn(async () => Array.from(customFacultyStore.values())),
    },
    sheetCustomFaculty: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = `${where.sheetKey_facultyId.sheetKey}:${where.sheetKey_facultyId.facultyId}`;
        return sheetCustomFacultyStore.get(key) ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const list = Array.from(sheetCustomFacultyStore.values());
        return list.filter((item) => {
          if (where.sheetKey && item.sheetKey !== where.sheetKey) return false;
          if (where.action && item.action !== where.action) return false;
          return true;
        });
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = `${where.sheetKey_facultyId.sheetKey}:${where.sheetKey_facultyId.facultyId}`;
        const existing = sheetCustomFacultyStore.get(key);
        const faculty = facultyStore.get(where.sheetKey_facultyId.facultyId);
        const record = existing
          ? { ...existing, ...update, updatedAt: new Date(), faculty }
          : {
              id: sheetCustomFacultyStore.size + 1,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
              faculty,
            };
        sheetCustomFacultyStore.set(key, record);
        return record;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [key, item] of Array.from(sheetCustomFacultyStore.entries())) {
          if (where.sheetKey && item.sheetKey !== where.sheetKey) continue;
          if (where.facultyId && item.facultyId !== where.facultyId) continue;
          if (where.action && item.action !== where.action) continue;
          sheetCustomFacultyStore.delete(key);
          count++;
        }
        return { count };
      }),
    },
    $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
  };

  return { prisma: mockPrisma };
});

describe("Custom Faculty Addition, Room Tracking, and Sheet Integration", () => {
  const TERM = { schoolYear: "2026-2027", semester: "1st Semester" };
  const TARGET_DATE = new Date("2026-11-16T00:00:00.000Z"); // Monday (weekday = 1)

  describe("1. buildSheetKey deterministic scoping", () => {
    it("generates stable unique keys for department scopes", () => {
      const key1 = buildSheetKey({
        date: "2026-11-16",
        department: "CET",
        schoolYear: "2026-2027",
        semester: "1st Semester",
      });
      const key2 = buildSheetKey({
        date: "2026-11-16",
        department: "cet",
        schoolYear: "2026-2027",
        semester: "1st Semester",
      });
      expect(key1).toBe("sheet:2026-11-16:dept-CET:2026-2027:1st Semester");
      expect(key1).toBe(key2);
    });

    it("isolates different dates to prevent automatic carry-over to tomorrow", () => {
      const todayKey = buildSheetKey({
        date: "2026-11-16",
        department: "CET",
        schoolYear: "2026-2027",
        semester: "1st Semester",
      });
      const tomorrowKey = buildSheetKey({
        date: "2026-11-17",
        department: "CET",
        schoolYear: "2026-2027",
        semester: "1st Semester",
      });
      expect(todayKey).not.toBe(tomorrowKey);
    });
  });

  describe("2. Faculty search behavior", () => {
    it("performs case-insensitive partial name search", async () => {
      const results = await searchFacultyForSheet("dela", TARGET_DATE, TERM);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fullName).toContain("Dela Cruz, Juan");
      expect(results[0].departmentCode).toBe("CET");
    });

    it("identifies faculty already on the sheet", async () => {
      const results = await searchFacultyForSheet("dela", TARGET_DATE, TERM, [101]);
      expect(results[0].isAlreadyOnSheet).toBe(true);
    });

    it("retrieves room information for scheduled faculty", async () => {
      const results = await searchFacultyForSheet("santos", TARGET_DATE, TERM);
      expect(results.length).toBe(1);
      // Faculty 102 has slots in AVR and FGM512
      expect(results[0].roomSummary).toContain("AVR");
      expect(results[0].roomSummary).toContain("FGM512");
    });

    it("displays null room summary when faculty has no room assignment", async () => {
      const results = await searchFacultyForSheet("aquino", TARGET_DATE, TERM);
      expect(results[0].roomSummary).toBeNull();
    });
  });

  describe("3. Add Custom Faculty to Sheet & Duplicate Prevention", () => {
    const sheetKey = "sheet:2026-11-16:dept-CET:2026-2027:1st Semester";

    it("adds a faculty member and saves to database", async () => {
      const result = await addCustomFacultyToSheet({
        sheetKey,
        date: TARGET_DATE,
        facultyId: 102, // Maria Santos (CBE) added to CET sheet
        userId: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sheetEntry.facultyId).toBe(102);
        expect(result.sheetEntry.action).toBe("CUSTOM_ADD");
      }
    });

    it("prevents duplicate addition of the same faculty to the same sheet", async () => {
      const duplicateResult = await addCustomFacultyToSheet({
        sheetKey,
        date: TARGET_DATE,
        facultyId: 102,
        userId: 1,
      });

      expect(duplicateResult.ok).toBe(false);
      if (!duplicateResult.ok) {
        expect(duplicateResult.error).toContain("already included");
      }
    });

    it("verifies addition survives page refresh", async () => {
      const customFacultyList = await getCustomFacultyForSheet(sheetKey);
      expect(customFacultyList.some((c) => c.facultyId === 102)).toBe(true);
    });

    it("requires separate manual addition for another sheet/date", async () => {
      const tomorrowKey = "sheet:2026-11-17:dept-CET:2026-2027:1st Semester";
      const tomorrowList = await getCustomFacultyForSheet(tomorrowKey);
      expect(tomorrowList.some((c) => c.facultyId === 102)).toBe(false);
    });
  });

  describe("4. Room Tracking & Printing Grid Integration", () => {
    it("handles multiple room assignments at the same hour without arbitrarily selecting one", () => {
      const slots: SheetSlot[] = [
        {
          id: 1,
          cn: "101",
          subject: "IT101",
          start: "08:00",
          end: "10:00",
          roomCode: "AVR",
          facultyId: 102,
          facultyName: "Santos, Maria",
          surname: "Santos",
          isCustom: true,
        },
        {
          id: 2,
          cn: "102",
          subject: "CS102",
          start: "08:00",
          end: "10:00",
          roomCode: "FGM512",
          facultyId: 102,
          facultyName: "Santos, Maria",
          surname: "Santos",
          isCustom: true,
        },
      ];

      const sheet = buildProgramSheet(slots);
      expect(sheet.columns.length).toBe(1);
      const column = sheet.columns[0];
      expect(column.isCustom).toBe(true);
      expect(column.label).toBe("SANTOS");

      // The room in row 08:00–09:00 must list both AVR and FGM512
      const firstCell = column.cells[0];
      expect(typeof firstCell).toBe("object");
      if (typeof firstCell === "object") {
        expect(firstCell.room).toContain("AVR");
        expect(firstCell.room).toContain("FGM512");
      }
    });

    it("displays empty cell rather than fabricating a room when faculty has no room assignment", () => {
      const slots: SheetSlot[] = [
        // One regular faculty with class
        {
          id: 10,
          cn: "201",
          subject: "IT201",
          start: "08:00",
          end: "09:00",
          roomCode: "EMM303",
          facultyId: 101,
          facultyName: "Dela Cruz, Juan",
          surname: "Dela Cruz",
        },
        // One custom faculty with no scheduled hours
        {
          id: -103,
          cn: "CUSTOM",
          subject: "CUSTOM",
          start: "",
          end: "",
          roomCode: "",
          facultyId: 103,
          facultyName: "Aquino, Benigno",
          surname: "Aquino",
          isCustom: true,
        },
      ];

      const sheet = buildProgramSheet(slots);
      expect(sheet.columns.length).toBe(2);

      const aquinoCol = sheet.columns.find((c) => c.facultyId === 103);
      expect(aquinoCol).toBeDefined();
      expect(aquinoCol!.isCustom).toBe(true);
      expect(aquinoCol!.label).toBe("AQUINO");

      // All cells for Aquino must be empty
      expect(aquinoCol!.cells.every((c) => c === "empty")).toBe(true);
    });
  });

  describe("5. Remove Faculty and Database Protection", () => {
    const sheetKey = "sheet:2026-11-16:dept-CET:2026-2027:1st Semester";

    it("removes custom faculty from the sheet while preserving master faculty", async () => {
      const removeResult = await removeFacultyFromSheet({
        sheetKey,
        date: TARGET_DATE,
        facultyId: 102,
        isCustom: true,
      });

      expect(removeResult.ok).toBe(true);

      // Verify removed from sheet
      const customList = await getCustomFacultyForSheet(sheetKey);
      expect(customList.some((c) => c.facultyId === 102)).toBe(false);

      // Verify master faculty is NOT deleted
      const masterFaculty = await prisma.faculty.findUnique({ where: { id: 102 } });
      expect(masterFaculty).toBeDefined();
      expect(masterFaculty?.fullName).toBe("Santos, Maria P.");

      // Verify schedule slots are NOT deleted
      const scheduleSlots = await prisma.scheduleSlot.findMany({ where: { facultyId: 102 } });
      expect(scheduleSlots.length).toBe(2);
    });

    it("excludes automatically generated faculty from sheet and survives refresh", async () => {
      // Exclude Juan Dela Cruz (101) from this sheet
      const removeResult = await removeFacultyFromSheet({
        sheetKey,
        date: TARGET_DATE,
        facultyId: 101,
        isCustom: false,
      });

      expect(removeResult.ok).toBe(true);

      // On refresh, 101 is in excluded set
      const excludedIds = await getExcludedFacultyIdsForSheet(sheetKey);
      expect(excludedIds.has(101)).toBe(true);

      // Restoring brings them back
      await restoreExcludedFacultyOnSheet(sheetKey, 101);
      const afterRestore = await getExcludedFacultyIdsForSheet(sheetKey);
      expect(afterRestore.has(101)).toBe(false);
    });
  });
});
