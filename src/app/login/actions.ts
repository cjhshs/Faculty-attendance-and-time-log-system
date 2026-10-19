"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { createSessionCookie, destroySession, getCurrentUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  if (!username || !password) return { error: "Enter your username and password." };

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.active) return { error: "Invalid username or password." };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Invalid username or password." };

  await createSessionCookie(user.id);
  await writeAudit(user.id, "login", `User ${user.username} signed in`);
  if (user.mustChangePassword) redirect("/change-password");
  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await writeAudit(user.id, "logout", `User ${user.username} signed out`);
  await destroySession();
  redirect("/login");
}

export type ChangePasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record) redirect("/login");
  const ok = await verifyPassword(current, record.passwordHash);
  if (!ok) return { error: "Current password is incorrect." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await writeAudit(user.id, "change_password", `User ${user.username} changed password`);
  redirect("/dashboard");
}
