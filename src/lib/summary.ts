import { prisma } from "@/lib/prisma";
import { eachDate, hoursOfRange } from "@/lib/dates";
import { termWhere, type Term } from "@/lib/terms";
import { classifyDay, countAttendanceStatuses } from "@/lib/attendance-status";

export type FacultySummary = {
  facultyId: number;
  name: string;
  surname: string;
  // Read from the faculty roster, never inferred from the program.
  department: string | null;
  scheduledHours: number;
  // Hours with an explicit Present or Absent status.
  encodedScheduledHours: number;
  presentHours: number;
  absentHours: number;
  // Scheduled hours still NULL / not encoded. Never counted as absent.
  unencodedHours: number;
  presentDays: number;
  absentDays: number;
  partialDays: number;
  reasons: { date: string; course: string; reason: string }[];
  daily: {
    date: string;
    course: string;
    scheduledHours: number;
    presentHours: number;
    absentHours: number;
    unencodedHours: number;
    encoded: boolean;
  }[];
  byProgram: {
    course: string;
    scheduledHours: number;
    presentHours: number;
    absentHours: number;
    unencodedHours: number;
  }[];
};

export type IncompleteScope = { date: string; course: string; unencodedHours: number };

export type SummaryResult = {
  start: string;
  end: string;
  faculty: FacultySummary[];
  incomplete: IncompleteScope[];
  totals: {
    scheduledHours: number;
    presentHours: number;
    absentHours: number;
    unencodedHours: number;
    facultyCount: number;
  };
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export type SummaryScope = {
  courseIds?: number[] | null;
  // Selected faculty department (College.code). Membership is taken from the
  // faculty roster, never from the program code or the students' course.
  departmentCode?: string | null;
};

// Translate the department dropdown value into a roster filter. "unassigned"
// means faculty whose department has not been reviewed yet; it is a faculty
// attribute and must never be treated as a program/course code.
export function departmentSlotFilter(departmentCode: string | null | undefined) {
  const code = (departmentCode ?? "").trim().toUpperCase();
  if (!code) return {};
  if (code === "UNASSIGNED") return { faculty: { departmentId: null } };
  return { faculty: { department: { code } } };
}

export async function buildSummary(
  start: Date,
  end: Date,
  courseScope?: number | number[] | null,
  term?: Term | null,
  scope?: SummaryScope,
): Promise<SummaryResult> {
  const dates = eachDate(start, end);

  // A single program id, a list of ids (one college), or nothing (all).
  const courseIds =
    courseScope == null
      ? null
      : Array.isArray(courseScope)
        ? courseScope
        : [courseScope];
  const courseFilter = courseIds ? { in: courseIds } : undefined;
  const departmentCode = (scope?.departmentCode ?? "").trim().toUpperCase();

  const slotFilter = {
    ...(courseIds ? { courseId: courseFilter } : {}),
    ...departmentSlotFilter(departmentCode),
    ...termWhere(term),
  };

  const [slots, holidays, attendance] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: Object.keys(slotFilter).length ? slotFilter : undefined,
      include: {
        faculty: {
          include: { department: { select: { code: true, name: true } } },
        },
        course: true,
      },
    }),
    prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.attendance.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(Object.keys(slotFilter).length ? { slot: slotFilter } : {}),
      },
      select: { slotId: true, date: true, hourStart: true, present: true, reason: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => iso(h.date)));

  const slotById = new Map(slots.map((s) => [s.id, s]));
  // Present/absent are counted separately. A NULL value is neither.
  const presentBySlotDate = new Map<string, number>();
  const absentBySlotDate = new Map<string, number>();
  for (const a of attendance) {
    const key = `${a.slotId}|${iso(a.date)}`;
    if (a.present === true) presentBySlotDate.set(key, (presentBySlotDate.get(key) ?? 0) + 1);
    else if (a.present === false) absentBySlotDate.set(key, (absentBySlotDate.get(key) ?? 0) + 1);
  }

  // Index slots by weekday once instead of scanning every slot for every date.
  const slotsByWeekday = new Map<number, typeof slots>();
  for (const slot of slots) {
    const list = slotsByWeekday.get(slot.weekday) ?? [];
    list.push(slot);
    slotsByWeekday.set(slot.weekday, list);
  }
  // Index absence reasons by date once instead of scanning all attendance rows
  // for every date in the range.
  const reasonsByDate = new Map<string, typeof attendance>();
  for (const row of attendance) {
    if (row.present !== false || !row.reason) continue;
    const key = iso(row.date);
    const list = reasonsByDate.get(key) ?? [];
    list.push(row);
    reasonsByDate.set(key, list);
  }

  const facultyStats = new Map<number, FacultySummary>();
  const incompleteSet = new Map<string, IncompleteScope>();

  function getStats(
    facultyId: number,
    name: string,
    surname: string,
    department: string | null,
  ) {
    let s = facultyStats.get(facultyId);
    if (!s) {
      s = {
        facultyId,
        name,
        surname,
        department,
        scheduledHours: 0,
        encodedScheduledHours: 0,
        presentHours: 0,
        absentHours: 0,
        unencodedHours: 0,
        presentDays: 0,
        absentDays: 0,
        partialDays: 0,
        reasons: [],
        daily: [],
        byProgram: [],
      };
      facultyStats.set(facultyId, s);
    }
    return s;
  }

  function getProgram(s: FacultySummary, course: string) {
    let p = s.byProgram.find((x) => x.course === course);
    if (!p) {
      p = { course, scheduledHours: 0, presentHours: 0, absentHours: 0, unencodedHours: 0 };
      s.byProgram.push(p);
    }
    return p;
  }

  type SlotRow = (typeof slots)[number];
  type CourseGroup = {
    hours: number;
    courseId: number;
    slotIds: number[];
    first: SlotRow;
  };

  for (const date of dates) {
    const dateIso = iso(date);
    if (holidaySet.has(dateIso)) continue;
    const weekday = date.getUTCDay();
    const weekdaySlots = slotsByWeekday.get(weekday) ?? [];

    // Group this date's slots by faculty then by course, keeping the first slot
    // so the roster name and department are available without a second scan.
    const byFaculty = new Map<
      number,
      { first: SlotRow; perCourse: Map<string, CourseGroup> }
    >();
    for (const slot of weekdaySlots) {
      if (slot.facultyId == null || !slot.faculty) continue;
      const hours = hoursOfRange(slot.startTime, slot.endTime).length;
      let entry = byFaculty.get(slot.facultyId);
      if (!entry) {
        entry = { first: slot, perCourse: new Map() };
        byFaculty.set(slot.facultyId, entry);
      }
      const key = slot.course.code;
      const group = entry.perCourse.get(key) ?? {
        hours: 0,
        courseId: slot.courseId,
        slotIds: [],
        first: slot,
      };
      group.hours += hours;
      group.slotIds.push(slot.id);
      entry.perCourse.set(key, group);
    }

    for (const [facultyId, entry] of byFaculty) {
      const firstSlot = entry.first;
      const department = firstSlot.faculty!.department
        ? `${firstSlot.faculty!.department.code} — ${firstSlot.faculty!.department.name}`
        : null;
      const stats = getStats(
        facultyId,
        firstSlot.faculty!.fullName,
        firstSlot.faculty!.surname,
        department,
      );

      let dayPresent = 0;
      let dayAbsent = 0;
      let dayUnencoded = 0;

      for (const [courseCode, group] of entry.perCourse) {
        const program = getProgram(stats, courseCode);

        let present = 0;
        let absent = 0;
        for (const slotId of group.slotIds) {
          present += presentBySlotDate.get(`${slotId}|${dateIso}`) ?? 0;
          absent += absentBySlotDate.get(`${slotId}|${dateIso}`) ?? 0;
        }
        // Rows can never describe more hours than the schedule contains.
        present = Math.min(present, group.hours);
        absent = Math.min(absent, Math.max(0, group.hours - present));
        const unencoded = Math.max(0, group.hours - present - absent);
        const fullyEncoded = unencoded === 0;

        stats.scheduledHours += group.hours;
        stats.encodedScheduledHours += present + absent;
        stats.presentHours += present;
        stats.absentHours += absent;
        stats.unencodedHours += unencoded;
        program.scheduledHours += group.hours;
        program.presentHours += present;
        program.absentHours += absent;
        program.unencodedHours += unencoded;
        dayPresent += present;
        dayAbsent += absent;
        dayUnencoded += unencoded;

        if (!fullyEncoded) {
          incompleteSet.set(`${dateIso}|${courseCode}`, {
            date: dateIso,
            course: courseCode,
            unencodedHours: unencoded,
          });
        }
        stats.daily.push({
          date: dateIso,
          course: courseCode,
          scheduledHours: group.hours,
          presentHours: present,
          absentHours: absent,
          unencodedHours: unencoded,
          // "encoded" means fully encoded; partial scopes stay visible as incomplete.
          encoded: fullyEncoded,
        });
      }

      // Day classification only over hours that actually have a status. An
      // entirely unencoded day is neither present nor absent.
      const dayCounts = countAttendanceStatuses([
        ...Array.from({ length: dayPresent }, () => true as boolean | null),
        ...Array.from({ length: dayAbsent }, () => false as boolean | null),
        ...Array.from({ length: dayUnencoded }, () => null as boolean | null),
      ]);
      const classification = classifyDay(dayCounts);
      if (classification === "present") stats.presentDays += 1;
      else if (classification === "absent") stats.absentDays += 1;
      else if (classification === "partial") stats.partialDays += 1;
    }

    // Reasons are only meaningful for an explicit absence.
    for (const a of reasonsByDate.get(dateIso) ?? []) {
      const slot = slotById.get(a.slotId);
      if (!slot || slot.facultyId == null || !slot.faculty) continue;
      const department = slot.faculty.department
        ? `${slot.faculty.department.code} — ${slot.faculty.department.name}`
        : null;
      const stats = getStats(
        slot.facultyId,
        slot.faculty.fullName,
        slot.faculty.surname,
        department,
      );
      stats.reasons.push({ date: dateIso, course: slot.course.code, reason: a.reason! });
    }
  }

  const faculty = Array.from(facultyStats.values())
    .filter((s) => s.scheduledHours > 0)
    .sort((a, b) => a.surname.localeCompare(b.surname) || a.name.localeCompare(b.name));

  const totals = {
    scheduledHours: faculty.reduce((sum, s) => sum + s.encodedScheduledHours, 0),
    presentHours: faculty.reduce((sum, s) => sum + s.presentHours, 0),
    absentHours: faculty.reduce((sum, s) => sum + s.absentHours, 0),
    unencodedHours: faculty.reduce((sum, s) => sum + s.unencodedHours, 0),
    facultyCount: faculty.length,
  };

  return {
    start: iso(start),
    end: iso(end),
    faculty,
    incomplete: Array.from(incompleteSet.values()).sort((a, b) =>
      a.date === b.date ? a.course.localeCompare(b.course) : a.date.localeCompare(b.date),
    ),
    totals,
  };
}
