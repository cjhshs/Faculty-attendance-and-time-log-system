import type { Prisma, PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  DEAN_ASSISTANT_ROLE_NAME,
  DEAN_ROLE_NAME,
  PERMISSIONS,
  STAFF_PERMISSIONS,
  STAFF_ROLE_NAME,
  type PermissionKey,
} from "@/lib/permissions";
import { COLLEGE_DEFS, PROGRAM_CATALOG } from "@/lib/college-catalog";
import { programNameFor } from "@/lib/program-names";

type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_SETTINGS: Record<string, string> = {
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

const ASSISTANT_PERMISSIONS: PermissionKey[] = [
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

export type DefaultRole = {
  name: string;
  description: string;
  canDelete?: boolean;
  permissions: PermissionKey[] | "all";
};

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: DEAN_ROLE_NAME,
    description: "Full access (protected)",
    canDelete: false,
    permissions: "all",
  },
  {
    name: STAFF_ROLE_NAME,
    description: "Print sheets and encode attendance",
    permissions: STAFF_PERMISSIONS,
  },
  {
    name: DEAN_ASSISTANT_ROLE_NAME,
    description: "Schedule import and data maintenance",
    permissions: ASSISTANT_PERMISSIONS,
  },
];

export type ReferenceDataStats = {
  permissions: number;
  roles: number;
  rolePermissionsAdded: number;
  settingsAdded: number;
};

// Idempotent: creates anything missing and refreshes permission descriptions.
// It never deletes roles, users, permissions or settings added by an admin.
export async function ensureReferenceData(db: Db): Promise<ReferenceDataStats> {
  for (const permission of ALL_PERMISSIONS) {
    await db.permission.upsert({
      where: { name: permission.name },
      update: { description: permission.description },
      create: { name: permission.name, description: permission.description },
    });
  }

  const allPermissions = await db.permission.findMany();
  const permissionIdByName = new Map(allPermissions.map((p) => [p.name, p.id]));
  let rolePermissionsAdded = 0;

  for (const role of DEFAULT_ROLES) {
    const saved = await db.role.upsert({
      where: { name: role.name },
      update: {
        description: role.description,
        ...(role.canDelete === undefined ? {} : { canDelete: role.canDelete }),
      },
      create: {
        name: role.name,
        description: role.description,
        canDelete: role.canDelete ?? true,
      },
    });

    const names = role.permissions === "all" ? allPermissions.map((p) => p.name) : role.permissions;
    const rows = names
      .map((name) => permissionIdByName.get(name))
      .filter((id): id is number => typeof id === "number")
      .map((permissionId) => ({ roleId: saved.id, permissionId }));

    if (rows.length > 0) {
      const created = await db.rolePermission.createMany({ data: rows, skipDuplicates: true });
      rolePermissionsAdded += created.count;
    }
  }

  const settings = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
  const settingsCreated = await db.settings.createMany({ data: settings, skipDuplicates: true });

  return {
    permissions: allPermissions.length,
    roles: DEFAULT_ROLES.length,
    rolePermissionsAdded,
    settingsAdded: settingsCreated.count,
  };
}

export type CollegeCatalogStats = {
  colleges: number;
  programs: number;
  programsCreated: number;
};

export async function ensureCollegeCatalog(db: Db): Promise<CollegeCatalogStats> {
  const collegeIdByCode = new Map<string, number>();
  for (const def of COLLEGE_DEFS) {
    const college = await db.college.upsert({
      where: { code: def.code },
      update: { name: def.name, sortOrder: def.sortOrder },
      create: { code: def.code, name: def.name, sortOrder: def.sortOrder },
    });
    collegeIdByCode.set(college.code, college.id);
  }

  let programsCreated = 0;
  for (const program of PROGRAM_CATALOG) {
    const name = program.name || programNameFor(program.code);
    const collegeId = program.college ? collegeIdByCode.get(program.college) ?? null : null;
    const existing = await db.course.findUnique({ where: { code: program.code } });
    if (existing) {
      const data: {
        name?: string;
        collegeId?: number;
        sourceCode?: string;
        official?: boolean;
      } = {};
      if (!existing.name && name) data.name = name;
      if (existing.collegeId == null && collegeId != null) data.collegeId = collegeId;
      if (!existing.sourceCode) data.sourceCode = program.code;
      if (existing.official !== program.official) data.official = program.official;
      if (Object.keys(data).length > 0) {
        await db.course.update({ where: { id: existing.id }, data });
      }
    } else {
      await db.course.create({
        data: {
          code: program.code,
          name,
          collegeId,
          sourceCode: program.code,
          official: program.official,
        },
      });
      programsCreated += 1;
    }
  }

  return {
    colleges: COLLEGE_DEFS.length,
    programs: PROGRAM_CATALOG.length,
    programsCreated,
  };
}
