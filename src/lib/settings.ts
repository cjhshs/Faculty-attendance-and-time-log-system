import { prisma } from "@/lib/prisma";

export type SettingsMap = Record<string, string>;

export async function getSettings(): Promise<SettingsMap> {
  const rows = await prisma.settings.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string) {
  await prisma.settings.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function setSettings(values: SettingsMap) {
  for (const [key, value] of Object.entries(values)) {
    await setSetting(key, value);
  }
}
