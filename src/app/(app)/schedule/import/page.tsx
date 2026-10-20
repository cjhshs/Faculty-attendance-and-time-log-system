import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getActiveTerm, listTerms, normalizeSemester, parseTerm } from "@/lib/terms";
import { ImportClient } from "./ImportClient";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolYear?: string; semester?: string }>;
}) {
  await requirePermission(PERMISSIONS.SCHEDULE_IMPORT);
  const params = await searchParams;
  const [activeTerm, terms] = await Promise.all([getActiveTerm(), listTerms()]);
  const preselected = parseTerm(params.schoolYear, params.semester);

  const defaultSchoolYear = preselected?.schoolYear ?? activeTerm.schoolYear;
  const defaultSemester = normalizeSemester(params.semester) ?? activeTerm.semester;
  const knownYears = Array.from(new Set(terms.map((t) => t.schoolYear)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Import Schedule</h1>
        <p className="page-subtitle">
          Upload the schedule workbook, choose the target semester, review the preview, then
          confirm.
        </p>
      </div>
      <ImportClient
        defaultSchoolYear={defaultSchoolYear}
        defaultSemester={defaultSemester}
        knownYears={knownYears}
      />
    </div>
  );
}
