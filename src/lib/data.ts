import { prisma } from "@/lib/prisma";

export async function getCourses() {
  return prisma.course.findMany({ orderBy: { code: "asc" } });
}

export async function getRooms() {
  return prisma.room.findMany({ orderBy: { code: "asc" } });
}

export async function getFaculty(activeOnly = false) {
  return prisma.faculty.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ surname: "asc" }, { fullName: "asc" }],
  });
}
