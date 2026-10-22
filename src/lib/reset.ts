import type { PrismaClient } from "@prisma/client";

export const RESET_CONFIRMATION_PHRASE = "RESET OPERATIONAL DATA";

const RESET_LOCK_KEY = 812734561;

export type OperationalCounts = {
  attendance: number;
  sessions: number;
  scheduleSlots: number;
  importBatches: number;
  repairFindings: number;
  repairSources: number;
};

export type PreservedCounts = {
  faculty: number;
  courses: number;
  rooms: number;
  holidays: number;
  users: number;
  roles: number;
  auditLogs: number;
};

export function totalOperational(counts: OperationalCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export async function getOperationalCounts(db: PrismaClient): Promise<OperationalCounts> {
  const [attendance, sessions, scheduleSlots, importBatches, repairFindings, repairSources] =
    await Promise.all([
      db.attendance.count(),
      db.attendanceSession.count(),
      db.scheduleSlot.count(),
      db.importBatch.count(),
      db.repairFinding.count(),
      db.repairSource.count(),
    ]);
  return { attendance, sessions, scheduleSlots, importBatches, repairFindings, repairSources };
}

export async function getPreservedCounts(db: PrismaClient): Promise<PreservedCounts> {
  const [faculty, courses, rooms, holidays, users, roles, auditLogs] = await Promise.all([
    db.faculty.count(),
    db.course.count(),
    db.room.count(),
    db.holiday.count(),
    db.user.count(),
    db.role.count(),
    db.auditLog.count(),
  ]);
  return { faculty, courses, rooms, holidays, users, roles, auditLogs };
}

// Deletes encoded attendance, schedule slots, import history and repair analysis
// in one transaction. Master lists, users, roles, settings, holidays and the
// audit log are preserved. The advisory lock keeps two resets from overlapping.
export async function clearOperationalData(db: PrismaClient): Promise<OperationalCounts> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock($1)::text", RESET_LOCK_KEY);

      const attendance = (await tx.attendance.deleteMany()).count;
      const sessions = (await tx.attendanceSession.deleteMany()).count;
      const scheduleSlots = (await tx.scheduleSlot.deleteMany()).count;
      const importBatches = (await tx.importBatch.deleteMany()).count;
      const repairFindings = (await tx.repairFinding.deleteMany()).count;
      const repairSources = (await tx.repairSource.deleteMany()).count;

      return { attendance, sessions, scheduleSlots, importBatches, repairFindings, repairSources };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
