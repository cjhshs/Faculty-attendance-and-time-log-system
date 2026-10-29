/**
 * Optional database smoke check for the academic-period/department behaviour.
 *
 * Safety: it refuses to run against a database whose name does not contain
 * "smoke" or "test". It creates a small isolated fixture, verifies the new
 * additive schema and department scoping, then removes only the rows it created.
 *
 * Usage:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/faculty_attendance_smoke?schema=public"
 *   npx tsx scripts/verify-db.ts
 */
import { PrismaClient } from "@prisma/client";
import { periodContains } from "../src/lib/academic-period";

const prisma = new PrismaClient();
const TAG = "SMOKE";

function requireSmokeDatabase(url: string | undefined) {
  if (!url) throw new Error("DATABASE_URL is not set.");
  const dbName = /^[a-z]+:\/\/[^/]+\/([^?]+)/i.exec(url)?.[1] ?? "";
  if (!/smoke|test/i.test(dbName)) {
    throw new Error(
      `Refusing to run: database "${dbName}" is not a smoke/test database. This script never claims to validate production data.`,
    );
  }
}

async function main() {
  requireSmokeDatabase(process.env.DATABASE_URL);
  const checks: { name: string; ok: boolean }[] = [];
  const check = (name: string, ok: boolean) => {
    checks.push({ name, ok });
    if (!ok) throw new Error(`FAILED: ${name}`);
  };

  const collegeA = await prisma.college.create({
    data: { code: `${TAG}A`, name: "Smoke College A", sortOrder: 9001 },
  });
  const collegeB = await prisma.college.create({
    data: { code: `${TAG}B`, name: "Smoke College B", sortOrder: 9002 },
  });
  const facultyA = await prisma.faculty.create({
    data: { fullName: `${TAG}, Faculty A`, surname: TAG, departmentId: collegeA.id },
  });
  const facultyB = await prisma.faculty.create({
    data: { fullName: `${TAG}, Faculty B`, surname: TAG, departmentId: collegeB.id },
  });
  const course = await prisma.course.create({
    data: { code: `${TAG}101`, name: "Smoke Course", collegeId: collegeA.id },
  });
  const room = await prisma.room.create({
    data: { code: `${TAG}ROOM`, type: "PHYSICAL" },
  });

  const start = new Date(Date.UTC(2099, 7, 1));
  const end = new Date(Date.UTC(2099, 11, 31));
  const period = await prisma.academicPeriod.create({
    data: {
      schoolYear: "2099-2100",
      semester: "1st Semester",
      startDate: start,
      endDate: end,
      status: "UPCOMING",
    },
  });
  check("academic period persists reviewed dates", period.startDate?.getTime() === start.getTime());
  check("period contains an in-range date", periodContains(period, new Date(Date.UTC(2099, 9, 1))) === true);
  check("period excludes an out-of-range date", periodContains(period, new Date(Date.UTC(2100, 0, 1))) === false);

  const second = await prisma.academicPeriod.create({
    data: { schoolYear: "2099-2100", semester: "2nd Semester" },
  });
  check("a legacy-style period can keep NULL dates", second.startDate === null && second.endDate === null);

  let duplicateRejected = false;
  try {
    await prisma.academicPeriod.create({
      data: { schoolYear: "2099-2100", semester: "1st Semester" },
    });
  } catch {
    duplicateRejected = true;
  }
  check("duplicate school year + semester is rejected", duplicateRejected);

  const batch = await prisma.importBatch.create({
    data: {
      filename: `${TAG}.xlsx`,
      schoolYear: "2099-2100",
      semester: "1st Semester",
      checksum: "a".repeat(64),
      slotCount: 1,
    },
  });
  const duplicateBatch = await prisma.importBatch.findFirst({
    where: { schoolYear: "2099-2100", semester: "1st Semester", checksum: "a".repeat(64) },
  });
  check("import checksum is stored and queryable", duplicateBatch?.id === batch.id);

  const slotA = await prisma.scheduleSlot.create({
    data: {
      cn: `${TAG}-CN1`,
      subject: "Smoke 1",
      courseId: course.id,
      facultyId: facultyA.id,
      roomId: room.id,
      schoolYear: "2099-2100",
      semester: "1st Semester",
      weekday: 1,
      startTime: "08:00",
      endTime: "09:00",
      importBatchId: batch.id,
    },
  });
  const inDepartmentA = await prisma.scheduleSlot.findMany({
    where: { id: slotA.id, faculty: { department: { code: `${TAG}A` } } },
  });
  const inDepartmentB = await prisma.scheduleSlot.findMany({
    where: { id: slotA.id, faculty: { department: { code: `${TAG}B` } } },
  });
  check("department A includes its own faculty's slot", inDepartmentA.length === 1);
  check("department B excludes another department's slot", inDepartmentB.length === 0);

  // Staffing counts used by the department empty states.
  const assignedA = await prisma.faculty.count({ where: { departmentId: collegeA.id } });
  const withDepartment = await prisma.faculty.count({ where: { departmentId: { not: null } } });
  check("department counts are exact", assignedA === 1 && withDepartment >= 2);

  // --- Summary reconciliation -------------------------------------------
  // A scheduled 2-hour class: one hour explicitly present, one hour left NULL,
  // one week later both hours explicitly absent. The summary must report
  // present 1, absent 2, and count the NULL hour as unencoded -- never absent.
  const user = await prisma.user.create({
    data: { name: `${TAG} Verifier`, username: `smoke_verify_${Date.now()}`, passwordHash: "x" },
  });
  const courseB = await prisma.course.create({
    data: { code: `${TAG}102`, name: "Smoke Course B", collegeId: collegeB.id },
  });
  const anyMonday = new Date(Date.UTC(2099, 7, 3));
  const weekday = anyMonday.getUTCDay();
  const classSlot = await prisma.scheduleSlot.create({
    data: {
      cn: `${TAG}-CN2`,
      subject: "Smoke Summary",
      courseId: course.id,
      facultyId: facultyA.id,
      roomId: room.id,
      schoolYear: "2099-2100",
      semester: "1st Semester",
      weekday,
      startTime: "08:00",
      endTime: "10:00",
    },
  });
  const secondMonday = new Date(anyMonday.getTime() + 7 * 86400000);
  await prisma.attendance.createMany({
    data: [
      { slotId: classSlot.id, date: anyMonday, hourStart: "08:00", present: true, encodedById: user.id },
      { slotId: classSlot.id, date: anyMonday, hourStart: "09:00", present: null, encodedById: user.id },
      {
        slotId: classSlot.id,
        date: secondMonday,
        hourStart: "08:00",
        present: false,
        reason: "Sick leave",
        encodedById: user.id,
      },
      { slotId: classSlot.id, date: secondMonday, hourStart: "09:00", present: false, encodedById: user.id },
    ],
  });

  const { buildSummary } = await import("../src/lib/summary");
  const summary = await buildSummary(
    new Date(Date.UTC(2099, 7, 1)),
    new Date(Date.UTC(2099, 7, 31)),
    undefined,
    { schoolYear: "2099-2100", semester: "1st Semester" },
    { departmentCode: `${TAG}A` },
  );
  const summaryA = summary.faculty.find((f) => f.facultyId === facultyA.id);
  check(
    "summary reconciles present, absent and unencoded hours",
    summaryA?.presentHours === 1 && summaryA?.absentHours === 2 && summaryA?.unencodedHours !== 0,
  );
  check(
    "summary never counts unencoded hours as absent",
    summaryA?.absentHours === 2,
  );
  check(
    "summary reports the registered faculty department",
    summaryA?.department === `${TAG}A — Smoke College A`,
  );
  check("summary only includes the requested department", summary.faculty.length === 1);

  // --- Automatic department assignment ----------------------------------
  const facultyC = await prisma.faculty.create({
    data: { fullName: `${TAG}, Faculty C`, surname: TAG },
  });
  const facultyD = await prisma.faculty.create({
    data: { fullName: `${TAG}, Faculty D`, surname: TAG },
  });
  await prisma.scheduleSlot.createMany({
    data: [
      {
        cn: `${TAG}-CN3`,
        subject: "Smoke C",
        courseId: course.id,
        facultyId: facultyC.id,
        roomId: room.id,
        schoolYear: "2099-2100",
        semester: "1st Semester",
        weekday,
        startTime: "10:00",
        endTime: "11:00",
      },
      {
        cn: `${TAG}-CN4`,
        subject: "Smoke D1",
        courseId: course.id,
        facultyId: facultyD.id,
        roomId: room.id,
        schoolYear: "2099-2100",
        semester: "1st Semester",
        weekday,
        startTime: "11:00",
        endTime: "12:00",
      },
      {
        cn: `${TAG}-CN5`,
        subject: "Smoke D2",
        courseId: courseB.id,
        facultyId: facultyD.id,
        roomId: room.id,
        schoolYear: "2099-2100",
        semester: "1st Semester",
        weekday,
        startTime: "12:00",
        endTime: "13:00",
      },
    ],
  });
  const autoRows = await prisma.faculty.findMany({
    select: {
      id: true,
      fullName: true,
      departmentId: true,
      slots: {
        select: {
          course: { select: { college: { select: { id: true, code: true, name: true } } } },
        },
      },
    },
  });
  const { planAutoDepartmentAssignments } = await import("../src/lib/faculty-auto-department");
  const autoPlan = planAutoDepartmentAssignments(
    autoRows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      departmentId: row.departmentId,
      colleges: row.slots.map((slot) => slot.course.college),
    })),
  );
  check(
    "auto-assignment suggests only the unambiguous unassigned faculty",
    autoPlan.suggestions.length === 1 &&
      autoPlan.suggestions[0].facultyId === facultyC.id &&
      autoPlan.suggestions[0].collegeCode === `${TAG}A`,
  );
  check(
    "auto-assignment leaves mixed colleges and manual assignments untouched",
    autoPlan.alreadyAssigned === 2 &&
      autoPlan.unresolved.some((r) => r.facultyId === facultyD.id && r.reason === "mixed-colleges"),
  );

  await prisma.attendance.deleteMany({ where: { slotId: { in: [slotA.id, classSlot.id] } } });
  await prisma.scheduleSlot.deleteMany({ where: { cn: { startsWith: TAG } } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.importBatch.deleteMany({ where: { id: batch.id } });
  await prisma.academicPeriod.deleteMany({ where: { schoolYear: "2099-2100" } });
  await prisma.course.deleteMany({ where: { id: { in: [course.id, courseB.id] } } });
  await prisma.room.deleteMany({ where: { id: room.id } });
  await prisma.faculty.deleteMany({
    where: { id: { in: [facultyA.id, facultyB.id, facultyC.id, facultyD.id] } },
  });
  await prisma.college.deleteMany({ where: { id: { in: [collegeA.id, collegeB.id] } } });

  for (const item of checks) {
    console.log(`  ${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
  }
  console.log(`\n${checks.length} checks passed. Fixture rows removed.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
