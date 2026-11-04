// Apply the explicit, documented initial CET roster.
//
// This script is idempotent and deliberately narrow:
//   * only names listed in INITIAL_CET_ROSTER are considered;
//   * a name is assigned only when it matches exactly one existing faculty row;
//   * missing or duplicate names are reported and left untouched;
//   * no faculty row is ever created, merged or deleted;
//   * every assignment is audited against an active administrator.
//
// Run with: npm run seed:cet

import { PrismaClient } from "@prisma/client";
import {
  INITIAL_CET_ROSTER,
  planRosterMembership,
} from "../src/lib/faculty-membership";

const prisma = new PrismaClient();

async function main() {
  const college = await prisma.college.findUnique({
    where: { code: "CET" },
    select: { id: true, code: true, name: true },
  });
  if (!college) {
    throw new Error(
      'The CET department does not exist. Run "npm run seed" first so the college catalog is created.',
    );
  }

  const actor = await prisma.user.findFirst({
    where: {
      active: true,
      userRoles: {
        some: {
          role: {
            rolePermissions: {
              some: { permission: { name: "faculty.manage" } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
    select: { id: true, name: true, username: true },
  });
  if (!actor) {
    throw new Error(
      'No active user has the "faculty.manage" permission, so the roster change cannot be audited. Run "npm run seed" and sign in as the Dean first.',
    );
  }

  const faculty = await prisma.faculty.findMany({
    select: {
      id: true,
      fullName: true,
      department: { select: { code: true } },
    },
    orderBy: [{ surname: "asc" }, { fullName: "asc" }],
  });

  const plan = planRosterMembership(
    INITIAL_CET_ROSTER,
    faculty.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      departmentCode: row.department?.code ?? null,
    })),
    college.code,
  );

  console.log(`Initial CET roster: ${INITIAL_CET_ROSTER.length} documented candidate(s).`);
  for (const row of plan.rows) {
    const match = row.matches[0];
    console.log(
      `  - ${row.candidate}: ${row.status}` +
        (match ? ` (faculty #${match.id}, current department ${match.departmentCode ?? "none"})` : ""),
    );
  }

  if (plan.missing.length > 0) {
    console.warn(
      `  ! Not in the roster and NOT created: ${plan.missing
        .map((row) => row.candidate)
        .join(", ")}`,
    );
  }
  if (plan.ambiguous.length > 0) {
    console.warn(
      `  ! Matches more than one roster row, left for manual review: ${plan.ambiguous
        .map((row) => row.candidate)
        .join(", ")}`,
    );
  }

  let assigned = 0;
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
            userId: actor.id,
            action: "faculty.department.roster",
            details: `${row.matches[0]?.fullName ?? row.candidate}: initial roster assigned to ${
              college.code
            } — ${college.name}. Source: ${row.source}`,
          },
        });
        assigned += 1;
      }
    });
  }

  console.log(
    `Done. Assigned ${assigned}, already correct ${plan.already.length}, missing ${plan.missing.length}, ambiguous ${plan.ambiguous.length}. ` +
      `Actor: ${actor.name} (${actor.username}).`,
  );
  if (assigned === 0 && plan.missing.length === 0 && plan.ambiguous.length === 0) {
    console.log("No changes were needed.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
