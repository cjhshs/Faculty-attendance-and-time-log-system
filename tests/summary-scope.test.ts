import { describe, it, expect } from "vitest";
import { departmentSlotFilter } from "@/lib/summary";

describe("summary department scope", () => {
  it("filters by the registered faculty department code", () => {
    expect(departmentSlotFilter("cet")).toEqual({ faculty: { department: { code: "CET" } } });
  });

  it("treats unassigned as faculty without a department, not a program code", () => {
    expect(departmentSlotFilter("unassigned")).toEqual({ faculty: { departmentId: null } });
    expect(departmentSlotFilter(" UNASSIGNED ")).toEqual({ faculty: { departmentId: null } });
  });

  it("adds no filter for an empty department selection", () => {
    expect(departmentSlotFilter("")).toEqual({});
    expect(departmentSlotFilter(null)).toEqual({});
    expect(departmentSlotFilter(undefined)).toEqual({});
  });
});
