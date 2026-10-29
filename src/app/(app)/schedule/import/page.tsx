import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getActiveTerm, listTerms, normalizeSemester, parseTerm, SEMESTER_OPTIONS } from "@/lib/terms";
import { listAcademicPeriods } from "@/lib/academic-period";
import { prisma } from "@/lib/prisma";
import { ImportClient } from "./ImportClient";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolYear?: string; semester?: string }>;
}) {
  await requirePermission(PERMISSIONS.SCHEDULE_IMPORT);
  const params = await searchParams;
  const [activeTerm, terms, periods, history] = await Promise.all([
    getActiveTerm(),
    listTerms(),
    listAcademicPeriods(),
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { importedBy: { select: { name: true } } },
    }),
  ]);
  const preselected = parseTerm(params.schoolYear, params.semester);

  const defaultSchoolYear = preselected?.schoolYear ?? activeTerm.schoolYear;
  const defaultSemester = normalizeSemester(params.semester) ?? activeTerm.semester;
  const knownYears = Array.from(new Set(terms.map((t) => t.schoolYear)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Import Schedule</h1>
        <p className="page-subtitle">
          Upload the schedule workbook, choose the target academic period, review the preview, then
          confirm. Nothing is written until you confirm, and no existing period is replaced.
        </p>
      </div>
      <ImportClient
        defaultSchoolYear={defaultSchoolYear}
        defaultSemester={defaultSemester}
        knownYears={knownYears}
        semesters={[...SEMESTER_OPTIONS]}
        periods={periods.map((p) => ({
          schoolYear: p.schoolYear,
          semester: p.semester,
          configured: p.configured,
          startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
          endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
          status: p.status,
        }))}
        importHistory={history.map((batch) => ({
          id: batch.id,
          filename: batch.filename,
          schoolYear: batch.schoolYear,
          semester: batch.semester,
          slotCount: batch.slotCount,
          checksum: batch.checksum,
          createdAt: batch.createdAt.toISOString(),
          importedBy: batch.importedBy?.name ?? null,
        }))}
      />
    </div>
  );
}
