import { describe, it, expect } from "vitest";
import {
  isGeneralEducationSubject,
  isMajorSubjectForCourse,
  instructorQualifiesForCourse,
  getQualifiedFacultyIdsForCourse,
} from "@/lib/subject-classification";

describe("Subject Classification and Faculty Course Qualification (Rule B)", () => {
  describe("isGeneralEducationSubject", () => {
    it("identifies standard GE prefixes", () => {
      expect(isGeneralEducationSubject("GE101")).toBe(true);
      expect(isGeneralEducationSubject("GE401")).toBe(true);
      expect(isGeneralEducationSubject("GE 501")).toBe(true);
      expect(isGeneralEducationSubject("NSTP1")).toBe(true);
      expect(isGeneralEducationSubject("PATHFIT1")).toBe(true);
      expect(isGeneralEducationSubject("PE 1")).toBe(true);
      expect(isGeneralEducationSubject("FIL1")).toBe(true);
      expect(isGeneralEducationSubject("RIZAL")).toBe(true);
    });

    it("identifies GE subjects from description when subject code is generic", () => {
      expect(isGeneralEducationSubject("SUBJ1", "Purposive Communication")).toBe(true);
      expect(isGeneralEducationSubject("SUBJ2", "Mathematics in the Modern World")).toBe(true);
      expect(isGeneralEducationSubject("SUBJ3", "Understanding the Self")).toBe(true);
      expect(isGeneralEducationSubject("SUBJ4", "Civic Welfare Training Service")).toBe(true);
    });

    it("does not classify major subjects as GE", () => {
      expect(isGeneralEducationSubject("CC101")).toBe(false);
      expect(isGeneralEducationSubject("IT101")).toBe(false);
      expect(isGeneralEducationSubject("ITE211")).toBe(false);
      expect(isGeneralEducationSubject("CS101")).toBe(false);
      expect(isGeneralEducationSubject("AL102")).toBe(false);
      expect(isGeneralEducationSubject("BES112")).toBe(false);
      expect(isGeneralEducationSubject("PCE214")).toBe(false);
      expect(isGeneralEducationSubject("LIS101")).toBe(false);
    });
  });

  describe("isMajorSubjectForCourse", () => {
    it("recognizes BSIT major subjects", () => {
      expect(isMajorSubjectForCourse("CC101", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("CC102", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("ITE211", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("ITE313", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("CAP102", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("IM101", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("NET102", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("SIA101", "BSIT")).toBe(true);
      expect(isMajorSubjectForCourse("SP101", "BSIT")).toBe(true);
    });

    it("rejects GE subjects for BSIT even if enrolled in BSIT", () => {
      expect(isMajorSubjectForCourse("GE401", "BSIT")).toBe(false);
      expect(isMajorSubjectForCourse("GE101", "BSIT", "Purposive Communication")).toBe(false);
      expect(isMajorSubjectForCourse("NSTP1", "BSIT")).toBe(false);
      expect(isMajorSubjectForCourse("PATHFIT1", "BSIT")).toBe(false);
      expect(isMajorSubjectForCourse("FIL1", "BSIT")).toBe(false);
    });

    it("recognizes BSCS major subjects", () => {
      expect(isMajorSubjectForCourse("CC101", "BSCS")).toBe(true);
      expect(isMajorSubjectForCourse("AL102", "BSCS")).toBe(true);
      expect(isMajorSubjectForCourse("DS102", "BSCS")).toBe(true);
      expect(isMajorSubjectForCourse("THS101", "BSCS")).toBe(true);
      expect(isMajorSubjectForCourse("CSE311", "BSCS")).toBe(true);
      expect(isMajorSubjectForCourse("MCS311", "BSCS")).toBe(true);
      expect(isMajorSubjectForCourse("GE401", "BSCS")).toBe(false);
    });

    it("recognizes BLIS major subjects", () => {
      expect(isMajorSubjectForCourse("LIS101", "BLIS")).toBe(true);
      expect(isMajorSubjectForCourse("ICT102", "BLIS")).toBe(true);
      expect(isMajorSubjectForCourse("LISE01", "BLIS")).toBe(true);
      expect(isMajorSubjectForCourse("GE401", "BLIS")).toBe(false);
    });

    it("recognizes BSCE-SE major subjects", () => {
      expect(isMajorSubjectForCourse("BES112", "BSCE-SE")).toBe(true);
      expect(isMajorSubjectForCourse("PCE214", "BSCE-SE")).toBe(true);
      expect(isMajorSubjectForCourse("ACE313", "BSCE-SE")).toBe(true);
      expect(isMajorSubjectForCourse("GE401", "BSCE-SE")).toBe(false);
    });
  });

  describe("User Scenarios: Automatic Faculty Identification", () => {
    it("Scenario 1: Teacher teaching CC101 and GE401 -> QUALIFIES", () => {
      const slots = [
        { subject: "CC101", description: "Introduction to Computing" },
        { subject: "GE401", description: "Mathematics in the Modern World" },
      ];
      expect(instructorQualifiesForCourse(slots, "BSIT")).toBe(true);
    });

    it("Scenario 2: Teacher teaching ONLY GE401 -> DOES NOT AUTOMATICALLY QUALIFY", () => {
      const slots = [
        { subject: "GE401", description: "Mathematics in the Modern World" },
      ];
      expect(instructorQualifiesForCourse(slots, "BSIT")).toBe(false);
    });

    it("Scenario 3: Teacher teaching ONLY NSTP1 -> DOES NOT AUTOMATICALLY QUALIFY", () => {
      const slots = [
        { subject: "NSTP1", description: "National Service Training Program 1" },
      ];
      expect(instructorQualifiesForCourse(slots, "BSIT")).toBe(false);
    });

    it("Scenario 4: Teacher teaching ITE211 and Purposive Communication (GE101) -> QUALIFIES", () => {
      const slots = [
        { subject: "ITE211", description: "Platform Technologies" },
        { subject: "GE101", description: "Purposive Communication" },
      ];
      expect(instructorQualifiesForCourse(slots, "BSIT")).toBe(true);
    });
  });

  describe("getQualifiedFacultyIdsForCourse with Custom Faculty Additions & Exclusions", () => {
    const slots = [
      // Faculty 1: Teaches CC101 (Major) & GE401 -> Should qualify
      { facultyId: 1, subject: "CC101", description: "Intro to Computing" },
      { facultyId: 1, subject: "GE401", description: "Mathematics in the Modern World" },

      // Faculty 2: Teaches only GE401 -> Should NOT automatically qualify
      { facultyId: 2, subject: "GE401", description: "Mathematics in the Modern World" },

      // Faculty 3: Teaches only NSTP1 -> Should NOT automatically qualify
      { facultyId: 3, subject: "NSTP1", description: "National Service Training" },

      // Faculty 4: Teaches ITE211 (Major) & Purposive Communication -> Should qualify
      { facultyId: 4, subject: "ITE211", description: "Platform Technologies" },
      { facultyId: 4, subject: "GE101", description: "Purposive Communication" },
    ];

    it("filters faculty without manual overrides", () => {
      const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT");
      expect(qualified.has(1)).toBe(true);  // CC101 + GE401
      expect(qualified.has(2)).toBe(false); // only GE401
      expect(qualified.has(3)).toBe(false); // only NSTP1
      expect(qualified.has(4)).toBe(true);  // ITE211 + Purposive Communication
    });

    it("includes a GE-only teacher when manually added", () => {
      const manuallyAdded = new Set<number>([2]); // Faculty 2 manually added
      const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT", {
        manuallyAddedFacultyIds: manuallyAdded,
      });
      expect(qualified.has(1)).toBe(true);
      expect(qualified.has(2)).toBe(true); // Included because of manual addition!
      expect(qualified.has(3)).toBe(false);
      expect(qualified.has(4)).toBe(true);
    });

    it("excludes a major teacher when manually excluded", () => {
      const excluded = new Set<number>([1]); // Faculty 1 manually excluded
      const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT", {
        excludedFacultyIds: excluded,
      });
      expect(qualified.has(1)).toBe(false); // Excluded!
      expect(qualified.has(2)).toBe(false);
      expect(qualified.has(3)).toBe(false);
      expect(qualified.has(4)).toBe(true);
    });

    it("includes manually added faculty even if they have no regular slots in this course", () => {
      const manuallyAdded = new Set<number>([99]); // Guest faculty
      const qualified = getQualifiedFacultyIdsForCourse(slots, "BSIT", {
        manuallyAddedFacultyIds: manuallyAdded,
      });
      expect(qualified.has(99)).toBe(true);
    });
  });
});
