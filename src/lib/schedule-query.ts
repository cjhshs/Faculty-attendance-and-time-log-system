import { prisma } from "@/lib/prisma";
import { termWhere, type Term } from "@/lib/terms";

export function weekdayOfDate(date: Date): number {
  return date.getUTCDay();
}

export async function getSlotsForDateAndCourses(
  date: Date,
  courseIds: number[],
  term?: Term | null,
) {
  if (courseIds.length === 0) return [];
  return prisma.scheduleSlot.findMany({
    where: {
      weekday: weekdayOfDate(date),
      courseId: { in: courseIds },
      ...termWhere(term),
    },
    include: { room: true, faculty: true, course: true },
    orderBy: [{ startTime: "asc" }, { endTime: "asc" }],
  });
}
