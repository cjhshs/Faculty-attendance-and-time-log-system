import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { commitPlan } from "@/lib/import";
import { writeAudit } from "@/lib/audit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { result } = await commitPlan(buffer);
    await writeAudit(
      user.id,
      "schedule.import",
      `Imported ${file.name}: ${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged.`,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed. No changes were saved." },
      { status: 400 },
    );
  }
}
