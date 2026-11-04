// Department membership helpers.
//
// A faculty member's department is a roster fact (`Faculty.departmentId`). It is
// never inferred from a course, a subject, an imported schedule or the students'
// program. These helpers are deliberately pure so the same rules are used by the
// initial roster, the importer and the tests.

import { facultyNameKey } from "./faculty-department";

export type MembershipFaculty = {
  id: number;
  fullName: string;
  departmentCode?: string | null;
  departmentName?: string | null;
};

export type InitialRosterCandidate = {
  fullName: string;
  // Where the name came from. Kept in the UI so an administrator can review the
  // starting roster instead of treating it as an invisible automatic rule.
  source: string;
};

// The initial CET roster is an explicit, editable starting list. It contains
// only faculty whose CET membership was already confirmed by an administrator.
// It intentionally does NOT contain everyone who teaches a CET-related subject:
// doing that would silently classify the 310 unassigned faculty members.
//
// Add further confirmed names here (or through the Departments page) and run
// `npm run seed:cet`. The seed is idempotent and never creates faculty rows.
export const INITIAL_CET_ROSTER: InitialRosterCandidate[] = [
  {
    fullName: "Abueme, Kimberly Kate",
    source:
      "Confirmed CET assignment in the existing roster (audit entry faculty.department, 2026-10-29).",
  },
];

export type RosterMembershipStatus = "already" | "assign" | "missing" | "ambiguous";

export type RosterMembershipRow = {
  candidate: string;
  source: string;
  status: RosterMembershipStatus;
  facultyId: number | null;
  matches: {
    id: number;
    fullName: string;
    departmentCode: string | null;
  }[];
};

export type RosterMembershipPlan = {
  rows: RosterMembershipRow[];
  toAssign: RosterMembershipRow[];
  already: RosterMembershipRow[];
  missing: RosterMembershipRow[];
  ambiguous: RosterMembershipRow[];
};

// Match explicit candidates against the existing roster by the same safe name
// key the importer uses. A candidate that matches zero or several roster rows is
// reported, never created and never guessed.
export function planRosterMembership(
  candidates: InitialRosterCandidate[],
  roster: MembershipFaculty[],
  departmentCode: string,
): RosterMembershipPlan {
  const target = departmentCode.trim().toUpperCase();
  const rows: RosterMembershipRow[] = candidates.map((candidate) => {
    const key = facultyNameKey(candidate.fullName);
    const matches = roster
      .filter((faculty) => facultyNameKey(faculty.fullName) === key)
      .map((faculty) => ({
        id: faculty.id,
        fullName: faculty.fullName,
        departmentCode: faculty.departmentCode ?? null,
      }));

    if (matches.length === 0) {
      return {
        candidate: candidate.fullName,
        source: candidate.source,
        status: "missing",
        facultyId: null,
        matches: [],
      };
    }
    if (matches.length > 1) {
      return {
        candidate: candidate.fullName,
        source: candidate.source,
        status: "ambiguous",
        facultyId: null,
        matches,
      };
    }

    const [match] = matches;
    const already = (match.departmentCode ?? "").toUpperCase() === target;
    return {
      candidate: candidate.fullName,
      source: candidate.source,
      status: already ? "already" : "assign",
      facultyId: match.id,
      matches,
    };
  });

  return {
    rows,
    toAssign: rows.filter((row) => row.status === "assign"),
    already: rows.filter((row) => row.status === "already"),
    missing: rows.filter((row) => row.status === "missing"),
    ambiguous: rows.filter((row) => row.status === "ambiguous"),
  };
}

export type InstructorLink =
  | { kind: "linked"; facultyId: number; via: "roster" | "explicit" }
  | { kind: "ambiguous"; facultyIds: number[] }
  | { kind: "invalid-explicit"; facultyId: number }
  | { kind: "create" };

