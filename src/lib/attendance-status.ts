// Tri-state attendance helpers shared by the API, the encoding UI, summaries and
// the print pages.
//
// IMPORTANT: an unencoded hour is represented by `NULL` in the database (or by a
// missing row), never by `false`. `false` means the staff explicitly marked the
// faculty member absent.

export type AttendanceStatus = "unset" | "present" | "absent";

export type AttendanceCounts = {
  present: number;
  absent: number;
  unencoded: number;
  total: number;
};

export function statusFromPresent(present: boolean | null | undefined): AttendanceStatus {
  if (present === true) return "present";
  if (present === false) return "absent";
  return "unset";
}

// Converts the UI value to the database value. Undefined means "the caller did
// not change the status", which callers must not turn into NULL.
export function presentFromStatus(status: AttendanceStatus): boolean | null {
  if (status === "present") return true;
  if (status === "absent") return false;
  return null;
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === "unset" || value === "present" || value === "absent";
}

export function isPresentValue(value: unknown): value is boolean | null {
  return value === true || value === false || value === null;
}

// A reason is required for an explicit absence and capped to a sane length.
// Present/unencoded hours may keep an empty reason.
export function validateAttendanceReason(
  status: AttendanceStatus,
  reason: string | null | undefined,
): { ok: true; reason: string | null } | { ok: false; message: string } {
  const trimmed = String(reason ?? "").trim();
  if (trimmed.length > 500) {
    return { ok: false, message: "Absence reason must be 500 characters or fewer." };
  }
  if (status === "absent" && trimmed.length < 2) {
    return { ok: false, message: "An absence reason is required (at least 2 characters)." };
  }
  if (status !== "absent" && trimmed.length > 0 && trimmed.length < 2) {
    return { ok: false, message: "Reason must be at least 2 characters or left blank." };
  }
  return { ok: true, reason: trimmed || null };
}

export function countAttendanceStatuses(
  values: Iterable<boolean | null | undefined>,
): AttendanceCounts {
  let present = 0;
  let absent = 0;
  let unencoded = 0;
  let total = 0;
  for (const value of values) {
    total += 1;
    if (value === true) present += 1;
    else if (value === false) absent += 1;
    else unencoded += 1;
  }
  return { present, absent, unencoded, total };
}

// Status for one day given its encoded hours. Days with no encoded hours are
// neither present nor absent (they are incomplete/not encoded).
export function classifyDay(
  counts: AttendanceCounts,
): "present" | "absent" | "partial" | "unencoded" {
  const encoded = counts.present + counts.absent;
  if (encoded === 0) return "unencoded";
  if (counts.present === 0) return "absent";
  if (counts.absent === 0) return "present";
  return "partial";
}

// ---------------------------------------------------------------------------
// Draft payload merge
// ---------------------------------------------------------------------------

export type AttendanceDraftCell = {
  status: AttendanceStatus;
  reason: string;
  roomOverride: string;
};

export type AttendanceDraftPayload = {
  // `version` is echoed back so concurrent tabs cannot silently overwrite a
  // newer draft. `savedAt` is informational only.
  version?: number;
  savedAt?: string;
  cells: Record<string, AttendanceDraftCell>;
  query?: string;
};

export function emptyDraft(): AttendanceDraftPayload {
  return { cells: {} };
}

// Merge a saved draft with the official rows. Official finalized statuses always
// win; the draft only fills hours that are still unencoded. This prevents a
// stale draft from replacing newer attendance work.
export function mergeDraftWithOfficial<
  T extends { status: AttendanceStatus; reason: string; roomOverride: string },
>(official: Record<string, T>, draft: AttendanceDraftPayload | null | undefined): Record<string, T> {
  const merged: Record<string, T> = { ...official };
  if (!draft) return merged;
  for (const [key, draftCell] of Object.entries(draft.cells)) {
    const current = merged[key];
    if (!current) {
      merged[key] = draftCell as unknown as T;
      continue;
    }
    // Official status is authoritative once it has been explicitly encoded.
    const status = current.status !== "unset" ? current.status : draftCell.status;
    merged[key] = {
      ...current,
      status,
      reason: current.reason || draftCell.reason || "",
      roomOverride: current.roomOverride || draftCell.roomOverride || "",
    };
  }
  return merged;
}

export function draftHasChanges(draft: AttendanceDraftPayload | null | undefined): boolean {
  if (!draft) return false;
  return Object.values(draft.cells).some(
    (cell) => cell.status !== "unset" || !!cell.reason || !!cell.roomOverride,
  );
}
