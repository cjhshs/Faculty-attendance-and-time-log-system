import { prisma } from "@/lib/prisma";
import { weekdayOfDate } from "@/lib/schedule-query";
import { termWhere, type Term } from "@/lib/terms";
import { normalizeFacultyName } from "@/lib/faculty-department";

export type SheetScopeInput = {
  date: string | Date; // YYYY-MM-DD or Date
  department?: string | null;
  programs?: string[];
  schoolYear: string;
  semester: string;
};

// Deterministic unique key identifying an attendance print sheet instance.
export function buildSheetKey(input: SheetScopeInput): string {
  const isoDate =
    typeof input.date === "string"
      ? input.date.trim()
      : input.date.toISOString().slice(0, 10);
  const dept = (input.department ?? "").trim().toUpperCase();
  const progs = (input.programs ?? [])
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(",");
  const scope = dept ? `dept-${dept}` : progs ? `progs-${progs}` : "all";
  const sy = input.schoolYear.trim();
  const sem = input.semester.trim();
  return `sheet:${isoDate}:${scope}:${sy}:${sem}`;
}

export type FacultySearchResult = {
  id: number;
  fullName: string;
  surname: string;
  departmentCode: string | null;
  departmentName: string | null;
  isAlreadyOnSheet: boolean;
  isCustomSaved: boolean;
  roomSummary: string | null;
};

// Search existing faculty records in the database with case-insensitivity and normalization.
// Also identifies whether the faculty member is already on the target sheet or in the reusable pool.
export async function searchFacultyForSheet(
  query: string,
  targetDate: Date,
  term: Term,
  currentSheetFacultyIds: number[] = [],
): Promise<FacultySearchResult[]> {
  const q = query.trim();
  const normalizedQ = normalizeFacultyName(q);
  const currentSet = new Set(currentSheetFacultyIds);

  // If query is empty, surface existing reusable custom faculty first
  const facultyRecords = q
    ? await prisma.faculty.findMany({
        where: {
          active: true,
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { surname: { contains: q, mode: "insensitive" } },
          ],
        },
        include: { department: true },
        take: 15,
        orderBy: [{ surname: "asc" }, { fullName: "asc" }],
      })
    : await prisma.customFaculty.findMany({
        include: { faculty: { include: { department: true } } },
        take: 15,
        orderBy: [{ updatedAt: "desc" }],
      }).then((rows) => rows.map((r) => r.faculty));

  // Determine room assignments for target date & term
  const weekday = weekdayOfDate(targetDate);
  const facultyIds = facultyRecords.map((f) => f.id);

  const [slots, overrides, customSavedRows] = await Promise.all([
    facultyIds.length
      ? prisma.scheduleSlot.findMany({
          where: {
            facultyId: { in: facultyIds },
            weekday,
            ...termWhere(term),
          },
          include: { room: true },
        })
      : Promise.resolve([]),
    facultyIds.length
      ? prisma.attendance.findMany({
          where: {
            date: targetDate,
            roomOverride: { not: null },
            slot: { facultyId: { in: facultyIds } },
          },
          select: { slotId: true, roomOverride: true },
        })
      : Promise.resolve([]),
    facultyIds.length
      ? prisma.customFaculty.findMany({
          where: { facultyId: { in: facultyIds } },
          select: { facultyId: true },
        })
      : Promise.resolve([]),
  ]);

  const overrideBySlot = new Map(overrides.map((o) => [o.slotId, o.roomOverride!]));
  const customSavedSet = new Set(customSavedRows.map((c) => c.facultyId));

  const roomsByFaculty = new Map<number, Set<string>>();
  for (const s of slots) {
    if (s.facultyId == null) continue;
    const room = overrideBySlot.get(s.id) ?? s.room.code;
    if (!roomsByFaculty.has(s.facultyId)) {
      roomsByFaculty.set(s.facultyId, new Set());
    }
    roomsByFaculty.get(s.facultyId)!.add(room);
  }

  return facultyRecords.map((f) => {
    const rooms = Array.from(roomsByFaculty.get(f.id) ?? []);
    const roomSummary = rooms.length > 0 ? rooms.join(", ") : null;
    return {
      id: f.id,
      fullName: f.fullName,
      surname: f.surname,
      departmentCode: f.department?.code ?? null,
      departmentName: f.department?.name ?? null,
      isAlreadyOnSheet: currentSet.has(f.id),
      isCustomSaved: customSavedSet.has(f.id),
      roomSummary,
    };
  });
}

