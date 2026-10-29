import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { clampSignatureField } from "@/lib/print-signature";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_PRINT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    scopeKey?: string;
    preparedBy?: string;
    preparedDesignation?: string;
    checkedBy?: string;
    checkedDesignation?: string;
  } | null;

  const scopeKey = String(body?.scopeKey ?? "").trim();
  if (!scopeKey || scopeKey.length > 300) {
    return NextResponse.json({ error: "Invalid signature scope." }, { status: 400 });
  }

  const values = {
    preparedBy: clampSignatureField(body?.preparedBy),
    preparedDesignation: clampSignatureField(body?.preparedDesignation),
    checkedBy: clampSignatureField(body?.checkedBy),
    checkedDesignation: clampSignatureField(body?.checkedDesignation),
  };

  try {
    const saved = await prisma.reportSignature.upsert({
      where: { scopeKey },
      update: { ...values, updatedById: user.id },
      create: { scopeKey, ...values, updatedById: user.id },
    });
    await writeAudit(
      user.id,
      "attendance.signature",
      `Saved prepared/checked by for ${scopeKey}.`,
    );
    return NextResponse.json({
      ok: true,
      signature: {
        preparedBy: saved.preparedBy,
        preparedDesignation: saved.preparedDesignation,
        checkedBy: saved.checkedBy,
        checkedDesignation: saved.checkedDesignation,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save signatories." },
      { status: 500 },
    );
  }
}
