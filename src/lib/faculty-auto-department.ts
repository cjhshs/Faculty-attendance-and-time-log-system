// Conservative automatic department assignment.
//
// The only reliable relationship available in this database is:
//   Faculty -> ScheduleSlot -> Course -> College
// A faculty member's official department is NOT guessed from a name, a subject,
// a course code, or a single class. The suggestion is only emitted when *every*
// scheduled class for that faculty member maps to exactly one college and none
// of their classes is unassigned. Anything mixed or unmapped stays unresolved
// for a human reviewer. Existing manual assignments are never overwritten.

export type AutoDepartmentCollege = {
  id: number;
  code: string;
  name: string;
};

export type AutoDepartmentFaculty = {
  id: number;
  fullName: string;
  departmentId: number | null;
  // One entry per schedule slot. `null` means the course has no college.
  colleges: (AutoDepartmentCollege | null)[];
};

export type AutoDepartmentSuggestion = {
  facultyId: number;
  fullName: string;
  collegeId: number;
  collegeCode: string;
  collegeName: string;
};

export type AutoDepartmentUnresolved = {
  facultyId: number;
  fullName: string;
  reason: "no-schedule" | "mixed-colleges" | "unmapped-program";
  detail: string;
};

export type AutoDepartmentPlan = {
  candidates: number;
  alreadyAssigned: number;
  suggestions: AutoDepartmentSuggestion[];
  unresolved: AutoDepartmentUnresolved[];
};

export function planAutoDepartmentAssignments(
  rows: AutoDepartmentFaculty[],
): AutoDepartmentPlan {
  const suggestions: AutoDepartmentSuggestion[] = [];
  const unresolved: AutoDepartmentUnresolved[] = [];
  let alreadyAssigned = 0;
  let candidates = 0;

  for (const row of rows) {
    if (row.departmentId != null) {
      alreadyAssigned += 1;
      continue;
    }
    candidates += 1;

    if (row.colleges.length === 0) {
      unresolved.push({
        facultyId: row.id,
        fullName: row.fullName,
        reason: "no-schedule",
        detail: "No schedule slot is linked to this faculty member.",
      });
      continue;
    }

    const byId = new Map<number, AutoDepartmentCollege>();
    let hasUnmapped = false;
    for (const college of row.colleges) {
      if (!college) {
        hasUnmapped = true;
        continue;
      }
      byId.set(college.id, college);
    }

    if (byId.size === 0) {
      unresolved.push({
        facultyId: row.id,
        fullName: row.fullName,
        reason: "unmapped-program",
        detail: "Every scheduled program has no college assigned.",
      });
      continue;
    }
    if (byId.size > 1 || hasUnmapped) {
      const codes = Array.from(byId.values())
        .map((college) => college.code)
        .sort();
      unresolved.push({
        facultyId: row.id,
        fullName: row.fullName,
        reason: hasUnmapped ? "unmapped-program" : "mixed-colleges",
        detail: hasUnmapped
          ? `Schedules span ${codes.join(", ") || "no mapped college"} and at least one program has no college.`
          : `Schedules span more than one college (${codes.join(", ")}).`,
      });
      continue;
    }

    const [college] = Array.from(byId.values());
    suggestions.push({
      facultyId: row.id,
      fullName: row.fullName,
      collegeId: college.id,
      collegeCode: college.code,
      collegeName: college.name,
    });
  }

  suggestions.sort(
    (a, b) => a.collegeCode.localeCompare(b.collegeCode) || a.fullName.localeCompare(b.fullName),
  );
  unresolved.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { candidates, alreadyAssigned, suggestions, unresolved };
}

// Group suggestions by department so one updateMany can write each college.
export function groupSuggestionsByCollege(
  suggestions: AutoDepartmentSuggestion[],
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const suggestion of suggestions) {
    const ids = groups.get(suggestion.collegeId) ?? [];
    ids.push(suggestion.facultyId);
    groups.set(suggestion.collegeId, ids);
  }
  return groups;
}
