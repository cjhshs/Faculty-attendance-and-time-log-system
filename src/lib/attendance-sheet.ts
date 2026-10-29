import { hoursOfRange, timeToMinutes, formatTime12 } from "@/lib/dates";

export type SheetSlot = {
  id: number;
  cn: string;
  subject: string;
  start: string;
  end: string;
  roomCode: string;
  facultyId: number | null;
  facultyName: string | null;
  surname: string | null;
};

export type FacultyCell = { room: string; rowSpan: number } | "covered" | "empty";

export type FacultyColumn = {
  facultyId: number;
  label: string;
  cells: FacultyCell[]; // null = covered by the merged cell above
};

export type ProgramSheet = {
  rows: { label: string; start: string; end: string }[];
  columns: FacultyColumn[];
  unassigned: { cn: string; subject: string; time: string }[];
  totalFaculty: number;
};

export const FACULTY_PER_PAGE = 12;

function hourRangeLabel(hour: string) {
  const startMinutes = timeToMinutes(hour);
  const endMinutes = startMinutes + 60;
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
    endMinutes % 60,
  ).padStart(2, "0")}`;
  return { label: `${formatTime12(hour)} – ${formatTime12(end)}`, start: hour, end };
}

// Build the printable grid for one program: hourly rows × faculty columns,
// with the room merged across consecutive hours in the same room.
export function buildProgramSheet(slots: SheetSlot[]): ProgramSheet {
  const unassigned: ProgramSheet["unassigned"] = [];
  const assigned = slots.filter((s) => {
    if (s.facultyId == null || !s.facultyName) {
      unassigned.push({ cn: s.cn, subject: s.subject, time: `${s.start}-${s.end}` });
      return false;
    }
    return true;
  });

  const hourSet = new Set<string>();
  for (const slot of assigned) {
    for (const h of hoursOfRange(slot.start, slot.end)) hourSet.add(h);
  }
  const rows = Array.from(hourSet)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    .map(hourRangeLabel);

  const byFaculty = new Map<number, SheetSlot[]>();
  for (const slot of assigned) {
    const list = byFaculty.get(slot.facultyId!) ?? [];
    list.push(slot);
    byFaculty.set(slot.facultyId!, list);
  }

  const facultyIds = Array.from(byFaculty.keys()).sort((a, b) => {
    const sa = byFaculty.get(a)![0];
    const sb = byFaculty.get(b)![0];
    return (
      (sa.surname ?? "").localeCompare(sb.surname ?? "") ||
      (sa.facultyName ?? "").localeCompare(sb.facultyName ?? "")
    );
  });

  // Count how many distinct faculty share each surname.
  const surnameCount = new Map<string, number>();
  for (const id of facultyIds) {
    const key = (byFaculty.get(id)![0].surname ?? "").toLowerCase();
    surnameCount.set(key, (surnameCount.get(key) ?? 0) + 1);
  }

  const columns: FacultyColumn[] = facultyIds.map((facultyId) => {
    const list = byFaculty.get(facultyId)!;
    const first = list[0];
    const shared = (surnameCount.get((first.surname ?? "").toLowerCase()) ?? 0) > 1;
    const given = (first.facultyName ?? "").split(",")[1]?.trim() ?? "";
    const initial = given ? `, ${given[0].toUpperCase()}.` : "";
    const label = shared
      ? `${(first.surname ?? "").toUpperCase()}${initial}`
      : (first.surname ?? "").toUpperCase();

    // A slot covers exactly the hour labels `hoursOfRange` produced for it, so
    // the grid never paints more boxes than the schedule can account for. Using
    // a raw start<=h<end test here used to also match half-hour rows (08:30 …)
    // contributed by neighbouring classes, inventing hours and making every
    // program look like it had overlapping classes.
    const hoursBySlot = new Map<number, Set<string>>();
    for (const slot of list) hoursBySlot.set(slot.id, new Set(hoursOfRange(slot.start, slot.end)));

    const roomForHour = (hour: string): string | null => {
      const match = list.find((s) => hoursBySlot.get(s.id)!.has(hour));
      return match ? match.roomCode : null;
    };

    const cells: FacultyCell[] = [];
    let i = 0;
    while (i < rows.length) {
      const room = roomForHour(rows[i].start);
      if (room == null) {
        cells.push("empty");
        i++;
        continue;
      }
      let span = 1;
      while (i + span < rows.length && roomForHour(rows[i + span].start) === room) {
        span++;
      }
      cells.push({ room, rowSpan: span });
      for (let k = 1; k < span; k++) cells.push("covered");
      i += span;
    }

    return { facultyId, label, cells };
  });

  return { rows, columns, unassigned, totalFaculty: columns.length };
}

export type SheetReconciliation = {
  ok: boolean;
  expectedMeetings: number;
  expectedHours: number;
  renderedHours: number;
  unassignedMeetings: number;
  problems: string[];
};

// Compare the hours the schedule says should appear against the hours the grid
// actually renders for each faculty column. A mismatch means two classes for the
// same instructor overlap (one silently disappears from the sheet), so printing
// must be blocked until the schedule is fixed. Unassigned (TBA) meetings cannot
// be printed at all and are reported separately without failing the sheet.
export function reconcileProgramSheet(
  slots: SheetSlot[],
  sheet?: ProgramSheet,
): SheetReconciliation {
  const grid = sheet ?? buildProgramSheet(slots);
  const assigned = slots.filter((s) => s.facultyId != null && s.facultyName);
  const expectedHours = assigned.reduce((n, s) => n + hoursOfRange(s.start, s.end).length, 0);

  const renderedByFaculty = new Map<number, number>();
  let renderedHours = 0;
  for (const column of grid.columns) {
    let count = 0;
    for (const cell of column.cells) {
      if (cell !== "empty" && cell !== "covered") count += cell.rowSpan;
    }
    renderedByFaculty.set(column.facultyId, count);
    renderedHours += count;
  }

  const problems: string[] = [];
  if (renderedHours !== expectedHours) {
    const expectedByFaculty = new Map<number, number>();
    for (const s of assigned) {
      expectedByFaculty.set(
        s.facultyId!,
        (expectedByFaculty.get(s.facultyId!) ?? 0) + hoursOfRange(s.start, s.end).length,
      );
    }
    for (const [facultyId, expected] of expectedByFaculty) {
      const got = renderedByFaculty.get(facultyId) ?? 0;
      if (got !== expected) {
        const name = assigned.find((s) => s.facultyId === facultyId)?.facultyName ?? `#${facultyId}`;
        problems.push(
          `${name}: schedule has ${expected} hour(s) but the sheet shows ${got} — overlapping classes for the same instructor.`,
        );
      }
    }
    if (problems.length === 0) {
      problems.push(
        `Sheet hours (${renderedHours}) do not match the schedule (${expectedHours}).`,
      );
    }
  }
  if (grid.unassigned.length > 0) {
    problems.push(`${grid.unassigned.length} unassigned (TBA) meeting(s) cannot be printed.`);
  }

  return {
    ok: renderedHours === expectedHours,
    expectedMeetings: assigned.length,
    expectedHours,
    renderedHours,
    unassignedMeetings: grid.unassigned.length,
    problems,
  };
}

