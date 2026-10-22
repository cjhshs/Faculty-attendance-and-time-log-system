import { prisma } from "@/lib/prisma";
import { eachDate, hoursOfRange } from "@/lib/dates";
import { termWhere, type Term } from "@/lib/terms";

export type FacultySummary = {
  facultyId: number;
  name: string;
  surname: string;
  scheduledHours: number;
  encodedScheduledHours: number;
  presentHours: number;
  absentHours: number;
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
    encoded: boolean;
  }[];
  byProgram: {
    course: string;
    scheduledHours: number;
    presentHours: number;
    absentHours: number;
  }[];
};

export type IncompleteScope = { date: string; course: string };

export type SummaryResult = {
  start: string;
  end: string;
  faculty: FacultySummary[];
  incomplete: IncompleteScope[];
  totals: {
    scheduledHours: number;
    presentHours: number;
    absentHours: number;
    facultyCount: number;
  };
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function buildSummary(
  start: Date,
  end: Date,
  courseScope?: number | number[] | null,
  term?: Term | null,
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

  const slotFilter = {
    ...(courseIds ? { courseId: courseFilter } : {}),
    ...termWhere(term),
  };

  const [slots, sessions, holidays, attendance] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: Object.keys(slotFilter).length ? slotFilter : undefined,
      include: { faculty: true, course: true },
    }),
    prisma.attendanceSession.findMany({
      where: { date: { gte: start, lte: end }, ...(courseIds ? { courseId: courseFilter } : {}) },
      select: { date: true, courseId: true, status: true },
    }),
    prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.attendance.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(term ? { slot: termWhere(term) } : {}),
      },
      select: { slotId: true, date: true, hourStart: true, present: true, reason: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => iso(h.date)));
  const sessionStatus = new Map(sessions.map((s) => [`${iso(s.date)}|${s.courseId}`, s.status]));

  const slotById = new Map(slots.map((s) => [s.id, s]));
  const presentBySlotDate = new Map<string, number>();
  for (const a of attendance) {
    if (!a.present) continue;
    const key = `${a.slotId}|${iso(a.date)}`;
    presentBySlotDate.set(key, (presentBySlotDate.get(key) ?? 0) + 1);
  }

  const facultyStats = new Map<number, FacultySummary>();
  const incompleteSet = new Map<string, IncompleteScope>();

  function getStats(facultyId: number, name: string, surname: string) {
    let s = facultyStats.get(facultyId);
    if (!s) {
      s = {
        facultyId,
        name,
        surname,
        scheduledHours: 0,
        encodedScheduledHours: 0,
        presentHours: 0,
        absentHours: 0,
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
      p = { course, scheduledHours: 0, presentHours: 0, absentHours: 0 };
      s.byProgram.push(p);
    }
    return p;
  }

  for (const date of dates) {
    const dateIso = iso(date);
    if (holidaySet.has(dateIso)) continue;
    const weekday = date.getUTCDay();

    // Group this date's slots by faculty then by course.
    const byFaculty = new Map<number, Map<string, { hours: number; courseId: number; slotIds: number[] }>>();
    for (const slot of slots) {
      if (slot.weekday !== weekday) continue;
      if (slot.facultyId == null || !slot.faculty) continue;
      const hours = hoursOfRange(slot.startTime, slot.endTime).length;
      const perCourse = byFaculty.get(slot.facultyId) ?? new Map();
      const key = slot.course.code;
      const group = perCourse.get(key) ?? { hours: 0, courseId: slot.courseId, slotIds: [] };
      group.hours += hours;
      group.slotIds.push(slot.id);
      perCourse.set(key, group);
      byFaculty.set(slot.facultyId, perCourse);
    }

    for (const [facultyId, perCourse] of byFaculty) {
      const firstSlot = slots.find(
        (s) => s.facultyId === facultyId && s.weekday === weekday,
      )!;
      const stats = getStats(facultyId, firstSlot.faculty!.fullName, firstSlot.faculty!.surname);

      let dayPresent = 0;
      let dayEncodedTotal = 0;

      for (const [courseCode, group] of perCourse) {
        const status = sessionStatus.get(`${dateIso}|${group.courseId}`);
        const program = getProgram(stats, courseCode);

        stats.scheduledHours += group.hours;
        program.scheduledHours += group.hours;

        if (status === "SAVED") {
          let present = 0;
          for (const slotId of group.slotIds) {
            present += presentBySlotDate.get(`${slotId}|${dateIso}`) ?? 0;
          }
          const absent = group.hours - present;
          stats.encodedScheduledHours += group.hours;
          stats.presentHours += present;
          stats.absentHours += absent;
          program.presentHours += present;
          program.absentHours += absent;
          dayPresent += present;
          dayEncodedTotal += group.hours;
          stats.daily.push({
            date: dateIso,
            course: courseCode,
            scheduledHours: group.hours,
            presentHours: present,
            absentHours: absent,
            encoded: true,
          });
        } else {
          // Not encoded: never counted as absence.
          incompleteSet.set(`${dateIso}|${courseCode}`, { date: dateIso, course: courseCode });
          stats.daily.push({
            date: dateIso,
            course: courseCode,
            scheduledHours: group.hours,
            presentHours: 0,
            absentHours: 0,
            encoded: false,
          });
        }
      }

      // Day classification only over encoded scopes.
      if (dayEncodedTotal > 0) {
        if (dayPresent === 0) stats.absentDays += 1;
        else if (dayPresent < dayEncodedTotal) stats.partialDays += 1;
        else stats.presentDays += 1;
      }
    }

    // Reasons
    for (const a of attendance) {
      if (iso(a.date) !== dateIso) continue;
      if (!a.reason) continue;
      const slot = slotById.get(a.slotId);
      if (!slot || slot.facultyId == null) continue;
      const stats = getStats(
        slot.facultyId,
        slot.faculty!.fullName,
        slot.faculty!.surname,
      );
      stats.reasons.push({ date: dateIso, course: slot.course.code, reason: a.reason });
    }
  }

  const faculty = Array.from(facultyStats.values())
    .filter((s) => s.scheduledHours > 0)
    .sort((a, b) => a.surname.localeCompare(b.surname) || a.name.localeCompare(b.name));

  const totals = {
    scheduledHours: faculty.reduce((sum, s) => sum + s.encodedScheduledHours, 0),
    presentHours: faculty.reduce((sum, s) => sum + s.presentHours, 0),
    absentHours: faculty.reduce((sum, s) => sum + s.absentHours, 0),
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
