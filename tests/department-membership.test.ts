import { beforeEach, describe, expect, it, vi } from "vitest";

// The membership service only touches the database through `prisma` and the
// transaction client. Mocking that boundary lets these tests assert exactly
// what a change writes: one faculty update plus one audit row, and nothing on
// schedules or attendance.
type MockTransaction = ReturnType<typeof transactionFor>;

const state = vi.hoisted(() => ({
  tx: {} as MockTransaction,
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: state.transaction },
}));

import {
  changeFacultyDepartment,
  clearFacultyDepartment,
} from "@/lib/department-membership";

type FacultyRow = {
  id: number;
  fullName: string;
  departmentId: number | null;
  department: { code: string; name: string } | null;
};

function transactionFor({
  faculty,
  college = null,
  scheduleSlots = 0,
  attendanceRecords = 0,
}: {
  faculty: FacultyRow | null;
  college?: { id: number; code: string; name: string } | null;
  scheduleSlots?: number;
  attendanceRecords?: number;
}) {
  return {
    faculty: {
      findUnique: vi.fn().mockResolvedValue(faculty),
      update: vi.fn().mockResolvedValue({}),
    },
    college: {
      findUnique: vi.fn().mockResolvedValue(college),
    },
    scheduleSlot: {
      count: vi.fn().mockResolvedValue(scheduleSlots),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    attendance: {
      count: vi.fn().mockResolvedValue(attendanceRecords),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

beforeEach(() => {
  state.transaction.mockReset();
  state.transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    run(state.tx),
  );
});

describe("transactional membership changes", () => {
  it("removing a department clears only the roster field and preserves history", async () => {
    const tx = transactionFor({
      faculty: {
        id: 313,
        fullName: "Abueme, Kimberly Kate",
        departmentId: 1,
        department: { code: "CET", name: "College of Engineering and Technology" },
      },
      scheduleSlots: 12,
      attendanceRecords: 7,
    });
    state.tx = tx;

    const result = await clearFacultyDepartment({
      facultyId: 313,
      actorId: 9,
      confirmed: true,
    });

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      fromCode: "CET",
      toCode: null,
      impact: { scheduleSlots: 12, attendanceRecords: 7 },
    });
    expect(tx.faculty.update).toHaveBeenCalledTimes(1);
    expect(tx.faculty.update).toHaveBeenCalledWith({
      where: { id: 313 },
      data: { departmentId: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe(
      "faculty.department.remove",
    );
    expect(tx.auditLog.create.mock.calls[0][0].data.details).toContain(
      "12 schedule slot(s) and 7 attendance record(s) preserved",
    );
    // A removal must never rewrite or delete schedule/attendance rows.
    expect(tx.scheduleSlot.update).not.toHaveBeenCalled();
    expect(tx.scheduleSlot.delete).not.toHaveBeenCalled();
    expect(tx.attendance.update).not.toHaveBeenCalled();
    expect(tx.attendance.delete).not.toHaveBeenCalled();
    expect(tx.faculty.update.mock.calls[0][0].data).not.toHaveProperty("fullName");
  });

  it("refuses to remove membership without explicit confirmation", async () => {
    state.tx = transactionFor({
      faculty: {
        id: 313,
        fullName: "Abueme, Kimberly Kate",
        departmentId: 1,
        department: { code: "CET", name: "College of Engineering and Technology" },
      },
    });

    const result = await clearFacultyDepartment({
      facultyId: 313,
      actorId: 9,
      confirmed: false,
    });

    expect(result.ok).toBe(false);
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("moves a faculty member between departments without touching history", async () => {
    const tx = transactionFor({
      faculty: {
        id: 20,
        fullName: "Cruz, Cbe Teacher",
        departmentId: 2,
        department: { code: "CBE", name: "College of Business Education" },
      },
      college: { id: 1, code: "CET", name: "College of Engineering and Technology" },
      scheduleSlots: 3,
      attendanceRecords: 4,
    });
    state.tx = tx;

    const result = await changeFacultyDepartment({
      facultyId: 20,
      departmentId: 1,
      actorId: 9,
    });

    expect(result).toMatchObject({ ok: true, changed: true, fromCode: "CBE", toCode: "CET" });
    expect(tx.faculty.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { departmentId: 1 },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe("faculty.department");
    expect(tx.scheduleSlot.update).not.toHaveBeenCalled();
    expect(tx.attendance.update).not.toHaveBeenCalled();
  });

  it("is idempotent: an unchanged department writes no update and no audit row", async () => {
    const tx = transactionFor({
      faculty: {
        id: 313,
        fullName: "Abueme, Kimberly Kate",
        departmentId: 1,
        department: { code: "CET", name: "College of Engineering and Technology" },
      },
      college: { id: 1, code: "CET", name: "College of Engineering and Technology" },
    });
    state.tx = tx;

    const result = await changeFacultyDepartment({
      facultyId: 313,
      departmentId: 1,
      actorId: 9,
    });

    expect(result).toMatchObject({ ok: true, changed: false });
    expect(tx.faculty.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
