import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEAN_ROLE_NAME } from "../src/lib/permissions";
import { ensureCollegeCatalog, ensureReferenceData } from "../src/lib/reference-data";

const prisma = new PrismaClient();

async function main() {
  const stats = await ensureReferenceData(prisma);
  console.log(
    `Reference data ready: ${stats.permissions} permissions, ${stats.roles} roles, ` +
      `${stats.rolePermissionsAdded} role permission(s) added, ${stats.settingsAdded} setting(s) added.`,
  );

  const catalog = await ensureCollegeCatalog(prisma);
  console.log(
    `Catalog ready: ${catalog.colleges} colleges, ${catalog.programs} programs, ` +
      `${catalog.programsCreated} program(s) created.`,
  );

  const deanRole = await prisma.role.findUnique({ where: { name: DEAN_ROLE_NAME } });
  if (!deanRole) throw new Error(`Role "${DEAN_ROLE_NAME}" was not created.`);

  // First Dean account
  const username = process.env.SEED_DEAN_USERNAME || "dean";
  const password = process.env.SEED_DEAN_PASSWORD || "Dean@12345";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        name: "Dean",
        username,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: deanRole.id } });
    console.log(`Created Dean account "${username}" with password "${password}" (must change at first login).`);
  } else {
    console.log(`Dean account "${username}" already exists — leaving it unchanged.`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
