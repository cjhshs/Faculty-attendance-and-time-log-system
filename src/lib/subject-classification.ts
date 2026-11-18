import { normalizeCourseCode } from "@/lib/college-catalog";

/**
 * Prefixes for cross-cutting General Education, Physical Education,
 * and National Service Training Program subjects. These subjects are
 * taken by students across multiple programs and do not automatically
 * qualify an instructor as program/major faculty.
 */
export const GENERAL_EDUCATION_PREFIXES = [
  "GE",
  "NSTP",
  "PATHFIT",
  "PE",
  "CWTS",
  "ROTC",
  "LTS",
  "FIL",
  "LIT",
  "RIZAL",
  "BCOM",
] as const;

/**
 * Standard General Education course / subject description substrings.
 */
export const GENERAL_EDUCATION_DESCRIPTIONS = [
  "PURPOSIVE COMMUNICATION",
  "MATHEMATICS IN THE MODERN WORLD",
  "UNDERSTANDING THE SELF",
  "ART APPRECIATION",
  "THE CONTEMPORARY WORLD",
  "SCIENCE, TECHNOLOGY AND SOCIETY",
  "READINGS IN PHILIPPINE HISTORY",
  "ETHICS",
  "KONTEKSTWALISADONG KOMUNIKASYON",
  "MASINING NA PAGPAPAHAYAG",
  "BUHAY AT MGA SINULAT NI RIZAL",
  "PHYSICAL EDUCATION",
  "MOVEMENT COMPETENCY",
  "FITNESS",
  "CIVIC WELFARE TRAINING",
  "NATIONAL SERVICE TRAINING",
  "LIFE AND WORKS OF RIZAL",
  "BUSINESS COMMUNICATION",
] as const;

/**
 * Known Major / Professional subject prefixes by program code.
 */
export const PROGRAM_MAJOR_PREFIXES: Record<string, string[]> = {
  BSIT: [
    "CC",    // Computing Common (CC101, CC102, CC104, etc.)
    "IT",    // Information Technology
    "ITE",   // IT Electives (ITE211, ITE212, etc.)
    "CAP",   // Capstone Project
    "IM",    // Information Management
    "NET",   // Networking
    "PD",    // Professional Development / Project Design
    "SA",    // Systems Analysis
    "SIA",   // Systems Integration and Architecture
    "SP",    // Special Project
    "WS",    // Web Systems
    "HCI",   // Human Computer Interaction
    "IAS",   // Information Assurance and Security
    "AL",    // Algorithms
    "DS",    // Data Structures
    "MCS",   // Modern Computing Systems
    "CSD",   // Computer Science / IT Design
    "IPT",   // Integrative Programming and Technologies
    "MS",    // Management Information Systems
  ],
  BSCS: [
    "CC",    // Computing Common
    "CS",    // Computer Science
    "CSE",   // CS Electives
    "SC",    // Systems / Software
    "SP",    // Special Project
    "THS",   // Thesis
    "AL",    // Algorithms
    "DS",    // Data Structures
    "MCS",   // Discrete Math / Computing Systems
    "CSD",   // Computer Systems Design
    "HCI",   // Human Computer Interaction
    "IAS",   // Information Assurance and Security
    "SE",    // Software Engineering
    "DA",    // Design and Analysis
    "NC",    // Networks and Communications
  ],
  ACT: [
    "CC",
    "IT",
    "ACT",
    "CS",
    "SC",
    "SP",
    "ITE",
  ],
  BLIS: [
    "LIS",   // Library and Information Science
    "LISE",  // LIS Electives
    "ICT",   // Information and Communication Technology
    "SPT",   // Special Topics
    "LPR",   // Library Practice
  ],
  "BSCE-SE": [
    "BES",   // Basic Engineering Science
    "PCE",   // Professional Civil Engineering
    "PCS",   // Civil Engineering Specialization
    "ACE",   // Advanced Civil Engineering
    "CE",    // Civil Engineering
    "ESC",   // Engineering Science
    "SCI",   // Applied Engineering Sciences (e.g. SCI114)
  ],
  BSCE: [
    "BES",
    "PCE",
    "PCS",
    "ACE",
    "CE",
    "ESC",
    "SCI",
  ],
};

