// Clear imported/test data so the system can start clean.
//
// By default this is a DRY RUN: it reports what would be removed and changes
// nothing. Pass --yes to actually delete.
//
//   npm run reset            # preview
//   npm run reset -- --yes   # do it
//
// What it removes: every schedule slot, both Excel import batches, every
// faculty row and every room — all of which came from test uploads. It also
// removes the attendance that was encoded against those test schedules, because
// attendance rows point at slots and cannot outlive them.
//
// What it keeps: users, roles and permissions, the program list (filled in with
// real names), school settings, holidays, the audit history and any schedule
// repair analyses.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function preview() {
  const [slots, batches, faculty, rooms, attendance, sessions, courses] = await Promise.all([
    prisma.scheduleSlot.count(),
    prisma.importBatch.count(),
    prisma.faculty.count(),
    prisma.room.count(),
    prisma.attendance.count(),
    prisma.attendanceSession.count(),
    prisma.course.findMany({ select: { code: true, name: true } }),
  ]);
  console.log("This will DELETE:");
  console.log(`  schedule slots      ${slots}`);
  console.log(`  import batches      ${batches}`);
  console.log(`  faculty             ${faculty}`);
  console.log(`  rooms               ${rooms}`);
  console.log(`  attendance records  ${attendance}`);
  console.log(`  attendance sessions ${sessions}`);
  console.log("\nThis will KEEP: users, roles, permissions, settings, holidays, audit log, repair analyses.");
  console.log(`\nPrograms currently without a name: ${courses.filter((c) => !c.name).map((c) => c.code).join(", ") || "none"}`);
  const missing = slots + batches + faculty + rooms + attendance + sessions;
  console.log(missing === 0 ? "\nNothing to delete — the database is already clean." : "\nRe-run with --yes to confirm.");
  return missing;
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  if (!confirmed) {
    await preview();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Attendance rows reference slots, so they have to go first.
    const attendance = await tx.attendance.deleteMany({});
    const sessions = await tx.attendanceSession.deleteMany({});
    const slots = await tx.scheduleSlot.deleteMany({});
    const batches = await tx.importBatch.deleteMany({});
    const faculty = await tx.faculty.deleteMany({});
    const rooms = await tx.room.deleteMany({});
    return { attendance, sessions, slots, batches, faculty, rooms };
  });

  console.log("Removed:");
  console.log(`  attendance records  ${result.attendance.count}`);
  console.log(`  attendance sessions ${result.sessions.count}`);
  console.log(`  schedule slots      ${result.slots.count}`);
  console.log(`  import batches      ${result.batches.count}`);
  console.log(`  faculty             ${result.faculty.count}`);
  console.log(`  rooms               ${result.rooms.count}`);
  console.log("\nDone. Run `npm run seed` to confirm the programs still have their names.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
