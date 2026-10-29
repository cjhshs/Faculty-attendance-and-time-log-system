import type { AttendanceDraftPayload } from "@/lib/attendance-status";

export const MAX_DRAFT_BYTES = 200_000;

export function attendanceDraftScopeKey(input: {
  department?: string | null;
  courseCode?: string | null;
  date: string;
  schoolYear: string;
  semester: string;
}): string {
  const scope = (input.department || "").trim().toUpperCase() || (input.courseCode || "").trim().toUpperCase() || "all";
  return `encode:${scope}:${input.date}:${input.schoolYear}:${input.semester}`;
}

// A draft must never be used to finalize attendance. Anything that does not
// look like the tri-state payload is rejected rather than partially applied.
export function parseDraftPayload(raw: unknown): AttendanceDraftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as { cells?: unknown; version?: unknown; savedAt?: unknown; query?: unknown };
  if (!input.cells || typeof input.cells !== "object") return null;
  const cells: AttendanceDraftPayload["cells"] = {};
  for (const [key, value] of Object.entries(input.cells as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const cell = value as { status?: unknown; reason?: unknown; roomOverride?: unknown };
    const status =
      cell.status === "present" || cell.status === "absent" || cell.status === "unset"
        ? cell.status
        : "unset";
    cells[key] = {
      status,
      reason: String(cell.reason ?? "").slice(0, 500),
      roomOverride: String(cell.roomOverride ?? "").slice(0, 120),
    };
  }
  return {
    cells,
    version: typeof input.version === "number" ? input.version : undefined,
    savedAt: typeof input.savedAt === "string" ? input.savedAt : undefined,
    query: typeof input.query === "string" ? input.query.slice(0, 500) : undefined,
  };
}
