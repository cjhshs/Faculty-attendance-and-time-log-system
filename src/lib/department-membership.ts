// Database-side department membership operations.
//
// All writes are explicit, transactional and audited. A membership change only
// updates `Faculty.departmentId`; it never edits, deletes or re-creates a
// schedule slot or an attendance row. Historical records stay attached to the
// faculty member and therefore remain visible under the new department.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  planRosterMembership,
  type InitialRosterCandidate,
  type MembershipFaculty,
  type RosterMembershipPlan,
} from "@/lib/faculty-membership";

type Db = PrismaClient | Prisma.TransactionClient;

export type MembershipImpact = {
  scheduleSlots: number;
  attendanceRecords: number;
};

export type DepartmentChange = {
  ok: boolean;
  changed: boolean;
  message: string;
  fromCode: string | null;
  toCode: string | null;
  impact: MembershipImpact;
};

type FacultyRow = {
  id: number;
  fullName: string;
  departmentId: number | null;
  department: { code: string; name: string } | null;
};

export async function getMembershipImpact(
  db: Db,
  facultyId: number,
): Promise<MembershipImpact> {
  const [scheduleSlots, attendanceRecords] = await Promise.all([
    db.scheduleSlot.count({ where: { facultyId } }),
    db.attendance.count({ where: { slot: { facultyId } } }),
  ]);
  return { scheduleSlots, attendanceRecords };
}

async function loadFaculty(db: Db, facultyId: number): Promise<FacultyRow | null> {
  return db.faculty.findUnique({
    where: { id: facultyId },
    select: {
      id: true,
      fullName: true,
      departmentId: true,
      department: { select: { code: true, name: true } },
    },
  });
}

function preservedText(impact: MembershipImpact): string {
  return `${impact.scheduleSlots} schedule slot(s) and ${impact.attendanceRecords} attendance record(s) preserved; no faculty, schedule or attendance row was deleted.`;
}

// Move one faculty member to a department, or to no department with `null`.
// The operation is a no-op (and writes no audit row) when the department is
// already the requested one.
export async function changeFacultyDepartment({
  facultyId,
  departmentId,
  actorId,
}: {
  facultyId: number;
  departmentId: number | null;
  actorId: number;
}): Promise<DepartmentChange> {
  if (!Number.isInteger(facultyId) || facultyId <= 0) {
    return {
      ok: false,
      changed: false,
      message: "Faculty is required.",
      fromCode: null,
      toCode: null,
      impact: { scheduleSlots: 0, attendanceRecords: 0 },
    };
  }

  return prisma.$transaction(async (tx) => {
    const faculty = await loadFaculty(tx, facultyId);
    if (!faculty) {
      return {
        ok: false,
        changed: false,
        message: "Faculty not found.",
        fromCode: null,
        toCode: null,
        impact: { scheduleSlots: 0, attendanceRecords: 0 },
      };
    }

    const college = departmentId
      ? await tx.college.findUnique({
          where: { id: departmentId },
          select: { id: true, code: true, name: true },
        })
      : null;
    if (departmentId !== null && !college) {
      return {
        ok: false,
        changed: false,
        message: "Department not found.",
        fromCode: faculty.department?.code ?? null,
        toCode: null,
        impact: { scheduleSlots: 0, attendanceRecords: 0 },
      };
    }

    const fromCode = faculty.department?.code ?? null;
    const toCode = college?.code ?? null;
    if (faculty.departmentId === departmentId) {
      return {
        ok: true,
        changed: false,
        message: `${faculty.fullName} is already in ${toCode ?? "no department"}.`,
        fromCode,
        toCode,
        impact: { scheduleSlots: 0, attendanceRecords: 0 },
      };
    }

    const impact = await getMembershipImpact(tx, facultyId);
    await tx.faculty.update({ where: { id: facultyId }, data: { departmentId } });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "faculty.department",
        details: `${faculty.fullName}: ${fromCode ?? "no department"} → ${
          toCode ?? "no department"
        }. ${preservedText(impact)}`,
      },
    });

    return {
      ok: true,
      changed: true,
      message: `${faculty.fullName} assigned to ${
        college ? `${college.code} — ${college.name}` : "No department"
      }. ${preservedText(impact)}`,
      fromCode,
      toCode,
      impact,
    };
  });
}

