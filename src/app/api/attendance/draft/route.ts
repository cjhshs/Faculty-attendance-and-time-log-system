import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { MAX_DRAFT_BYTES, parseDraftPayload } from "@/lib/attendance-draft";
import { writeAudit } from "@/lib/audit";

function validScope(scopeKey: string) {
  return scopeKey.startsWith("encode:") && scopeKey.length <= 300;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_ENCODE)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const scopeKey = new URL(request.url).searchParams.get("scopeKey") ?? "";
  if (!validScope(scopeKey)) {
    return NextResponse.json({ error: "Invalid draft scope." }, { status: 400 });
  }

  const draft = await prisma.attendanceDraft.findUnique({
    where: { userId_scopeKey: { userId: user.id, scopeKey } },
  });
  if (!draft) return NextResponse.json({ draft: null });

  return NextResponse.json({
    draft: { payload: draft.payload, version: draft.version, updatedAt: draft.updatedAt },
  });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_ENCODE)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    scopeKey?: string;
    payload?: unknown;
    baseVersion?: number;
  } | null;
  const scopeKey = String(body?.scopeKey ?? "").trim();
  if (!validScope(scopeKey)) {
    return NextResponse.json({ error: "Invalid draft scope." }, { status: 400 });
  }
  const payload = parseDraftPayload(body?.payload);
  if (!payload) return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
  if (JSON.stringify(payload).length > MAX_DRAFT_BYTES) {
    return NextResponse.json({ error: "Draft is too large." }, { status: 413 });
  }

  const existing = await prisma.attendanceDraft.findUnique({
    where: { userId_scopeKey: { userId: user.id, scopeKey } },
  });
  const baseVersion = Number.isInteger(body?.baseVersion) ? Number(body?.baseVersion) : 0;

  // A stale tab must not clobber a newer draft. The client can explicitly retry
  // after showing the conflict to the user.
  if (existing && baseVersion !== existing.version) {
    return NextResponse.json(
      {
        error: "A newer draft was saved by another tab.",
        conflict: true,
        latest: { payload: existing.payload, version: existing.version },
      },
      { status: 409 },
    );
  }

  const version = existing ? existing.version + 1 : 1;
  const saved = await prisma.attendanceDraft.upsert({
    where: { userId_scopeKey: { userId: user.id, scopeKey } },
    update: { payload: { ...payload, version, savedAt: new Date().toISOString() }, version },
    create: {
      userId: user.id,
      scopeKey,
      version,
      payload: { ...payload, version, savedAt: new Date().toISOString() },
    },
  });

  return NextResponse.json({ ok: true, version: saved.version, updatedAt: saved.updatedAt });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ATTENDANCE_ENCODE)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const scopeKey = new URL(request.url).searchParams.get("scopeKey") ?? "";
  if (!validScope(scopeKey)) {
    return NextResponse.json({ error: "Invalid draft scope." }, { status: 400 });
  }

  await prisma.attendanceDraft.deleteMany({ where: { userId: user.id, scopeKey } });
  await writeAudit(user.id, "attendance.draft.discard", `Discarded draft ${scopeKey}.`);
  return NextResponse.json({ ok: true });
}
