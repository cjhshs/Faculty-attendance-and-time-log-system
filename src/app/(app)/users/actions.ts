"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PERMISSIONS, DEAN_ROLE_NAME } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; message: string };

async function permissionsForRoles(roleIds: number[]): Promise<Set<string>> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    include: { permission: true },
  });
  return new Set(rows.map((r) => r.permission.name));
}

async function activeDeanCount(excludeUserId?: number): Promise<number> {
  return prisma.user.count({
    where: {
      active: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      userRoles: { some: { role: { name: DEAN_ROLE_NAME } } },
    },
  });
}

function roleIdsFrom(formData: FormData): number[] {
  return formData
    .getAll("roleIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.USERS_MANAGE);
  const name = String(formData.get("name") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const roleIds = roleIdsFrom(formData);

  if (!name || !username) return { ok: false, message: "Name and username are required." };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (roleIds.length === 0) return { ok: false, message: "Assign at least one role." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { ok: false, message: "That username is already taken." };

  // A user may only grant permissions they themselves hold.
  const requested = await permissionsForRoles(roleIds);
  for (const permission of requested) {
    if (!actor.permissions.includes(permission)) {
      return { ok: false, message: `You cannot grant the permission "${permission}".` };
    }
  }

  const user = await prisma.user.create({
    data: { name, username, passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: user.id, roleId })) });
  await writeAudit(actor.id, "user.create", `Created user ${username}`);
  revalidatePath("/users");
  return { ok: true, message: `Created user ${username}.` };
}

export async function assignRoles(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.USERS_MANAGE);
  const userId = Number(formData.get("userId"));
  const roleIds = roleIdsFrom(formData);
  if (roleIds.length === 0) return { ok: false, message: "A user must have at least one role." };

  const deanRole = await prisma.role.findUnique({ where: { name: DEAN_ROLE_NAME } });

  const requested = await permissionsForRoles(roleIds);
  for (const permission of requested) {
    if (!actor.permissions.includes(permission)) {
      return { ok: false, message: `You cannot grant the permission "${permission}".` };
    }
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "User not found." };

  const keepsDean = deanRole ? roleIds.includes(deanRole.id) : false;
  if (target.active && deanRole && !keepsDean && (await activeDeanCount(userId)) === 0) {
    return { ok: false, message: "At least one active Dean must remain." };
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) }),
  ]);
  await writeAudit(actor.id, "user.roles", `Updated roles for user #${userId}`);
  revalidatePath("/users");
  return { ok: true, message: "Roles updated." };
}

export async function toggleUserActive(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.USERS_MANAGE);
  const userId = Number(formData.get("userId"));
  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!target) return { ok: false, message: "User not found." };
  if (target.id === actor.id) return { ok: false, message: "You cannot deactivate your own account." };

  if (target.active) {
    const isDean = target.userRoles.some((ur) => ur.role.name === DEAN_ROLE_NAME);
    if (isDean && (await activeDeanCount(userId)) === 0) {
      return { ok: false, message: "At least one active Dean must remain." };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { active: !target.active } });
  await writeAudit(actor.id, "user.toggle", `User #${userId} active=${!target.active}`);
  revalidatePath("/users");
  return { ok: true, message: target.active ? "User deactivated." : "User activated." };
}

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.USERS_MANAGE);
  const userId = Number(formData.get("userId"));
  const password = String(formData.get("password") || "");
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await writeAudit(actor.id, "user.reset_password", `Reset password for user #${userId}`);
  revalidatePath("/users");
  return { ok: true, message: "Password reset. The user must change it at next login." };
}

export async function createRole(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.ROLES_MANAGE);
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const permissionIds = formData
    .getAll("permissionIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (!name) return { ok: false, message: "Role name is required." };

  const exists = await prisma.role.findUnique({ where: { name } });
  if (exists) return { ok: false, message: "That role already exists." };

  const permissions = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
  });
  for (const p of permissions) {
    if (!actor.permissions.includes(p.name)) {
      return { ok: false, message: `You cannot grant the permission "${p.name}".` };
    }
  }

  const role = await prisma.role.create({ data: { name, description } });
  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }
  await writeAudit(actor.id, "role.create", `Created role ${name}`);
  revalidatePath("/users");
  return { ok: true, message: `Created role ${name}.` };
}

export async function updateRolePermissions(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.ROLES_MANAGE);
  const roleId = Number(formData.get("roleId"));
  const permissionIds = formData
    .getAll("permissionIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, message: "Role not found." };

  const permissions = await prisma.permission.findMany({ where: { id: { in: permissionIds } } });
  for (const p of permissions) {
    if (!actor.permissions.includes(p.name)) {
      return { ok: false, message: `You cannot grant the permission "${p.name}".` };
    }
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);
  await writeAudit(actor.id, "role.permissions", `Updated permissions for role #${roleId}`);
  revalidatePath("/users");
  return { ok: true, message: "Role permissions updated." };
}

export async function deleteRole(formData: FormData): Promise<ActionResult> {
  const actor = await assertPermission(PERMISSIONS.ROLES_MANAGE);
  const roleId = Number(formData.get("roleId"));
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { userRoles: true },
  });
  if (!role) return { ok: false, message: "Role not found." };
  if (!role.canDelete) return { ok: false, message: "This role is protected and cannot be deleted." };
  if (role.userRoles.length > 0)
    return { ok: false, message: "Remove this role from all users before deleting it." };

  await prisma.role.delete({ where: { id: roleId } });
  await writeAudit(actor.id, "role.delete", `Deleted role ${role.name}`);
  revalidatePath("/users");
  return { ok: true, message: "Role deleted." };
}
