import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ALL_PERMISSIONS,
  DEAN_ROLE_NAME,
  STAFF_ROLE_NAME,
  DEAN_ASSISTANT_ROLE_NAME,
  STAFF_PERMISSIONS,
  PERMISSIONS,
} from "../src/lib/permissions";
import { programNameFor } from "../src/lib/program-names";

// The college's programs, so a fresh install is usable without an Excel upload.
const SEED_PROGRAMS = ["ACT", "BLIS", "BSCE-SE", "BSCS", "BSIT"];

const prisma = new PrismaClient();

const DEFAULT_SETTINGS: Record<string, string> = {
  school_header: "RAMON MAGSAYSAY MEMORIAL COLLEGES, INC.",
  college_header: "COLLEGE OF ENGINEERING AND TECHNOLOGY",
  address: "PIONEER AVE., GENERAL SANTOS CITY",
  prepared_by: "",
  checked_by: "",
  school_logo: "",
  college_logo: "",
  active_school_year: "2026-2027",
  active_semester: "1st Semester",
};

async function main() {
  // Permissions
  for (const permission of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: { description: permission.description },
      create: { name: permission.name, description: permission.description },
    });
  }
  const allPermissions = await prisma.permission.findMany();

  // Dean role: full access, protected.
  const deanRole = await prisma.role.upsert({
    where: { name: DEAN_ROLE_NAME },
    update: { canDelete: false, description: "Full access (protected)" },
    create: { name: DEAN_ROLE_NAME, description: "Full access (protected)", canDelete: false },
  });
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: deanRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: deanRole.id, permissionId: permission.id },
    });
  }

  // Staff role: print + encode + summary.
  const staffRole = await prisma.role.upsert({
    where: { name: STAFF_ROLE_NAME },
    update: { description: "Print sheets and encode attendance" },
    create: { name: STAFF_ROLE_NAME, description: "Print sheets and encode attendance" },
  });
  const staffPermissionIds = allPermissions
    .filter((p) => (STAFF_PERMISSIONS as string[]).includes(p.name))
    .map((p) => p.id);
  for (const permissionId of staffPermissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: staffRole.id, permissionId } },
      update: {},
      create: { roleId: staffRole.id, permissionId },
    });
  }

  // Dean's Assistant role: schedule import + data maintenance.
  const assistantRole = await prisma.role.upsert({
    where: { name: DEAN_ASSISTANT_ROLE_NAME },
    update: { description: "Schedule import and data maintenance" },
    create: { name: DEAN_ASSISTANT_ROLE_NAME, description: "Schedule import and data maintenance" },
  });
  const assistantPermissionNames: string[] = [
    PERMISSIONS.SCHEDULE_IMPORT,
    PERMISSIONS.SCHEDULE_EDIT,
    PERMISSIONS.SCHEDULE_REPAIR,
    PERMISSIONS.FACULTY_VIEW,
    PERMISSIONS.FACULTY_MANAGE,
    PERMISSIONS.ATTENDANCE_PRINT,
    PERMISSIONS.ATTENDANCE_ENCODE,
    PERMISSIONS.ATTENDANCE_EDIT_PAST,
    PERMISSIONS.CALENDAR_MANAGE,
    PERMISSIONS.SUMMARY_VIEW,
    PERMISSIONS.SUMMARY_PRINT,
    PERMISSIONS.SUMMARY_EXPORT,
  ];
  const assistantPermissionIds = allPermissions
    .filter((p) => assistantPermissionNames.includes(p.name))
    .map((p) => p.id);
  for (const permissionId of assistantPermissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: assistantRole.id, permissionId } },
      update: {},
      create: { roleId: assistantRole.id, permissionId },
    });
  }

  // Settings defaults
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.settings.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Programs
  for (const code of SEED_PROGRAMS) {
    const name = programNameFor(code);
    const existing = await prisma.course.findUnique({ where: { code } });
    if (existing) {
      if (!existing.name && name) await prisma.course.update({ where: { id: existing.id }, data: { name } });
    } else {
      await prisma.course.create({ data: { code, name } });
      console.log(`Created program ${code} (${name}).`);
    }
  }

  // First Dean account
  const username = process.env.SEED_DEAN_USERNAME || "dean";
  const password = process.env.SEED_DEAN_PASSWORD || "Dean@12345";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        name: "Dean",
        username,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: deanRole.id } });
    console.log(`Created Dean account "${username}" with password "${password}" (must change at first login).`);
  } else {
    console.log(`Dean account "${username}" already exists — leaving it unchanged.`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
