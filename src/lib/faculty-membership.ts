// Department membership helpers.
//
// A faculty member's department is a roster fact (`Faculty.departmentId`). It is
// never inferred from a course, a subject, an imported schedule or the students'
// program. These helpers are deliberately pure so the same rules are used by the
// initial roster, the importer and the tests.

import { facultyNameKey, facultyNameMatches } from "./faculty-department";

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
    fullName: "Aban, Marianita",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "ABDURAJIK, BASIREN SAMBUTOAN",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Abueme, Kimberly Kate",
    source: "Confirmed CET assignment in the existing roster (audit entry faculty.department, 2026-10-29).",
  },
  {
    fullName: "Alarcio, Daniel Jade Hibune",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Alib, Alan Wright",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Alupit, Baby Jane Degino",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "AMBOY, FRYON GIL",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Arriza, Rolando Ragusta",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "ATIENZA, JURIELHYN Suardiana",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Ayunan, Aaron Milanes",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Bachicha, Hubert Von Valencia",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Bantilan, Rudelyn Villarico",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "BARASAN, GARY MACASLING",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Barrientos, Angelo Bioco",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Bayoran, Kris Anjiela Mañaul",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Buhat, Alvin Zamora",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Busangilan, Clinth Eslaban",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Callaga, Jaypee",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Camiller, Elesio III Fuentes",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Capada, Joseph",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Castaño, Ereckjun Estocado",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Castro, Aldrin Bermejo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Casumpang, Von Bryan Valdez",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Ceralde, Julius Cordova",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Cimagala, Jodel Tezado",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Claver, Priscilla De Leon",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Colas, Rosery",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Crujedo, Raize Grace Siasico",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Cueme, Mariton Pacheco",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Dela Fuente, Christine Dago",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Dijan, Corazon Dela Cruz",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Enriquez, Charwin",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Espartero, Joy Mae Navasca",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Espinosa, Lester John",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Esquillo, Honey Loyd Bation",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Fajartin, Christian Jay Peria",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Farnazo, Gay Marie Pardillo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Ferolino, Wendy Rejin Santos",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Gamboa, Desiree Alcoseba",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Genton, Emie Argawanon",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "GRACIA, JOHN LLOYD",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Gusto, Sylvester Avila",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "HECHANOVA, KHYLA DOMOKMAT",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Jamero, Jim Soria",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Jorolan, Kit",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Juevesa, Roel Dalumpines",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Kainage, Arnesto Yanis",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Lacanilao, Edward",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Lagahit, Mary Cris Lerios",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "LANGOMEZ, JERRIC",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Lino, Ernest Jay",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Liquit, Jazer Carballo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Lorente, Bianca Marie Bebanco",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "MACAWAY, GARLAN BATOCAEL",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Mahaling, Joseph Mainit",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Maizo, Francis Thyrone Maglines",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Manalo, Aletheia",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Melicio, Janette Toko",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Moral, Gem Eden Louiza Eusebio",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Mortiga, Arlon Suba-an",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Moscoso, Maria Ysabella",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Musca, Diyls Anthea Callejo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Nalaunan, Lani Erespe",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Narciso, Jessie John Saligue",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Nosotros, Anthony Bryll Elnas",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "OCON, ROSEL GRACE",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Oczon, Ethel Loyloy",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Orang, Renante Carrillo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Orias, Emelyn Enero",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Ortiz, Althea Barcelona",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Pabitay, Aljhon Rhae",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Padua, Jollivie Arnado",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Palacios, Joshua Bravo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Palmes, Mark Lehi Pacres",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Pascual, Aubrey",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Projo, Rodney",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Rañises, Marlon Cabaya",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Reburcio, Gerald Ryan Oñas",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Rendaje, Irene Yap",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Repalbor, Mike Virnel",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Reyes, Gemma Landerio",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "RIVAS, PAULINE ENRHEL",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Rocacurva, Salome Los Banez",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Rojas, Rey Mart Terrado",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Ruales, Gregorio",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Salabao, Ana Fe",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Saligumba, Marisol Facto",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "SALUBRE, JESTLER ANGCO",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "SALVALOZA, SEAN DAVVIN",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "San Luis, Rudyric Bioco",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Siga, Ham",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Silah, Steven",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Silao, D. J. Brylle Gallardo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Siose, Beniffer",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Tabal, Mage Belle Miranda",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Tan, John Michael",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Tangub, Billy Dale B.",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Tongcua, April Joy Enlatierra",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Torres, Dave",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Valenzon, Angelita Hernane",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Vallestero, Kevin Clint Bale",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Vargas, Vince Evan Garcia",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Villacura, Nelly Abegail Saligue",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Viray, Clark Alonzo",
    source: "Identified CET faculty candidate from the attendance roster.",
  },
  {
    fullName: "Yambing, Primrose Labos",
    source: "Identified CET faculty candidate from the attendance roster.",
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
    const matches = roster
      .filter((faculty) => facultyNameMatches(candidate.fullName, faculty.fullName))
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
    return match && facultyNameMatches(name, match.fullName)
      ? { kind: "linked", facultyId: match.id, via: "explicit" }
      : { kind: "invalid-explicit", facultyId: explicit };
  }

  const matches = roster.filter((faculty) => facultyNameMatches(name, faculty.fullName));
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
