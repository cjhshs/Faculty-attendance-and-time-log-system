"use client";

import { useState } from "react";
import type { ImportPlan, CommitResult } from "@/lib/import";
import { WEEKDAY_SHORT } from "@/lib/dates";

export function ImportClient({
  defaultSchoolYear,
  defaultSemester,
  knownYears,
}: {
  defaultSchoolYear: string;
  defaultSemester: string;
  knownYears: string[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [semester, setSemester] = useState(defaultSemester);
  const [scopeCollege, setScopeCollege] = useState("");
  const [scopeProgram, setScopeProgram] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function buildBody() {
    const body = new FormData();
    if (file) body.append("file", file);
    body.append("schoolYear", schoolYear);
    body.append("semester", semester);
    if (scopeCollege) body.append("college", scopeCollege);
    if (scopeProgram) body.append("program", scopeProgram);
    return body;
  }

  async function preview() {
    if (!file) return;
    if (!schoolYear.trim()) {
      setError("Enter the target academic year (for example 2027-2028).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setPlan(null);
    setScopeCollege("");
    setScopeProgram("");
    try {
      const res = await fetch("/api/schedule/preview", { method: "POST", body: buildBody() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed.");
      setPlan(data.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!file) return;
    const termLabel = `${schoolYear.trim()} ${semester}`;
    const scopeLabel = scopeProgram || scopeCollege || "all colleges";
    if (
      !window.confirm(
        `Import ${scopeLabel} from this file into ${termLabel}? Existing schedules in that semester are updated, never deleted. Attendance is not affected. Conflicts are always checked across every department in the file.`,
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/commit", { method: "POST", body: buildBody() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setResult(data.result);
      setPlan(null);
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

  return (
    <div className="space-y-6">
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
              setPlan(null);
              setResult(null);
              setError(null);
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
                setPlan(null);
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
                setPlan(null);
              }}
            >
              <option value="1st Semester">1st Semester</option>
              <option value="2nd Semester">2nd Semester</option>
              <option value="Summer">Summer</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={preview} disabled={!file || loading}>
            {loading ? "Working…" : "Preview import"}
          </button>
        </div>

        <p className="text-xs text-muted">
          Columns are matched by header name. Slots are imported into{" "}
          <strong>
            {schoolYear.trim() || "—"} · {semester}
          </strong>
          . Nothing is saved until you confirm.
        </p>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {result ? (
        <div className="alert alert-success">
          Import complete into {schoolYear.trim()} {semester}: {result.created} added,{" "}
          {result.updated} updated, {result.unchanged} unchanged. {result.facultyCreated} new
          faculty, {result.programsCreated} new program(s), {result.roomsCreated} new room(s).
          {result.skippedOutOfScope > 0
            ? ` ${result.skippedOutOfScope} slot(s) left untouched because they are outside the selected college/course.`
            : ""}
          {result.batchId ? ` Recorded as import batch #${result.batchId}.` : ""}
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
        />
      ) : null}
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
}: {
  plan: ImportPlan;
  onConfirm: () => void;
  loading: boolean;
  onDownloadErrors: () => void;
  scopeCollege: string;
  scopeProgram: string;
  onCollegeChange: (value: string) => void;
  onProgramChange: (value: string) => void;
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
  const scopeSlots = plan.slots.filter((slot) => scopeCodes.has(slot.courseCode));
  const scopeChanges = scopeSlots.filter(
    (slot) => slot.status === "new" || slot.status === "update",
  ).length;
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
            <label className="label" htmlFor="import-college">
              College / Department
            </label>
            <select
              id="import-college"
              className="input"
              value={scopeCollege}
              onChange={(e) => onCollegeChange(e.target.value)}
            >
              <option value="">
                All colleges ({plan.programMapping.length} program
                {plan.programMapping.length === 1 ? "" : "s"})
              </option>
              {collegeCodes.map((code) => (
                <option key={code} value={code}>
                  {code} — {collegeNames.get(code)} (
                  {plan.programMapping.filter((m) => m.collegeCode === code).length})
                </option>
              ))}
              {hasUnassigned ? (
                <option value="unassigned">
                  Unassigned programs (
                  {plan.programMapping.filter((m) => !m.collegeCode).length})
                </option>
              ) : null}
            </select>
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
        <p className="text-xs">
          <strong>Scope:</strong> {scopeLabel} · {scopeMapping.length} program
          {scopeMapping.length === 1 ? "" : "s"} · {scopeRows} source row
          {scopeRows === 1 ? "" : "s"} · {scopeSlots.length} slot
          {scopeSlots.length === 1 ? "" : "s"} ·{" "}
          <strong>{scopeChanges} change{scopeChanges === 1 ? "" : "s"} to write</strong>
        </p>
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
                      <span className="badge bg-red-100 text-red-800">Unknown code</span>
                    ) : m.collegeCode === null ? (
                      <span className="badge bg-amber-100 text-amber-800">Needs review</span>
                    ) : m.official ? (
                      <span className="badge bg-green-100 text-green-800">Official</span>
                    ) : (
                      <span className="badge bg-blue-100 text-blue-800">Additional program</span>
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
          disabled={loading || scopeChanges === 0}
        >
          {loading
            ? "Importing…"
            : `Confirm import (${scopeChanges} change${scopeChanges === 1 ? "" : "s"} in ${scopeLabel})`}
        </button>
        {scopeChanges === 0 ? (
          <span className="text-xs text-muted">
            Nothing to write in this scope — choose another college or course.
          </span>
        ) : null}
      </div>
    </div>
  );
}

const SPAN_STATUS: Record<string, string> = {
  new: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  unchanged: "bg-zinc-100 text-zinc-600",
  error: "bg-red-100 text-red-800",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "blue" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "blue"
        ? "text-blue-700"
        : tone === "red"
          ? "text-red-700"
          : "text-navy";
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
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
