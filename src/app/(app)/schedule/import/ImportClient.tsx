"use client";

import { useState } from "react";
import { useConfirm } from "../../confirm";
import type { ImportPlan, CommitResult } from "@/lib/import";
import { WEEKDAY_SHORT } from "@/lib/dates";
import {
  IMPORT_RANGE_OPTIONS,
  type ImportRangeMode,
} from "@/lib/import-range-shared";

type PreviewRange = {
  mode: ImportRangeMode;
  startDate: string | null;
  endDate: string | null;
  warning: string | null;
  coverage: string;
};

type PeriodOption = {
  schoolYear: string;
  semester: string;
  configured: boolean;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
};

type DuplicateImport = {
  id: number;
  filename: string;
  schoolYear: string;
  semester: string;
  slotCount: number;
  checksum: string | null;
  createdAt: string;
  message?: string;
};

type ImportHistoryEntry = {
  id: number;
  filename: string;
  schoolYear: string;
  semester: string;
  slotCount: number;
  checksum: string | null;
  createdAt: string;
  importedBy: string | null;
};

export function ImportClient({
  defaultSchoolYear,
  defaultSemester,
  knownYears,
  semesters,
  periods,
  importHistory,
}: {
  defaultSchoolYear: string;
  defaultSemester: string;
  knownYears: string[];
  semesters: string[];
  periods: PeriodOption[];
  importHistory: ImportHistoryEntry[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [semester, setSemester] = useState(defaultSemester);
  const [scopeCollege, setScopeCollege] = useState("CET");
  const [scopeProgram, setScopeProgram] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicateImport, setDuplicateImport] = useState<DuplicateImport | null>(null);
  const [termWarning, setTermWarning] = useState<string | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<PeriodOption | null>(null);
  const [previewRange, setPreviewRange] = useState<PreviewRange | null>(null);
  // Semester (default) preserves the existing behaviour. Custom Range reveals
  // the two date inputs and is validated before either preview or commit.
  const [rangeMode, setRangeMode] = useState<ImportRangeMode>("semester");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Explicit administrator choices for duplicate roster names, keyed by the
  // normalized instructor name from the preview. Empty until a human chooses.
  const [facultyAssignments, setFacultyAssignments] = useState<Record<string, number>>({});
  const [reprocessOnly, setReprocessOnly] = useState(false);
  const { confirm, dialog } = useConfirm();

  function resetPreview() {
    setPlan(null);
    setResult(null);
    setError(null);
    setDuplicateImport(null);
    setTermWarning(null);
    setPreviewPeriod(null);
    setPreviewRange(null);
    setFacultyAssignments({});
  }

  // Client-side mirror of the server validator. It gives an immediate, clear
  // message; the API repeats every check so a crafted request cannot bypass it.
  function rangeError(): string | null {
    if (rangeMode !== "custom") return null;
    if (!startDate) return "Start Date is required for a Custom Range.";
    if (!endDate) return "End Date is required for a Custom Range.";
    if (endDate < startDate) return "End Date cannot be earlier than Start Date.";
    const period = periods.find(
      (p) => p.schoolYear.trim() === schoolYear.trim() && p.semester === semester,
    );
    if (period?.startDate && period.endDate) {
      if (startDate < period.startDate || endDate > period.endDate) {
        return `The selected range (${startDate} to ${endDate}) is outside the configured semester (${period.startDate} to ${period.endDate}). Choose dates inside the semester.`;
      }
    } else if (!period?.startDate || !period?.endDate) {
      return `${schoolYear.trim() || "—"} · ${semester} has no reviewed semester dates. Set them on Settings before importing a Custom Range.`;
    }
    return null;
  }

  function buildBody(confirmDuplicate = false) {
    const body = new FormData();
    if (file) body.append("file", file);
    body.append("schoolYear", schoolYear);
    body.append("semester", semester);
    body.append("rangeMode", rangeMode);
    if (rangeMode === "custom") {
      body.append("startDate", startDate);
      body.append("endDate", endDate);
    }
    if (scopeCollege) body.append("college", scopeCollege);
    if (scopeProgram) body.append("program", scopeProgram);
    if (confirmDuplicate) body.append("confirmDuplicate", "1");
    if (reprocessOnly) body.append("reprocessOnly", "1");
    if (Object.keys(facultyAssignments).length > 0) {
      body.append("facultyAssignments", JSON.stringify(facultyAssignments));
    }
    return body;
  }

  async function preview() {
    if (!file) return;
    if (!schoolYear.trim()) {
      setError("Enter the target academic year (for example 2027-2028).");
      return;
    }
    const rangeProblem = rangeError();
    if (rangeProblem) {
      setError(rangeProblem);
      return;
    }
    setLoading(true);
    resetPreview();
    setScopeCollege("CET");
    setScopeProgram("");
    try {
      const res = await fetch("/api/schedule/preview", { method: "POST", body: buildBody() });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Your session has expired or you no longer have permission. Sign in again; no file was imported.",
        );
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed.");
      setPlan(data.plan);
      setDuplicateImport(data.duplicateImport ?? null);
      setPreviewPeriod(data.period ?? null);
      setPreviewRange(data.range ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function commit(forceDuplicate = false) {
    if (!file) return;
    const termLabel = `${schoolYear.trim()} ${semester}`;
    const scopeLabel = scopeProgram || scopeCollege || "all colleges";
    const rangeProblem = rangeError();
    if (rangeProblem) {
      setError(rangeProblem);
      return;
    }
    const rangeLabel =
      rangeMode === "custom"
        ? ` Custom Range ${startDate} to ${endDate}`
        : " the semester default range";
    if (duplicateImport && !forceDuplicate) {
      const ok = await confirm({
        title: "Import this file again?",
        message: `${duplicateImport.message ?? "This exact file was already imported into this academic period."} Import it again into ${termLabel}? Existing attendance is not affected, but the same schedule records will be written again.`,
        confirmLabel: "Import again",
        tone: "danger",
      });
      if (!ok) return;
      forceDuplicate = true;
    }
    const unresolved = plan
      ? plan.facultyReview.filter(
          (entry) =>
            entry.kind === "ambiguous" &&
            !entry.candidates.some(
              (candidate) => candidate.facultyId === facultyAssignments[entry.key],
            ),
        ).length
      : 0;
    if (unresolved > 0) {
      setError(
        `Resolve ${unresolved} ambiguous instructor name${
          unresolved === 1 ? "" : "s"
        } before importing. Use the "Choose the correct faculty member" selector in the Instructor review section. Nothing was saved.`,
      );
      return;
    }
    if (
      !(await confirm({
        title: reprocessOnly ? "Reprocess schedules?" : "Import schedules?",
        message: reprocessOnly
          ? `Reprocess ${scopeLabel} from this file into ${termLabel}? Only meetings that already exist in this semester are updated. No new slots and no attendance records are written.`
          : `Import ${scopeLabel} from this file into ${termLabel} for${rangeLabel}? Existing schedules in that semester are updated, never deleted. Blank attendance rows will be created only inside that range; already encoded attendance is never changed. Conflicts are always checked across every department in the file.`,
        confirmLabel: reprocessOnly ? "Reprocess" : "Import",
      }))
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/commit", {
        method: "POST",
        body: buildBody(forceDuplicate),
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Your session has expired or you no longer have permission. Sign in again; nothing was imported.",
        );
      }
      const data = await res.json();
      if (res.status === 409 && data.requiresConfirmation) {
        setDuplicateImport(data.duplicateImport ?? null);
        setError(
          `${data.error} Nothing was saved. Review the import history, then use “Import anyway” only if this repeat is intentional.`,
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setResult(data.result);
      setTermWarning(data.termWarning ?? null);
      setPlan(null);
      setDuplicateImport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  function downloadErrors() {
    if (!plan || plan.errors.length === 0) return;
    const rows = [["Row", "Issue"]];
    for (const e of plan.errors) rows.push([String(e.row), e.message]);
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule-import-invalid-rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedPeriod =
    previewPeriod ??
    periods.find(
      (p) => p.schoolYear === schoolYear.trim() && p.semester === semester,
    ) ??
    null;

  return (
    <div className="space-y-6">
      {dialog}
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="schedule-file">
            Schedule Excel file (.xlsx)
          </label>
          <input
            id="schedule-file"
            type="file"
            accept=".xlsx,.xls"
            className="input max-w-md"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              resetPreview();
            }}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
          <div>
            <label className="label req" htmlFor="import-year">
              Target academic year
            </label>
            <input
              id="import-year"
              list="import-years"
              className="input"
              value={schoolYear}
              onChange={(e) => {
                setSchoolYear(e.target.value);
                resetPreview();
              }}
              placeholder="e.g. 2027-2028"
            />
            <datalist id="import-years">
              {knownYears.map((y) => (
                <option key={y} value={y} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label req" htmlFor="import-sem">
              Target semester
            </label>
            <select
              id="import-sem"
              className="select"
              value={semester}
              onChange={(e) => {
                setSemester(e.target.value);
                resetPreview();
              }}
            >
              {semesters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={preview} disabled={!file || loading}>
            {loading ? "Working…" : "Preview import"}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
          <div>
            <label className="label" htmlFor="import-range">
              Import range
            </label>
            <select
              id="import-range"
              className="select"
              value={rangeMode}
              onChange={(e) => {
                const mode = e.target.value as ImportRangeMode;
                setRangeMode(mode);
                if (mode === "custom") {
                  // Seed from the configured semester, never from a hardcoded date.
                  const period = periods.find(
                    (p) => p.schoolYear.trim() === schoolYear.trim() && p.semester === semester,
                  );
                  setStartDate(period?.startDate ?? "");
                  setEndDate(period?.endDate ?? "");
                }
                resetPreview();
              }}
            >
              {IMPORT_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {rangeMode === "custom" ? (
            <>
              <div>
                <label className="label req" htmlFor="import-start">
                  Start Date
                </label>
                <input
                  id="import-start"
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    resetPreview();
                  }}
                />
              </div>
              <div>
                <label className="label req" htmlFor="import-end">
                  End Date
                </label>
                <input
                  id="import-end"
                  type="date"
                  className="input"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    resetPreview();
                  }}
                />
              </div>
            </>
          ) : null}
          {rangeError() ? (
            <p className="w-full text-xs text-red-600" role="alert">
              {rangeError()}
            </p>
          ) : null}
        </div>

        <p className="text-xs text-muted">
          Columns are matched by header name. Slots are imported into{" "}
          <strong>
            {schoolYear.trim() || "—"} · {semester}
          </strong>
          . Nothing is saved until you confirm.
        </p>

        <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs">
          <p>
            <strong>Academic period:</strong> {schoolYear.trim() || "—"} · {semester}
            {selectedPeriod?.startDate && selectedPeriod.endDate ? (
              <>
                {" "}
                · {selectedPeriod.startDate} to {selectedPeriod.endDate}
                {selectedPeriod.status ? ` · ${selectedPeriod.status.toLowerCase()}` : ""}
              </>
            ) : selectedPeriod ? (
              " · semester dates not configured"
            ) : (
              " · not registered yet"
            )}
          </p>
          {!selectedPeriod ? (
            <p className="mt-1 text-amber-800">
              This period is not registered. Confirming the import registers it with no semester
              dates; dates are never guessed from the workbook.
            </p>
          ) : !selectedPeriod.startDate || !selectedPeriod.endDate ? (
            <p className="mt-1 text-amber-800">
              This period has no reviewed semester dates. The import can still proceed, but
              attendance dates cannot be checked against a semester boundary until they are set on
              Settings.
            </p>
          ) : null}
        </div>

        {previewRange ? (
          <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs">
            <p>
              <strong>Import range:</strong>{" "}
              {previewRange.startDate && previewRange.endDate
                ? `${previewRange.mode === "custom" ? "Custom Range" : "Semester (default)"}: ${previewRange.startDate} to ${previewRange.endDate}`
                : "Semester default (no reviewed semester dates)"}
            </p>
            <p className="mt-1 text-muted">{previewRange.coverage}</p>
            {previewRange.warning ? (
              <p className="mt-1 text-amber-800">{previewRange.warning}</p>
            ) : (
              <p className="mt-1 text-muted">
                Blank attendance rows will be created only inside this range. Existing manually
                encoded attendance is never overwritten.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {duplicateImport ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">This file was already imported into this period.</p>
          <p className="mt-1 text-xs">
            {duplicateImport.message ??
              `Batch #${duplicateImport.id} imported ${duplicateImport.filename} into ${duplicateImport.schoolYear} · ${duplicateImport.semester} with ${duplicateImport.slotCount} slot(s) written.`}{" "}
            Existing attendance and other periods are not affected. Re-importing is only for a
            deliberate refresh of the same schedule.
          </p>
          <button type="button" className="btn btn-sm mt-2" onClick={() => commit(true)} disabled={loading}>
            Import anyway
          </button>
        </div>
      ) : null}

      {error ? <div className="alert alert-error">{error}</div> : null}

      {termWarning ? <div className="alert alert-warn">{termWarning}</div> : null}

      {result ? (
        <div className="alert alert-success">
          {reprocessOnly ? "Reprocess" : "Import"} complete into {schoolYear.trim()} {semester}:{" "}
          {result.created} added, {result.updated} updated, {result.unchanged} unchanged.{" "}
          {result.facultyCreated} new faculty, {result.programsCreated} new program(s),{" "}
          {result.roomsCreated} new room(s).
          {result.skippedNew > 0
            ? ` ${result.skippedNew} new slot(s) were skipped because reprocessing never creates new meetings.`
            : ""}
          {result.skippedOutOfScope > 0
            ? ` ${result.skippedOutOfScope} slot(s) left untouched because they are outside the selected college/course.`
            : ""}
          {result.ambiguousUnlinked > 0
            ? ` ${result.ambiguousUnlinked} instructor link(s) were left unlinked because the name matches more than one faculty record; resolve them and import again.`
            : ""}
          {result.batchId ? ` Recorded as import batch #${result.batchId}.` : ""}
          {result.attendanceRowsCreated > 0
            ? ` ${result.attendanceRowsCreated} blank attendance row(s) were created across ${result.attendanceDates} date(s) in the selected range; encoded attendance was left untouched.`
            : " No attendance rows were created."}
          {result.errors > 0 ? ` ${result.errors} row(s) were skipped.` : ""}
        </div>
      ) : null}

      {plan ? (
        <PlanView
          plan={plan}
          onConfirm={commit}
          loading={loading}
          onDownloadErrors={downloadErrors}
          scopeCollege={scopeCollege}
          scopeProgram={scopeProgram}
          onCollegeChange={(value) => {
            setScopeCollege(value);
            setScopeProgram("");
          }}
          onProgramChange={setScopeProgram}
          facultyAssignments={facultyAssignments}
          onFacultyAssignment={(key, facultyId) =>
            setFacultyAssignments((current) => {
              const next = { ...current };
              if (facultyId == null) delete next[key];
              else next[key] = facultyId;
              return next;
            })
          }
          reprocessOnly={reprocessOnly}
          onReprocessChange={setReprocessOnly}
        />
      ) : null}

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-navy">
          Import history ({importHistory.length})
        </h3>
        <p className="mb-2 text-xs text-muted">
          Every committed upload is recorded with its academic period and a checksum. Re-uploading
          the exact same file into the same period asks for confirmation before writing anything.
        </p>
        {importHistory.length === 0 ? (
          <p className="text-sm text-muted">No schedules have been imported yet.</p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="data-table min-w-[38rem]">
              <caption className="visually-hidden">Import history</caption>
              <thead>
                <tr>
                  <th scope="col">Imported</th>
                  <th scope="col">File</th>
                  <th scope="col">Academic period</th>
                  <th scope="col">Slots</th>
                  <th scope="col">By</th>
                  <th scope="col">Checksum</th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((batch) => (
                  <tr key={batch.id}>
                    <td className="whitespace-nowrap text-xs">{batch.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td className="max-w-[16rem] truncate text-xs" title={batch.filename}>
                      {batch.filename}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {batch.schoolYear} · {batch.semester}
                    </td>
                    <td className="text-center text-xs">{batch.slotCount}</td>
                    <td className="text-xs">{batch.importedBy ?? "—"}</td>
                    <td className="text-xs text-muted">
                      {batch.checksum ? `${batch.checksum.slice(0, 10)}…` : "not recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanView({
  plan,
  onConfirm,
  loading,
  onDownloadErrors,
  scopeCollege,
  scopeProgram,
  onCollegeChange,
  onProgramChange,
  facultyAssignments,
  onFacultyAssignment,
  reprocessOnly,
  onReprocessChange,
}: {
  plan: ImportPlan;
  onConfirm: () => void;
  loading: boolean;
  onDownloadErrors: () => void;
  scopeCollege: string;
  scopeProgram: string;
  onCollegeChange: (value: string) => void;
  onProgramChange: (value: string) => void;
  facultyAssignments: Record<string, number>;
  onFacultyAssignment: (key: string, facultyId: number | null) => void;
  reprocessOnly: boolean;
  onReprocessChange: (value: boolean) => void;
}) {
  const s = plan.summary;
  const collegeNames = new Map<string, string>();
  for (const m of plan.programMapping) {
    if (m.collegeCode && m.collegeName) collegeNames.set(m.collegeCode, m.collegeName);
  }
  const collegeCodes = Array.from(collegeNames.keys());
  const hasUnassigned = plan.programMapping.some((m) => !m.collegeCode);

  const inScope = (m: { collegeCode: string | null; code: string }) =>
    scopeProgram
      ? m.code === scopeProgram
      : scopeCollege
        ? scopeCollege === "unassigned"
          ? !m.collegeCode
          : m.collegeCode === scopeCollege
        : true;
  const scopeMapping = plan.programMapping.filter(inScope);
  const scopeCodes = new Set(scopeMapping.map((m) => m.code));
  const scopeSlots = plan.slots.filter((slot) => {
    if (scopeProgram) return slot.courseCode === scopeProgram;
    if (!scopeCollege) return true;
    return scopeCodes.has(slot.courseCode);
  });
  const scopeNewSlots = scopeSlots.filter((slot) => slot.status === "new");
  const scopeUpdatedSlots = scopeSlots.filter((slot) => slot.status === "update");
  // Reprocessing never creates a slot, so only updates to already-existing
  // meetings count as changes. The button stays disabled when there is nothing
  // safe to write.
  const scopeChanges = reprocessOnly ? scopeUpdatedSlots.length : scopeNewSlots.length + scopeUpdatedSlots.length;
  const ambiguousEntries = plan.facultyReview.filter((entry) => entry.kind === "ambiguous");
  const unresolvedAmbiguous = ambiguousEntries.filter(
    (entry) => !entry.candidates.some((candidate) => candidate.facultyId === facultyAssignments[entry.key]),
  );
  const scopeRows = scopeMapping.reduce((n, m) => n + m.rows, 0);
  const scopeLabel = scopeProgram
    ? scopeProgram
    : scopeCollege === "unassigned"
      ? "Unassigned programs"
      : scopeCollege
        ? `${scopeCollege} — ${collegeNames.get(scopeCollege) ?? ""}`
        : "All colleges";

  const programOptions = plan.programMapping.filter((m) =>
    scopeCollege
      ? scopeCollege === "unassigned"
        ? !m.collegeCode
        : m.collegeCode === scopeCollege
      : true,
  );

  const sourceMismatch = plan.targetTerm
    ? plan.sourceSemesters.filter((entry) => entry.semester !== plan.targetTerm!.semester)
    : [];

  return (
    <div className="space-y-4">
      {plan.targetTerm ? (
        <p className="text-sm text-muted">
          Importing into{" "}
          <strong>
            {plan.targetTerm.schoolYear} · {plan.targetTerm.semester}
          </strong>
        </p>
      ) : null}

      {plan.sourceSemesters.length > 0 ? (
        <div
          className={
            "rounded-md border px-3 py-2 text-xs " +
            (sourceMismatch.length
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-line bg-slate-50 text-muted")
          }
        >
          <strong>Semester written in the workbook:</strong>{" "}
          {plan.sourceSemesters
            .map((entry) => `${entry.semester} (${entry.rows} row${entry.rows === 1 ? "" : "s"})`)
            .join(", ")}
          .{" "}
          {sourceMismatch.length
            ? `These rows will still be imported into the selected period (${
                plan.targetTerm?.schoolYear ?? "—"
              } · ${plan.targetTerm?.semester ?? "—"}). The source value is reported, never used to move the rows into another period.`
            : "The workbook term matches the selected target period."}
        </div>
      ) : null}

      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-navy">Import scope</h3>
          <p className="text-xs text-muted">
            Only the selected college or course is written. The whole file is always validated, so
            instructor conflicts between departments are still reported.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">
              College / Department
            </label>
            <div className="rounded-md border border-line bg-slate-100 px-3 py-2 text-sm font-semibold text-navy">
              CET — College of Engineering and Technology
            </div>
          </div>
          <div>
            <label className="label" htmlFor="import-scope-program">
              Course / Program
            </label>
            <select
              id="import-scope-program"
              className="input"
              value={scopeProgram}
              onChange={(e) => onProgramChange(e.target.value)}
            >
              <option value="">All programs in scope</option>
              {programOptions.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} — {m.name ?? "unnamed"} ({m.slots} slot
                  {m.slots === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={reprocessOnly}
            onChange={(e) => onReprocessChange(e.target.checked)}
          />
          <span>
            <strong className="text-navy">Reprocess existing slots only.</strong> Update meetings that
            already exist in this period from the current roster; never create a new slot, never
            touch attendance, and keep the import history. Use this after changing department
            membership so future imports and existing schedules use the corrected link.
          </span>
        </label>
        <p className="text-xs">
          <strong>Scope:</strong> {scopeLabel} · {scopeMapping.length} program
          {scopeMapping.length === 1 ? "" : "s"} · {scopeRows} source row
          {scopeRows === 1 ? "" : "s"} · {scopeSlots.length} slot
          {scopeSlots.length === 1 ? "" : "s"} ·{" "}
          <strong>{scopeChanges} change{scopeChanges === 1 ? "" : "s"} to write</strong>
          {reprocessOnly && scopeNewSlots.length > 0
            ? ` · ${scopeNewSlots.length} new slot(s) will be skipped`
            : ""}
        </p>
        {unresolvedAmbiguous.length > 0 ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            {unresolvedAmbiguous.length} ambiguous instructor name
            {unresolvedAmbiguous.length === 1 ? "" : "s"} must be resolved in the Instructor review
            section before this import can be confirmed.
          </p>
        ) : null}
      </div>

      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-navy">Department Classification Breakdown</h3>
          <p className="text-xs text-muted">
            Parsed rows classified strictly by the instructor&apos;s registered faculty department (independent of teaching assignment or student course codes).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="CET" value={s.departmentBreakdown?.cet ?? 0} tone="green" hint="Engineering & Tech" />
          <Stat label="CBE" value={s.departmentBreakdown?.cbe ?? 0} hint="Business Education" />
          <Stat label="CTE" value={s.departmentBreakdown?.cte ?? 0} hint="Teacher Education" />
          <Stat label="COAHS" value={s.departmentBreakdown?.coahs ?? 0} hint="Allied Health Sciences" />
          <Stat label="Other" value={s.departmentBreakdown?.other ?? 0} hint="Other colleges" />
          <Stat
            label="Unassigned"
            value={s.departmentBreakdown?.unassigned ?? 0}
            tone={s.departmentBreakdown?.unassigned ? "amber" : undefined}
            hint="No department / TBA"
          />
        </div>
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-xs font-medium text-navy">Instructor Review Summary:</p>
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
            <span>
              <strong>Unassigned</strong> (in roster, no department):{" "}
              <span className="font-semibold text-amber-700">{s.instructorReviewCounts?.unassigned ?? 0}</span>
            </span>
            <span>
              <strong>Unmatched</strong> (not in faculty roster):{" "}
              <span className="font-semibold text-red-700">{s.instructorReviewCounts?.unmatched ?? 0}</span>
            </span>
            <span>
              <strong>Ambiguous</strong> (multiple roster matches):{" "}
              <span className="font-semibold text-red-700">{s.instructorReviewCounts?.ambiguous ?? 0}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Rows read" value={s.dataRows} />
        <Stat label="Importable" value={s.importable} />
        <Stat label="New slots" value={s.newSlots} tone="green" />
        <Stat label="Updated" value={s.updatedSlots} tone="blue" />
        <Stat label="Duplicate" value={s.duplicateSlots} />
        <Stat label="Unchanged" value={s.unchangedSlots} />
        <Stat label="New faculty" value={s.newFaculty} tone="green" />
        <Stat label="Errors" value={s.errorRows} tone={s.errorRows ? "red" : undefined} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Conflicts" value={s.conflicts} tone={s.conflicts ? "red" : undefined} />
        <Stat label="Combined" value={s.combinedClasses} />
        <Stat label="Duplicate records" value={s.duplicateSchedules} />
        <Stat label="No room yet (TBA)" value={s.tbaClassrooms} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Programs in file" value={s.programsInFile} />
        <Stat label="Mapped to a college" value={s.programsMapped} tone="green" />
        <Stat
          label="Unassigned"
          value={s.programsUnassigned}
          tone={s.programsUnassigned ? "red" : undefined}
        />
        <Stat
          label="Unknown codes"
          value={s.programsUnknown}
          tone={s.programsUnknown ? "red" : undefined}
        />
        <Stat
          label="Instructor review"
          value={plan.facultyReview.length}
          tone={plan.facultyReview.length ? "red" : undefined}
        />
      </div>

      <p className="text-xs text-muted">
        Reconciliation — worksheet rows: {s.worksheetRows} · data rows: {s.dataRows} · parsed
        without error: {s.parsedRows} · error rows: {s.errorRows} · warning rows: {s.warningRows} ·
        meeting entries: {s.meetingEntries} · valid meeting blocks: {s.validBlocks} · faculty
        conflicts: {s.conflicts} · possible combined classes: {s.combinedClasses} · duplicate
        records: {s.duplicateSchedules} · incomplete schedules: {s.incompleteSchedules} · programs:{" "}
        {s.programsInFile}
      </p>

      <Section title={`Program mapping (${plan.programMapping.length})`}>
        <p className="mb-2 text-xs text-muted">
          Every course code in the file is listed. Unassigned programs are imported but wait for an
          administrator to choose a college on the Master Data page.
        </p>
        <div className="max-h-80 overflow-auto">
          <table className="data-table">
            <caption className="visually-hidden">Program mapping</caption>
            <thead>
              <tr>
                <th scope="col">Course code</th>
                <th scope="col">Program name</th>
                <th scope="col">College</th>
                <th scope="col">Rows</th>
                <th scope="col">Slots</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {plan.programMapping.map((m) => (
                <tr key={m.code}>
                  <td className="font-medium">{m.code}</td>
                  <td>{m.name ?? <span className="text-muted">Not in the official catalog</span>}</td>
                  <td>{m.collegeCode ? `${m.collegeCode} — ${m.collegeName}` : "Unassigned"}</td>
                  <td className="text-center">{m.rows}</td>
                  <td className="text-center">{m.slots}</td>
                  <td>
                    {!m.inCatalog ? (
                      <span className="badge badge-danger">Unknown code</span>
                    ) : m.collegeCode === null ? (
                      <span className="badge badge-warn">Needs review</span>
                    ) : m.official ? (
                      <span className="badge badge-success">Official</span>
                    ) : (
                      <span className="badge badge-info">Additional program</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() => {
                        onCollegeChange(m.collegeCode ?? "");
                        onProgramChange(m.code);
                      }}
                    >
                      Import only this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {plan.facultyReview.length ? (
        <Section title={`Instructor review (${plan.facultyReview.length})`} tone="amber">
          <p className="mb-2 text-xs text-muted">
            These instructor names could not be matched safely to one registered faculty member.
            Unknown names may be new hires or typos; ambiguous names match more than one roster row
            and must be resolved here. All imported faculty are assigned to CET.
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="data-table">
              <caption className="visually-hidden">Instructor review</caption>
              <thead>
                <tr>
                  <th scope="col">Instructor in file</th>
                  <th scope="col">Issue</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Programs</th>
                  <th scope="col">Possible roster match</th>
                  <th scope="col">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {plan.facultyReview.map((entry) => (
                  <tr key={`${entry.kind}-${entry.name}`}>
                    <td className="font-medium">{entry.name}</td>
                    <td>
                      {entry.kind === "unknown" ? (
                        <span className="badge badge-danger">Unknown instructor</span>
                      ) : entry.kind === "ambiguous" ? (
                        <span className="badge badge-danger">Ambiguous name</span>
                      ) : (
                        <span className="badge badge-warn">No department</span>
                      )}
                    </td>
                    <td className="text-center">{entry.rows.join(", ")}</td>
                    <td>{entry.programs.join(", ") || "—"}</td>
                    <td>
                      {entry.candidates.length === 0 ? (
                        <span className="text-muted">None — add the faculty on Master Data</span>
                      ) : (
                        entry.candidates
                          .map(
                            (c) =>
                              `${c.fullName} (#${c.facultyId}, ${c.departmentCode ?? "no department"})`,
                          )
                          .join("; ")
                      )}
                    </td>
                    <td>
                      {entry.kind === "ambiguous" ? (
                        <div className="space-y-1">
                          <select
                            className="input h-8 w-64 px-1 py-0.5 text-xs"
                            aria-label={`Choose the correct faculty member for ${entry.name}`}
                            value={
                              facultyAssignments[entry.key] ? String(facultyAssignments[entry.key]) : ""
                            }
                            onChange={(e) =>
                              onFacultyAssignment(
                                entry.key,
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          >
                            <option value="">Choose the correct faculty member…</option>
                            {entry.candidates.map((candidate) => (
                              <option key={candidate.facultyId} value={candidate.facultyId}>
                                {candidate.fullName} (#{candidate.facultyId},{" "}
                                {candidate.departmentCode ?? "no department"})
                              </option>
                            ))}
                          </select>
                          {unresolvedAmbiguous.some((row) => row.key === entry.key) ? (
                            <p className="text-[11px] font-medium text-red-700">
                              Required before importing.
                            </p>
                          ) : (
                            <p className="text-[11px] font-medium text-green-700">
                              Will link to faculty #{facultyAssignments[entry.key]}.
                            </p>
                          )}
                        </div>
                      ) : entry.kind === "unknown" ? (
                        <span className="text-xs text-muted">
                          Add the faculty on Master Data, then preview again.
                        </span>
                      ) : (
                        <span className="text-xs text-muted">
                          Manage faculty on{" "}
                          <a href="/master" className="underline">
                            Master Data
                          </a>
                          .
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {plan.conflicts.length ? (
        <Section title={`Confirmed instructor conflicts (${plan.conflicts.length})`} tone="red">
          <p className="mb-2 text-xs text-muted">
            The same instructor is booked for two different classes at the same time. Nothing was
            auto-resolved — fix these before committing, or change the schedule after importing.
          </p>
          <ul className="space-y-1">
            {plan.conflicts.slice(0, 200).map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
          {plan.conflicts.length > 200 ? (
            <p className="mt-2 text-xs text-muted">
              Showing the first 200 of {plan.conflicts.length} conflicts.
            </p>
          ) : null}
        </Section>
      ) : null}

      {plan.combinedClasses.length ? (
        <Section
          title={`Possible combined classes (${plan.combinedClasses.length})`}
          tone="amber"
        >
          <p className="mb-2 text-xs text-muted">
            The same subject is scheduled for several sections at once. This may be intentional
            concurrent teaching — confirm each block, it is not treated as an error.
          </p>
          <ul className="space-y-1">
            {plan.combinedClasses.slice(0, 200).map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.duplicateSchedules.length ? (
        <Section
          title={`Possible duplicate records (${plan.duplicateSchedules.length})`}
          tone="amber"
        >
          <p className="mb-2 text-xs text-muted">
            One class appears twice with overlapping times — usually alternative rooms or durations
            listed in the same cell. These are not conflicts.
          </p>
          <ul className="space-y-1">
            {plan.duplicateSchedules.slice(0, 200).map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.incompleteSchedules.length ? (
        <Section
          title={`Incomplete schedules (${plan.incompleteSchedules.length})`}
          tone="amber"
        >
          <p className="mb-2 text-xs text-muted">
            Day or time information is missing or unusable, so these rows cannot be imported. No
            times were invented.
          </p>
          <ul className="space-y-1">
            {plan.incompleteSchedules.map((s, i) => (
              <li key={i}>
                <span className="font-mono text-xs">Row {s.row}</span> — CN {s.cn} {s.subject}:{" "}
                {s.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.tbaClassrooms.length ? (
        <Section
          title={`Classes without a room yet (${plan.tbaClassrooms.length})`}
          tone="amber"
        >
          <p className="mb-2 text-xs text-muted">
            These classes have a known time but no physical room assigned. They are not errors and
            still count for attendance and printing.
          </p>
          <ul className="space-y-1">
            {plan.tbaClassrooms.map((t, i) => (
              <li key={i}>
                <span className="font-mono text-xs">CN {t.cn}</span> {t.subject}{" "}
                {t.section ? `· ${t.section}` : ""} · {t.courseCode} ·{" "}
                {t.weekdays.map((d) => WEEKDAY_SHORT[d]).join("/")} · row {t.row}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.errors.length ? (
        <Section title={`Errors (${plan.errors.length})`} tone="red">
          <ul className="space-y-1">
            {plan.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs">Row {e.row}</span> — {e.message}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-sm mt-3" onClick={onDownloadErrors}>
            Download invalid rows (CSV)
          </button>
        </Section>
      ) : null}

      {plan.warnings.length ? (
        <Section title={`Warnings (${plan.warnings.length})`} tone="amber">
          <ul className="space-y-1">
            {plan.warnings.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs">Row {e.row}</span> — {e.message}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.duplicateFacultyNames.length ? (
        <Section
          title={`Possible duplicate faculty names (${plan.duplicateFacultyNames.length})`}
          tone="amber"
        >
          <ul className="space-y-1">
            {plan.duplicateFacultyNames.map((d, i) => (
              <li key={i}>
                Row {d.row}: <strong>{d.name}</strong> looks similar to existing{" "}
                <strong>{d.similarTo}</strong>. Confirm before merging.
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {plan.unassigned.length ? (
        <Section title={`Unassigned instructors / TBA (${plan.unassigned.length})`} tone="amber">
          <ul className="space-y-1">
            {plan.unassigned.map((u, i) => (
              <li key={i}>
                Row {u.row}: CN {u.cn} ({u.subject}) has no faculty assigned.
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Parsed schedule slots (${plan.slots.length})`}>
        <div className="max-h-96 overflow-auto">
          <table className="data-table">
            <caption className="visually-hidden">Parsed schedule slots</caption>
            <thead>
              <tr>
                <th scope="col">Program</th>
                <th scope="col">CN</th>
                <th scope="col">Subject</th>
                <th scope="col">Section</th>
                <th scope="col">Day</th>
                <th scope="col">Time</th>
                <th scope="col">Room</th>
                <th scope="col">Faculty</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.slots.slice(0, 500).map((slot, i) => (
                <tr key={i}>
                  <td>{slot.courseCode}</td>
                  <td className="font-mono text-xs">{slot.cn}</td>
                  <td>{slot.subject}</td>
                  <td>{slot.section ?? "—"}</td>
                  <td>{WEEKDAY_SHORT[slot.weekday]}</td>
                  <td>
                    {slot.start}–{slot.end}
                  </td>
                  <td>{slot.roomCode}</td>
                  <td>{slot.facultyName ?? <span className="text-muted">TBA</span>}</td>
                  <td>
                    <span className={"badge " + (SPAN_STATUS[slot.status] ?? "")}>{slot.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.slots.length > 500 ? (
          <p className="mt-2 text-xs text-muted">
            Showing the first 500 of {plan.slots.length} slots.
          </p>
        ) : null}
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={loading || scopeChanges === 0 || unresolvedAmbiguous.length > 0}
        >
          {loading
            ? reprocessOnly
              ? "Reprocessing…"
              : "Importing…"
            : unresolvedAmbiguous.length > 0
              ? `Resolve ${unresolvedAmbiguous.length} ambiguous name${
                  unresolvedAmbiguous.length === 1 ? "" : "s"
                } first`
              : reprocessOnly
                ? `Reprocess existing slots (${scopeChanges} update${
                    scopeChanges === 1 ? "" : "s"
                  } in ${scopeLabel})`
                : `Confirm import (${scopeChanges} change${scopeChanges === 1 ? "" : "s"} in ${scopeLabel})`}
        </button>
        {scopeChanges === 0 ? (
          <span className="text-xs text-muted">
            {reprocessOnly
              ? "No already-imported meeting in this scope needs an update. Uncheck reprocess to create the new slots, or choose another college or course."
              : "Nothing to write in this scope — choose another college or course."}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const SPAN_STATUS: Record<string, string> = {
  new: "badge-success",
  update: "badge-info",
  unchanged: "badge-neutral",
  error: "badge-danger",
};

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "green" | "blue" | "red" | "amber";
  hint?: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "blue"
        ? "text-blue-700"
        : tone === "red"
          ? "text-red-700"
          : tone === "amber"
            ? "text-amber-700"
            : "text-navy";
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "red" | "amber";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-300 bg-red-50"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50"
        : "border-line";
  return (
    <div className={`mt-4 rounded-lg border ${toneClass} p-4`}>
      <h3 className="mb-2 text-sm font-semibold text-navy">{title}</h3>
      {children}
    </div>
  );
}
