import { prisma } from "@/lib/prisma";
import { termWhere, type Term } from "@/lib/terms";

export function weekdayOfDate(date: Date): number {
  return date.getUTCDay();
}

export function getSlotsForDateAndCourses(
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
    include: {
      room: true,
      faculty: { include: { department: true } },
      course: { include: { college: true } },
    },
    orderBy: [{ startTime: "asc" }, { endTime: "asc" }],
  });
}

// Department-scoped schedule lookup. The department is taken from the faculty
// roster (`faculty.department`), never from the student program/course. A CET
// instructor teaching a BSIT subject therefore stays in the CET result.
export function getSlotsForDateAndDepartment(
  date: Date,
  departmentCode: string | null | undefined,
  term?: Term | null,
) {
  const code = (departmentCode ?? "").trim();
  return prisma.scheduleSlot.findMany({
    where: {
      weekday: weekdayOfDate(date),
      ...(code === "unassigned"
        ? { faculty: { departmentId: null } }
        : code
          ? { faculty: { department: { code } } }
          : {}),
      ...termWhere(term),
    },
    include: {
      room: true,
      faculty: { include: { department: true } },
      course: { include: { college: true } },
    },
    orderBy: [{ startTime: "asc" }, { endTime: "asc" }],
  });
}
