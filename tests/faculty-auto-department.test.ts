import { describe, it, expect } from "vitest";
import {
  groupSuggestionsByCollege,
  planAutoDepartmentAssignments,
  type AutoDepartmentCollege,
} from "@/lib/faculty-auto-department";

const CET: AutoDepartmentCollege = { id: 1, code: "CET", name: "College of Engineering and Technology" };
const CBA: AutoDepartmentCollege = { id: 2, code: "CBA", name: "College of Business Administration" };

describe("automatic department assignment", () => {
  it("assigns only when every scheduled class maps to one college", () => {
    const plan = planAutoDepartmentAssignments([
      {
        id: 10,
        fullName: "Dela Cruz, Ana P.",
        departmentId: null,
        colleges: [CET, CET, CET],
      },
    ]);
    expect(plan.suggestions).toEqual([
      {
        facultyId: 10,
        fullName: "Dela Cruz, Ana P.",
        collegeId: CET.id,
        collegeCode: CET.code,
        collegeName: CET.name,
      },
    ]);
    expect(plan.unresolved).toHaveLength(0);
    expect(plan.candidates).toBe(1);
  });

  it("never guesses across two colleges", () => {
    const plan = planAutoDepartmentAssignments([
      {
        id: 11,
        fullName: "Santos, Ben L.",
        departmentId: null,
        colleges: [CET, CBA],
      },
    ]);
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.unresolved).toEqual([
      expect.objectContaining({
        facultyId: 11,
        reason: "mixed-colleges",
      }),
    ]);
  });

  it("treats a schedule with an unmapped program as unresolved", () => {
    const plan = planAutoDepartmentAssignments([
      {
        id: 12,
        fullName: "Reyes, Carla M.",
        departmentId: null,
        colleges: [CET, null],
      },
    ]);
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.unresolved[0]).toEqual(
      expect.objectContaining({ facultyId: 12, reason: "unmapped-program" }),
    );
  });

  it("keeps faculty with no schedule in the review list", () => {
    const plan = planAutoDepartmentAssignments([
      { id: 13, fullName: "Lim, Dan R.", departmentId: null, colleges: [] },
    ]);
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.unresolved[0]).toEqual(
      expect.objectContaining({ facultyId: 13, reason: "no-schedule" }),
    );
  });

  it("never overwrites a manual department", () => {
    const plan = planAutoDepartmentAssignments([
      { id: 14, fullName: "Cruz, Eve S.", departmentId: CBA.id, colleges: [CET] },
      { id: 15, fullName: "Tan, Fred A.", departmentId: null, colleges: [CET] },
    ]);
    expect(plan.alreadyAssigned).toBe(1);
    expect(plan.candidates).toBe(1);
    expect(plan.suggestions.map((s) => s.facultyId)).toEqual([15]);
  });

  it("groups suggestions by college without merging different colleges", () => {
    const groups = groupSuggestionsByCollege([
      {
        facultyId: 1,
        fullName: "A",
        collegeId: CET.id,
        collegeCode: CET.code,
        collegeName: CET.name,
      },
      {
        facultyId: 2,
        fullName: "B",
        collegeId: CBA.id,
        collegeCode: CBA.code,
        collegeName: CBA.name,
      },
      {
        facultyId: 3,
        fullName: "C",
        collegeId: CET.id,
        collegeCode: CET.code,
        collegeName: CET.name,
      },
    ]);
    expect(groups.get(CET.id)).toEqual([1, 3]);
    expect(groups.get(CBA.id)).toEqual([2]);
  });
});
