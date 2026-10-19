import { prisma } from "@/lib/prisma";

export function weekdayOfDate(date: Date): number {
  return date.getUTCDay();
}

export async function getSlotsForDateAndCourses(date: Date, courseIds: number[]) {
  if (courseIds.length === 0) return [];
  return prisma.scheduleSlot.findMany({
    where: { weekday: weekdayOfDate(date), courseId: { in: courseIds } },
    include: { room: true, faculty: true, course: true },
    orderBy: [{ startTime: "asc" }, { endTime: "asc" }],
  });
}
