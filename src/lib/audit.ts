import { prisma } from "@/lib/prisma";

export async function writeAudit(userId: number, action: string, details?: string) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, details: details ?? null },
    });
  } catch {
    // Audit failures must never break the main action.
  }
}