export function paginateColumns(
  columns: FacultyColumn[],
  perPage = FACULTY_PER_PAGE,
): FacultyColumn[][] {
  const pages: FacultyColumn[][] = [];
  for (let i = 0; i < columns.length; i += perPage) {
    pages.push(columns.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

// Stable page count for a set of program slots. Pagination depends only on the
// number of faculty columns, never on the current viewport or print dialog, so
// "print page N" always maps to the same page as the original print-all run.
export function programPageCount(slots: SheetSlot[], perPage = FACULTY_PER_PAGE): number {
  const columns = buildProgramSheet(slots).columns.length;
  return Math.max(1, Math.ceil(columns / perPage));
}

export type PrintPageRef = {
  courseIndex: number;
  pageIndex: number;
  pageNumber: number;
};

export function flattenPrintPages(
  slotGroups: { slots: SheetSlot[] }[],
  perPage = FACULTY_PER_PAGE,
): PrintPageRef[] {
  const refs: PrintPageRef[] = [];
  let pageNumber = 0;
  slotGroups.forEach((group, courseIndex) => {
    const count = programPageCount(group.slots, perPage);
    for (let pageIndex = 0; pageIndex < count; pageIndex++) {
      refs.push({ courseIndex, pageIndex, pageNumber: ++pageNumber });
    }
  });
  return refs;
}