// Ambiguous duplicate names block a write unless an explicit choice points at
// one of that name's own candidate rows. This is the single rule used by the
// import transaction and its tests.
export function unresolvedAmbiguousReviews<
  T extends {
    kind: string;
    key: string;
    candidates: { facultyId: number }[];
  },
>(entries: T[], assignments: Record<string, number> = {}): T[] {
  return entries.filter((entry) => {
    if (entry.kind !== "ambiguous") return false;
    const chosen = assignments[entry.key];
    return (
      chosen === undefined ||
      !entry.candidates.some((candidate) => candidate.facultyId === chosen)
    );
  });
}

// Resolve one imported instructor name to a roster row.
//
// - An explicit administrator choice (keyed by the normalized instructor name)
//   always wins, which is how ambiguous duplicate names are resolved by hand.
// - Otherwise exactly one normalized match is linked.
// - Several matches are reported as ambiguous and are never auto-selected.
// - No match returns "create"; the importer creates a faculty row with no
//   department, so it appears in the review list instead of becoming CET.
export function resolveInstructorLink(
  name: string,
  roster: MembershipFaculty[],
  assignments: Record<string, number> = {},
): InstructorLink {
  const key = facultyNameKey(name);
  const explicit = assignments[key];
  if (explicit !== undefined) {
    // An explicit choice may only select one of the rows that actually carry
    // this normalized name. It cannot redirect a name to an unrelated faculty
    // member, so a mistyped payload cannot re-link history to the wrong person.
    const match = roster.find((faculty) => faculty.id === explicit);
    return match && facultyNameKey(match.fullName) === key
      ? { kind: "linked", facultyId: match.id, via: "explicit" }
      : { kind: "invalid-explicit", facultyId: explicit };
  }

  const matches = roster.filter((faculty) => facultyNameKey(faculty.fullName) === key);
  if (matches.length === 1) {
    return { kind: "linked", facultyId: matches[0].id, via: "roster" };
  }
  if (matches.length > 1) {
    return { kind: "ambiguous", facultyIds: matches.map((faculty) => faculty.id) };
  }
  return { kind: "create" };
}

// Stable identity of one meeting. Room codes are used rather than ids so the key
// is the same before and after master data is created, and every write path
// (preview, import, reprocess, repair) can match the same class in place.
export function scheduleSlotKey(
  cn: string,
  weekday: number,
  start: string,
  end: string,
  roomCode: string,
): string {
  return `${cn.trim()}\u0000${weekday}\u0000${start.trim()}\u0000${end.trim()}\u0000${roomCode
    .trim()
    .toUpperCase()}`;
}

// Reprocessing must never create a second copy of a class. Split a plan into the
// meetings that already exist in the target term and the ones that would be new.
// Only the existing ones are written; everything else is reported as skipped.
export function splitReprocessSlots<T extends {
  cn: string;
  weekday: number;
  start: string;
  end: string;
  roomCode: string;
}>(
  slots: T[],
  existingKeys: Set<string>,
): { toWrite: T[]; skipped: T[] } {
  const toWrite: T[] = [];
  const skipped: T[] = [];
  for (const slot of slots) {
    if (existingKeys.has(scheduleSlotKey(slot.cn, slot.weekday, slot.start, slot.end, slot.roomCode))) {
      toWrite.push(slot);
    } else {
      skipped.push(slot);
    }
  }
  return { toWrite, skipped };
}

// Plain-language description of what a membership change does to historical
// records. Used by the management UI so the confirmation states the truth:
// nothing is deleted or rewritten.
export function membershipImpactMessage(
  facultyName: string,
  fromDepartment: string | null,
  toDepartment: string | null,
  impact: { scheduleSlots: number; attendanceRecords: number },
): string {
  const from = fromDepartment ?? "no department";
  const to = toDepartment ?? "no department";
  return `${facultyName}: ${from} → ${to}. ${impact.scheduleSlots} schedule slot(s) and ${impact.attendanceRecords} attendance record(s) are preserved; no faculty, schedule or attendance row is deleted.`;
}
