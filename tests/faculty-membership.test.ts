import { describe, it, expect } from "vitest";
import {
  INITIAL_CET_ROSTER,
  membershipImpactMessage,
  planRosterMembership,
  resolveInstructorLink,
  scheduleSlotKey,
  splitReprocessSlots,
  unresolvedAmbiguousReviews,
  type MembershipFaculty,
} from "@/lib/faculty-membership";
import { facultyNameKey, slotBelongsToDepartment } from "@/lib/faculty-department";

// A small roster that mirrors the real database shape: one CET member, one CBE
// member, one unassigned member, and a genuinely duplicated name with two
// different departments.
const roster: MembershipFaculty[] = [
  {
    id: 1,
    fullName: "Abueme, Kimberly Kate",
    departmentCode: "CET",
    departmentName: "College of Engineering and Technology",
  },
  {
    id: 2,
    fullName: "Cruz, Cbe Teacher",
    departmentCode: "CBE",
    departmentName: "College of Business Education",
  },
  {
    id: 3,
    fullName: "Unassigned, Nstp Teacher",
    departmentCode: null,
    departmentName: null,
  },
  { id: 4, fullName: "Doe, Jane", departmentCode: "CBE" },
  { id: 5, fullName: "DOE, JANE", departmentCode: "CET" },
];

function departmentOf(facultyId: number) {
  return roster.find((faculty) => faculty.id === facultyId)?.departmentCode ?? null;
}

// The subject/course a person teaches is deliberately not represented in these
// helpers. That is the point: membership comes only from the roster.
function cetMembershipFor(facultyId: number) {
  return slotBelongsToDepartment(
    { faculty: { departmentCode: departmentOf(facultyId) } },
    "CET",
  );
}

describe("department membership is a roster fact, not a subject fact", () => {
  it("1. classifies a CET faculty member teaching BSIT as CET", () => {
    const link = resolveInstructorLink("Abueme, Kimberly Kate", roster);
    expect(link).toEqual({ kind: "linked", facultyId: 1, via: "roster" });
    expect(cetMembershipFor(1)).toBe(true);
  });

  it("2. keeps the same CET faculty member in CET when teaching NSTP", () => {
    // NSTP / GE courses never appear in the membership lookup at all.
    expect(cetMembershipFor(1)).toBe(true);
    expect(resolveInstructorLink("  abueme ,  kimberly   kate ", roster)).toEqual({
      kind: "linked",
      facultyId: 1,
      via: "roster",
    });
  });

  it("3. keeps a CBE faculty member in CBE even when teaching a BSIT subject", () => {
    const link = resolveInstructorLink("Cruz, Cbe Teacher", roster);
    expect(link).toEqual({ kind: "linked", facultyId: 2, via: "roster" });
    expect(cetMembershipFor(2)).toBe(false);
    expect(
      slotBelongsToDepartment({ faculty: { departmentCode: departmentOf(2) } }, "CBE"),
    ).toBe(true);
  });

  it("4. does not automatically classify an unassigned faculty member as CET", () => {
    const link = resolveInstructorLink("Unassigned, Nstp Teacher", roster);
    expect(link).toEqual({ kind: "linked", facultyId: 3, via: "roster" });
    expect(departmentOf(3)).toBeNull();
    expect(cetMembershipFor(3)).toBe(false);
    expect(
      planRosterMembership(INITIAL_CET_ROSTER, roster, "CET").toAssign.map((row) => row.facultyId),
    ).not.toContain(3);
  });
});