// Retrieve custom faculty members manually added to a sheet.
export async function getCustomFacultyForSheet(sheetKey: string) {
  return prisma.sheetCustomFaculty.findMany({
    where: {
      sheetKey,
      action: "CUSTOM_ADD",
    },
    include: {
      faculty: { include: { department: true } },
      course: { include: { college: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export type CustomSheetEntry = Awaited<ReturnType<typeof getCustomFacultyForSheet>>[number];

export type AddCustomFacultyResult =
  | { ok: true; sheetEntry: CustomSheetEntry }
  | { ok: false; error: string };

// Retrieve faculty IDs that have been explicitly excluded/removed from an automatically generated sheet.
export async function getExcludedFacultyIdsForSheet(sheetKey: string): Promise<Set<number>> {
  const excluded = await prisma.sheetCustomFaculty.findMany({
    where: {
      sheetKey,
      action: "EXCLUDED",
    },
    select: { facultyId: true },
  });
  return new Set(excluded.map((e) => e.facultyId));
}

// Add a faculty member to a specific attendance print sheet.
// Also saves them into the reusable CustomFaculty registry.
export async function addCustomFacultyToSheet(params: {
  sheetKey: string;
  date: Date;
  facultyId: number;
  courseId?: number | null;
  userId?: number | null;
  notes?: string;
}): Promise<AddCustomFacultyResult> {
  const { sheetKey, date, facultyId, courseId, userId, notes } = params;

  // Validate faculty existence
  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    include: { department: true },
  });
  if (!faculty) {
    return { ok: false, error: "Faculty member does not exist in the database." };
  }

  // Check if already on this sheet
  const existing = await prisma.sheetCustomFaculty.findUnique({
    where: { sheetKey_facultyId: { sheetKey, facultyId } },
  });
  if (existing && existing.action === "CUSTOM_ADD") {
    return { ok: false, error: "Faculty member is already included in this attendance sheet." };
  }

  // Execute in transaction: preserve reusable selection and link to sheet
  return prisma.$transaction(async (tx) => {
    // 1. Maintain reusable CustomFaculty entry
    const customRecord = await tx.customFaculty.upsert({
      where: { facultyId },
      update: { notes: notes ?? undefined, updatedAt: new Date() },
      create: { facultyId, notes },
    });

    // 2. Link to this specific sheet
    const sheetEntry = await tx.sheetCustomFaculty.upsert({
      where: { sheetKey_facultyId: { sheetKey, facultyId } },
      update: {
        action: "CUSTOM_ADD",
        courseId: courseId ?? undefined,
        customFacultyId: customRecord.id,
        createdById: userId ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        sheetKey,
        date,
        facultyId,
        courseId: courseId ?? null,
        customFacultyId: customRecord.id,
        action: "CUSTOM_ADD",
        createdById: userId ?? null,
      },
      include: {
        faculty: { include: { department: true } },
        course: { include: { college: true } },
      },
    });

    return { ok: true, sheetEntry };
  });
}

// Remove a faculty member from a specific attendance print sheet.
// If custom: deletes association with sheet while preserving master faculty & reusable selection.
// If automatically included: marks as EXCLUDED for this sheet so they stay removed on refresh.
export async function removeFacultyFromSheet(params: {
  sheetKey: string;
  date: Date;
  facultyId: number;
  isCustom: boolean;
  userId?: number | null;
}) {
  const { sheetKey, date, facultyId, isCustom, userId } = params;

  if (isCustom) {
    // Delete sheet association only; master faculty and reusable pool remain intact
    await prisma.sheetCustomFaculty.deleteMany({
      where: { sheetKey, facultyId },
    });
    return { ok: true, removedType: "custom" };
  } else {
    // Mark as EXCLUDED for this sheet
    await prisma.sheetCustomFaculty.upsert({
      where: { sheetKey_facultyId: { sheetKey, facultyId } },
      update: {
        action: "EXCLUDED",
        updatedAt: new Date(),
      },
      create: {
        sheetKey,
        date,
        facultyId,
        action: "EXCLUDED",
        createdById: userId ?? null,
      },
    });
    return { ok: true, removedType: "excluded" };
  }
}

// Restore an excluded faculty member back to the sheet.
export async function restoreExcludedFacultyOnSheet(sheetKey: string, facultyId: number) {
  await prisma.sheetCustomFaculty.deleteMany({
    where: { sheetKey, facultyId, action: "EXCLUDED" },
  });
  return { ok: true };
}