function extractPrefix(subject: string): string {
  const clean = subject.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = clean.match(/^[A-Z]+/);
  return match ? match[0] : "";
}

/**
 * Checks whether a subject is a General Education or shared non-major subject.
 */
export function isGeneralEducationSubject(
  subject: string,
  description?: string | null,
): boolean {
  if (!subject) return false;
  const upperSubject = subject.trim().toUpperCase();
  const prefix = extractPrefix(upperSubject);

  for (const gePrefix of GENERAL_EDUCATION_PREFIXES) {
    if (prefix === gePrefix || upperSubject.startsWith(gePrefix)) {
      return true;
    }
  }

  if (description) {
    const upperDesc = description.trim().toUpperCase();
    for (const geDesc of GENERAL_EDUCATION_DESCRIPTIONS) {
      if (upperDesc.includes(geDesc)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks whether a subject qualifies as a Major / Professional subject
 * for a specific academic course/program (Rule B).
 */
export function isMajorSubjectForCourse(
  subject: string,
  courseCode: string,
  description?: string | null,
): boolean {
  if (!subject) return false;
  const upperSubject = subject.trim().toUpperCase();
  const normCourse = normalizeCourseCode(courseCode);

  // If it's a known GE / non-major subject, it does NOT qualify as a major subject.
  if (isGeneralEducationSubject(upperSubject, description)) {
    return false;
  }

  const majorPrefixes = PROGRAM_MAJOR_PREFIXES[normCourse];
  if (majorPrefixes && majorPrefixes.length > 0) {
    const prefix = extractPrefix(upperSubject);
    return majorPrefixes.some((p) => prefix === p || upperSubject.startsWith(p));
  }

  // Fallback for programs without an explicit major prefix list:
  // Any subject that is NOT general education qualifies as a program subject.
  return true;
}

/**
 * Determines if an instructor automatically qualifies for a program's faculty list
 * based on Rule B (they teach at least one Major/Professional subject in that program).
 */
export function instructorQualifiesForCourse(
  facultySlots: { subject: string; description?: string | null }[],
  courseCode: string,
): boolean {
  return facultySlots.some((slot) =>
    isMajorSubjectForCourse(slot.subject, courseCode, slot.description),
  );
}

export type FacultyCourseQualificationOptions = {
  manuallyAddedFacultyIds?: Set<number>;
  excludedFacultyIds?: Set<number>;
};

/**
 * Evaluates a set of slots for a given course and determines which faculty IDs
 * qualify to appear on the attendance sheet:
 * - Automatically qualifies if teaching >= 1 major subject for that course.
 * - Included if in manuallyAddedFacultyIds.
 * - Excluded if in excludedFacultyIds.
 */
export function getQualifiedFacultyIdsForCourse<
  T extends { facultyId: number | null; subject: string; description?: string | null },
>(
  slots: T[],
  courseCode: string,
  options?: FacultyCourseQualificationOptions,
): Set<number> {
  const manualAdds = options?.manuallyAddedFacultyIds ?? new Set<number>();
  const exclusions = options?.excludedFacultyIds ?? new Set<number>();

  const slotsByFaculty = new Map<number, { subject: string; description?: string | null }[]>();
  for (const slot of slots) {
    if (slot.facultyId == null) continue;
    const list = slotsByFaculty.get(slot.facultyId) ?? [];
    list.push(slot);
    slotsByFaculty.set(slot.facultyId, list);
  }

  const qualified = new Set<number>();

  // Evaluate automatic qualification
  for (const [facultyId, facultySlots] of slotsByFaculty.entries()) {
    if (exclusions.has(facultyId)) continue;
    if (manualAdds.has(facultyId) || instructorQualifiesForCourse(facultySlots, courseCode)) {
      qualified.add(facultyId);
    }
  }

  // Also include manual additions that might not even have regular slots in this course
  for (const facultyId of manualAdds) {
    if (!exclusions.has(facultyId)) {
      qualified.add(facultyId);
    }
  }

  return qualified;
}
