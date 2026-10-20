import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { commitPlan } from "@/lib/import";
import { parseTerm } from "@/lib/terms";
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

  const target = parseTerm(String(form.get("schoolYear") ?? ""), String(form.get("semester") ?? ""));

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { result } = await commitPlan(buffer, target, {
      filename: file.name,
      importedById: user.id,
    });
    const termLabel = target ? ` into ${target.schoolYear} ${target.semester}` : "";
    await writeAudit(
      user.id,
      "schedule.import",
      `Imported ${file.name}${termLabel}: ${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged.${result.batchId ? ` Batch #${result.batchId}.` : ""}`,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed. No changes were saved." },
      { status: 400 },
    );
  }
}