describe("editable membership", () => {
  it("5. lets an administrator assign an existing faculty member to a department", () => {
    const plan = planRosterMembership(
      [
        {
          fullName: "Unassigned, Nstp Teacher",
          source: "Confirmed by the Dean on the Departments page.",
        },
      ],
      roster,
      "CET",
    );
    expect(plan.toAssign).toHaveLength(1);
    expect(plan.toAssign[0]).toMatchObject({
      status: "assign",
      facultyId: 3,
    });
    expect(plan.missing).toHaveLength(0);
  });

  it("6. removing membership preserves faculty, schedules and attendance", () => {
    const message = membershipImpactMessage("Abueme, Kimberly Kate", "CET", null, {
      scheduleSlots: 12,
      attendanceRecords: 7,
    });
    expect(message).toContain("CET → no department");
    expect(message).toContain("12 schedule slot(s)");
    expect(message).toContain("7 attendance record(s)");
    expect(message).toContain("no faculty, schedule or attendance row is deleted");
    // The roster row still exists; only its department value would become null.
    expect(roster.some((faculty) => faculty.id === 1)).toBe(true);
  });

  it("7. never guesses when a name matches more than one faculty row", () => {
    expect(resolveInstructorLink("Doe, Jane", roster)).toEqual({
      kind: "ambiguous",
      facultyIds: [4, 5],
    });
    expect(
      planRosterMembership(
        [{ fullName: "Doe, Jane", source: "Manual CET candidate" }],
        roster,
        "CET",
      ).ambiguous,
    ).toHaveLength(1);

    // A human choice is the only way through, and it is scoped to a candidate.
    const key = facultyNameKey("Doe, Jane");
    expect(resolveInstructorLink("Doe, Jane", roster, { [key]: 5 })).toEqual({
      kind: "linked",
      facultyId: 5,
      via: "explicit",
    });
    expect(resolveInstructorLink("Doe, Jane", roster, { [key]: 999 })).toEqual({
      kind: "invalid-explicit",
      facultyId: 999,
    });
    // An explicit choice cannot redirect the name to a different person.
    expect(resolveInstructorLink("Doe, Jane", roster, { [key]: 1 })).toEqual({
      kind: "invalid-explicit",
      facultyId: 1,
    });
  });

  it("8. matches formatting variants without merging different people", () => {
    expect(resolveInstructorLink(" DOE ,  JANE ", roster).kind).toBe("ambiguous");
    expect(resolveInstructorLink("Doe, Janet", roster).kind).toBe("create");
    expect(facultyNameKey("Abueme,  Kimberly Kate")).toBe(
      facultyNameKey(" abueme , kimberly   kate "),
    );
  });

  it("8b. blocks a write until every ambiguous name has a valid human choice", () => {
    const reviews = [
      {
        kind: "ambiguous",
        key: facultyNameKey("Doe, Jane"),
        name: "Doe, Jane",
        candidates: [{ facultyId: 4 }, { facultyId: 5 }],
      },
      {
        kind: "unknown",
        key: facultyNameKey("New, Hire"),
        name: "New, Hire",
        candidates: [],
      },
    ];

    expect(unresolvedAmbiguousReviews(reviews)).toEqual([reviews[0]]);
    expect(
      unresolvedAmbiguousReviews(reviews, { [facultyNameKey("Doe, Jane")]: 5 }),
    ).toEqual([]);
    // A choice outside the candidate list is not accepted.
    expect(
      unresolvedAmbiguousReviews(reviews, { [facultyNameKey("Doe, Jane")]: 1 }),
    ).toEqual([reviews[0]]);
  });
});

describe("safe reprocessing", () => {
  it("9. updates existing meetings in place and never plans a duplicate slot", () => {
    const existingKeys = new Set([
      scheduleSlotKey("44017", 1, "07:00", "09:00", "emm302"),
    ]);
    const slots = [
      {
        label: "already imported",
        cn: "44017",
        weekday: 1,
        start: "07:00",
        end: "09:00",
        roomCode: "EMM302",
      },
      {
        label: "would be new",
        cn: "44018",
        weekday: 1,
        start: "07:00",
        end: "09:00",
        roomCode: "EMM303",
      },
    ];
    const split = splitReprocessSlots(slots, existingKeys);
    expect(split.toWrite.map((slot) => slot.label)).toEqual(["already imported"]);
    expect(split.skipped.map((slot) => slot.label)).toEqual(["would be new"]);
    // The same class key is stable regardless of room-code case or padding.
    expect(scheduleSlotKey("44017", 1, "07:00", "09:00", " emm302 ")).toBe(
      scheduleSlotKey("44017", 1, "07:00", "09:00", "EMM302"),
    );
  });

  it("10. uses the current roster membership for future imports after a change", () => {
    const before = [{ id: 7, fullName: "Moved, Faculty", departmentCode: "CBE" }];
    const after = [{ id: 7, fullName: "Moved, Faculty", departmentCode: "CET" }];

    expect(
      slotBelongsToDepartment({ faculty: { departmentCode: before[0].departmentCode } }, "CET"),
    ).toBe(false);
    expect(resolveInstructorLink("Moved, Faculty", after)).toEqual({
      kind: "linked",
      facultyId: 7,
      via: "roster",
    });
    expect(
      slotBelongsToDepartment({ faculty: { departmentCode: after[0].departmentCode } }, "CET"),
    ).toBe(true);
  });

  it("11. keeps unknown and unassigned names for review instead of assigning CET", () => {
    expect(resolveInstructorLink("New, Hire", roster)).toEqual({ kind: "create" });
    const plan = planRosterMembership(INITIAL_CET_ROSTER, roster, "CET");
    expect(plan.missing.map((row) => row.candidate)).toEqual([]);
    expect(plan.toAssign.map((row) => row.candidate)).not.toContain("New, Hire");
  });
});

describe("documented initial CET roster", () => {
  it("contains only the confirmed member and is never inferred from schedules", () => {
    expect(INITIAL_CET_ROSTER.map((row) => row.fullName)).toEqual([
      "Abueme, Kimberly Kate",
    ]);
    expect(INITIAL_CET_ROSTER[0].source).toMatch(/Confirmed/);
  });

  it("is idempotent: an already-assigned member produces no write", () => {
    const plan = planRosterMembership(
      [{ fullName: "Abueme, Kimberly Kate", source: "test" }],
      roster,
      "CET",
    );
    expect(plan.already).toHaveLength(1);
    expect(plan.toAssign).toHaveLength(0);
  });
});
