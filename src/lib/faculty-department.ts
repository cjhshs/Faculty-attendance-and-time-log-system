// Faculty roster matching used by the Excel parser and the attendance scopes.
//
// A faculty member's department is NEVER inferred from a course code, a subject
// or the students' program. The roster row (Faculty.departmentId) is the only
// source of truth. Unknown or ambiguous instructor names are reported for
// review instead of being assigned a department.

export type RosterFaculty = {
  id: number;
  fullName: string;
  departmentCode?: string | null;
  departmentName?: string | null;
  active?: boolean;
};

export type InstructorMatch =
  | { kind: "matched"; faculty: RosterFaculty; key: string }
  | { kind: "unknown"; key: string; similar: RosterFaculty[] }
  | { kind: "ambiguous"; key: string; candidates: RosterFaculty[] }
  | { kind: "tba" };

// Safe canonical form for comparison only. It handles capitalization, repeated
// whitespace, curly apostrophes, and "SURNAME, First M." vs "Surname, First M.".
// It deliberately does not remove middle initials or reorder name tokens, so
// two genuinely different people are never merged by a loose heuristic.
export function facultyNameKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\.\s*/g, ".")
    .trim()
    .toLowerCase();
}

function lettersOnly(value: string): string {
  return facultyNameKey(value).replace(/[^a-z]/g, "");
}

// Character-bigram similarity, used only to suggest possible duplicates for a
// human reviewer. It is never used to auto-select a faculty member.
export function nameSimilarity(a: string, b: string): number {
  const s1 = lettersOnly(a);
  const s2 = lettersOnly(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const grams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i++) set.add(value.slice(i, i + 2));
    return set;
  };
  const a2 = grams(s1);
  const b2 = grams(s2);
  let overlap = 0;
  for (const gram of a2) if (b2.has(gram)) overlap += 1;
  return (2 * overlap) / (a2.size + b2.size);
}

export function matchInstructor(
  raw: string | null | undefined,
  roster: RosterFaculty[],
): InstructorMatch {
  const trimmed = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.toUpperCase() === "TBA") return { kind: "tba" };

  const key = facultyNameKey(trimmed);
  const exact = roster.filter((f) => facultyNameKey(f.fullName) === key);
  if (exact.length === 1) return { kind: "matched", faculty: exact[0], key };
  if (exact.length > 1) return { kind: "ambiguous", key, candidates: exact };

  // The roster may already contain the same person twice with formatting that
  // collapses to the same key; that is still ambiguous, never a silent merge.
  const similar = roster
    .map((faculty) => ({ faculty, score: nameSimilarity(trimmed, faculty.fullName) }))
    .filter((entry) => entry.score >= 0.86)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.faculty);

  return { kind: "unknown", key, similar };
}

export type DuplicateFacultyGroup = {
  key: string;
  fullName: string;
  ids: number[];
  departmentCodes: (string | null)[];
};

// Group roster rows that collapse to the same safe name key. This is a review
// signal only: duplicates are never merged, reassigned or deleted automatically,
// because two people can genuinely share a name.
export function findDuplicateFacultyRows(
  rows: { id: number; fullName: string; departmentCode?: string | null }[],
): DuplicateFacultyGroup[] {
  const groups = new Map<string, DuplicateFacultyGroup>();
  for (const row of rows) {
    const key = facultyNameKey(row.fullName);
    if (!key) continue;
    const group = groups.get(key) ?? {
      key,
      fullName: row.fullName.trim().replace(/\s+/g, " "),
      ids: [],
      departmentCodes: [],
    };
    group.ids.push(row.id);
    group.departmentCodes.push(row.departmentCode ?? null);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .filter((group) => group.ids.length > 1)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// A slot belongs to a department only through its faculty's registered
// department. A slot without a faculty has no department.
export function slotBelongsToDepartment(
  slot: { faculty: { departmentCode?: string | null } | null },
  departmentCode: string | null | undefined,
): boolean {
  const code = (departmentCode ?? "").trim();
  if (!code) return true;
  return (slot.faculty?.departmentCode ?? "").toUpperCase() === code.toUpperCase();
}

export function departmentFilterWhere(departmentCode: string | null | undefined) {
  const code = (departmentCode ?? "").trim();
  if (!code) return {};
  return { faculty: { department: { code } } };
}