// Remove a faculty member from their department. This never deletes the faculty
// row, their schedules or their attendance; it only clears the roster field.
// `confirmed` must be true (the UI asks the administrator first).
export async function clearFacultyDepartment({
  facultyId,
  actorId,
  confirmed,
}: {
  facultyId: number;
  actorId: number;
  confirmed: boolean;
}): Promise<DepartmentChange> {
  if (!confirmed) {
    return {
      ok: false,
      changed: false,
      message: "Confirm removal from the department first.",
      fromCode: null,
      toCode: null,
      impact: { scheduleSlots: 0, attendanceRecords: 0 },
    };
  }
  if (!Number.isInteger(facultyId) || facultyId <= 0) {
    return {
      ok: false,
      changed: false,
      message: "Faculty is required.",
      fromCode: null,
      toCode: null,
      impact: { scheduleSlots: 0, attendanceRecords: 0 },
    };
  }

  return prisma.$transaction(async (tx) => {
    const faculty = await loadFaculty(tx, facultyId);
    if (!faculty) {
      return {
        ok: false,
        changed: false,
        message: "Faculty not found.",
        fromCode: null,
        toCode: null,
        impact: { scheduleSlots: 0, attendanceRecords: 0 },
      };
    }
    if (faculty.departmentId == null) {
      return {
        ok: true,
        changed: false,
        message: `${faculty.fullName} already has no department.`,
        fromCode: null,
        toCode: null,
        impact: { scheduleSlots: 0, attendanceRecords: 0 },
      };
    }

    const impact = await getMembershipImpact(tx, facultyId);
    await tx.faculty.update({ where: { id: facultyId }, data: { departmentId: null } });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "faculty.department.remove",
        details: `${faculty.fullName}: ${faculty.department?.code ?? "department"} → no department. ${preservedText(
          impact,
        )}`,
      },
    });

    return {
      ok: true,
      changed: true,
      message: `${faculty.fullName} removed from ${
        faculty.department?.code ?? "their department"
      }. ${preservedText(impact)}`,
      fromCode: faculty.department?.code ?? null,
      toCode: null,
      impact,
    };
  });
}

export type CetRosterResult = {
  ok: boolean;
  message: string;
  departmentCode: string;
  plan: RosterMembershipPlan;
  assigned: string[];
};

// Apply the explicit initial CET roster. Only candidates that match exactly one
// existing faculty row are assigned; missing or ambiguous names are reported for
// manual review and are never guessed or created. The operation is idempotent.
export async function applyInitialCetRoster({
  actorId,
  candidates,
  departmentCode = "CET",
}: {
  actorId: number;
  candidates: InitialRosterCandidate[];
  departmentCode?: string;
}): Promise<CetRosterResult> {
  const code = departmentCode.trim().toUpperCase();
  const college = await prisma.college.findUnique({
    where: { code },
    select: { id: true, code: true, name: true },
  });
  if (!college) {
    return {
      ok: false,
      message: `Department ${code} was not found. Nothing was changed.`,
      departmentCode: code,
      plan: {
        rows: [],
        toAssign: [],
        already: [],
        missing: [],
        ambiguous: [],
      },
      assigned: [],
    };
  }

  const rosterRows = await prisma.faculty.findMany({
    select: {
      id: true,
      fullName: true,
      department: { select: { code: true } },
    },
    orderBy: [{ surname: "asc" }, { fullName: "asc" }],
  });
  const roster: MembershipFaculty[] = rosterRows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    departmentCode: row.department?.code ?? null,
  }));
  const plan = planRosterMembership(candidates, roster, college.code);

  const assigned: string[] = [];
  if (plan.toAssign.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const row of plan.toAssign) {
        if (row.facultyId == null) continue;
        await tx.faculty.update({
          where: { id: row.facultyId },
          data: { departmentId: college.id },
        });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "faculty.department.roster",
            details: `${row.matches[0]?.fullName ?? row.candidate}: initial roster assigned to ${
              college.code
            } — ${college.name}. Source: ${row.source}`,
          },
        });
        assigned.push(row.matches[0]?.fullName ?? row.candidate);
      }
    });
  }

  const notes: string[] = [];
  if (assigned.length > 0) notes.push(`Assigned ${assigned.length} confirmed ${college.code} member(s).`);
  if (plan.already.length > 0) notes.push(`${plan.already.length} already correct.`);
  if (plan.missing.length > 0) {
    notes.push(
      `${plan.missing.length} candidate name(s) not found in the roster and were not created: ${plan.missing
        .map((row) => row.candidate)
        .join(", ")}.`,
    );
  }
  if (plan.ambiguous.length > 0) {
    notes.push(
      `${plan.ambiguous.length} candidate name(s) match more than one faculty row and need manual review: ${plan.ambiguous
        .map((row) => row.candidate)
        .join(", ")}.`,
    );
  }
  if (notes.length === 0) notes.push("No changes were needed.");

  return {
    ok: true,
    message: notes.join(" "),
    departmentCode: college.code,
    plan,
    assigned,
  };
}
