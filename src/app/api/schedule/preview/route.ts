import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { buildPlan } from "@/lib/import";
import { parseTerm } from "@/lib/terms";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const target = parseTerm(
    String(formData.get("schoolYear") ?? ""),
    String(formData.get("semester") ?? ""),
  );

  const buffer = Buffer.from(await file.arrayBuffer());
  const plan = await buildPlan(buffer, target);
  return NextResponse.json({ plan });
}
