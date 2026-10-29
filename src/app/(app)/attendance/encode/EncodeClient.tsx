"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "../../ScrollArea";
import {
  mergeDraftWithOfficial,
  type AttendanceDraftPayload,
  type AttendanceStatus,
} from "@/lib/attendance-status";

export type EncodeCell = {
  key: string;
  slotId: number;
  hour: string;
  room: string;
  roomType: "PHYSICAL" | "ONLINE" | "TBA";
  // Official value from the database. NULL = not encoded.
  status: AttendanceStatus;
  reason: string;
  roomOverride: string;
};

export type EncodeRow = {
  hour: string;
  label: string;
  cells: (EncodeCell | null)[];
};

export type EncodeColumn = { facultyId: number; label: string };

type CellValue = { status: AttendanceStatus; reason: string; roomOverride: string };

type SaveState = "idle" | "saving" | "saved" | "failed";

export function EncodeClient({
  date,
  targetLabel,
  scopeKey,
  schoolYear,
  semester,
  departmentCode,
  courseCode,
  dateLabel,
  columns,
  rows,
  locked,
  session,
  unassigned,
  initialDraft,
}: {
  date: string;
  targetLabel: string;
  scopeKey: string;
  schoolYear: string;
  semester: string;
  departmentCode?: string | null;
  courseCode?: string | null;
  dateLabel: string;
  columns: EncodeColumn[];
  rows: EncodeRow[];
  locked: boolean;
  session: { savedByName: string; savedAt: string } | null;
  unassigned: { cn: string; subject: string; time: string }[];
  initialDraft: AttendanceDraftPayload | null;
}) {
  const official = useMemo(() => {
    const map: Record<string, CellValue> = {};
    for (const row of rows) {
      for (const cell of row.cells) {
        if (!cell) continue;
        map[cell.key] = {
          status: cell.status,
          reason: cell.reason,
          roomOverride: cell.roomOverride,
        };
      }
    }
    return map;
  }, [rows]);

  const [officialValues, setOfficialValues] = useState<Record<string, CellValue>>(official);
  const restored = useMemo(
    () => mergeDraftWithOfficial(official, initialDraft),
    [official, initialDraft],
  );
  const [values, setValues] = useState<Record<string, CellValue>>(restored);
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState(() => hasDifferences(restored, official));
  const draftVersion = useRef(initialDraft?.version ?? 0);
  const [saveState, setSaveState] = useState<SaveState>(initialDraft ? "saved" : "idle");
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedInfo, setSavedInfo] = useState(session);
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [query, setQuery] = useState(initialDraft?.query ?? "");
  const [conflict, setConflict] = useState<{ payload: AttendanceDraftPayload; version: number } | null>(
    null,
  );
  const [restoredDraft, setRestoredDraft] = useState(
    () => !!initialDraft && hasDifferences(restored, official),
  );
  // A 401/403 from the API means the session (or permission) is gone. Work is
  // kept in this tab and the DB draft, so the user can sign in and retry.
  const [authExpired, setAuthExpired] = useState(false);

  // Autosave working state as a private draft. This never writes attendance.
  useEffect(() => {
    if (!touched || conflict || authExpired) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const payload: AttendanceDraftPayload = {
          cells: values,
          query,
          version: draftVersion.current,
        };
        const res = await fetch("/api/attendance/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeKey, payload, baseVersion: draftVersion.current }),
        });
        if (res.status === 401 || res.status === 403) {
          setAuthExpired(true);
          setSaveState("failed");
          return;
        }
        const data = await res.json();
        if (res.status === 409 && data.conflict) {
          setConflict({ payload: data.latest.payload, version: data.latest.version });
          setSaveState("failed");
          return;
        }
        if (!res.ok) throw new Error(data.error || "Draft save failed.");
        draftVersion.current = data.version;
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [values, query, touched, scopeKey, conflict, authExpired]);

  // Let the session-tab bar know whether this tab has recoverable work.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("fa:dirty", { detail: { dirty } }));
  }, [dirty]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const layout = useMemo(() => {
    return columns.map((_col, colIndex) => {
      const result: ({ room: string; span: number } | "covered" | "empty")[] = [];
      let r = 0;
      while (r < rows.length) {
        const cell = rows[r].cells[colIndex];
        if (!cell) {
          result.push("empty");
          r++;
          continue;
        }
        let span = 1;
        while (
          r + span < rows.length &&
          rows[r + span].cells[colIndex]?.room === cell.room
        ) {
          span++;
        }
        result.push({ room: cell.room, span });
        for (let k = 1; k < span; k++) result.push("covered");
        r += span;
      }
      return result;
    });
  }, [columns, rows]);

  const trimmedQuery = query.trim().toLowerCase();
  const matchedColumns = useMemo(() => {
    const set = new Set<number>();
    if (!trimmedQuery) return set;
    columns.forEach((col, index) => {
      if (col.label.toLowerCase().includes(trimmedQuery)) set.add(index);
    });
    return set;
  }, [columns, trimmedQuery]);
  const filtering = trimmedQuery.length > 0;

  const allCells = rows.flatMap((row) => row.cells.filter((c): c is NonNullable<typeof c> => !!c));
  const presentCount = allCells.filter((c) => values[c.key]?.status === "present").length;
  const absentCount = allCells.filter((c) => values[c.key]?.status === "absent").length;
  const unsetCount = allCells.length - presentCount - absentCount;

  const invalidCells = allCells.filter((cell) => {
    const value = values[cell.key];
    return value?.status === "absent" && value.reason.trim().length < 2;
  });
  const hasInvalid = invalidCells.length > 0;

  function update(key: string, patch: Partial<CellValue>) {
    setValues((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setTouched(true);
    setDirty(true);
    setMessage(null);
  }

  function setQueryValue(value: string) {
    setQuery(value);
    setTouched(true);
  }

  async function save() {
    if (hasInvalid) {
      setMessage({ ok: false, text: "Add a reason for every absence before saving." });
      return;
    }
    if (savedInfo && !confirmedReplace) {
      if (
        !window.confirm(
          "Attendance for this date and scope is already saved. Replace the saved values?",
        )
      )
        return;
      setConfirmedReplace(true);
    }
    const records = allCells
      .map((cell) => {
        const value = values[cell.key] ?? { status: "unset" as const, reason: "", roomOverride: "" };
        const current = officialValues[cell.key] ?? {
          status: "unset" as const,
          reason: "",
          roomOverride: "",
        };
        const statusChanged = value.status !== current.status;
        const reasonChanged = value.reason !== current.reason;
        const roomChanged = value.roomOverride !== current.roomOverride;
        if (!statusChanged && !reasonChanged && !roomChanged) return null;
        return {
          slotId: cell.slotId,
          hourStart: cell.hour,
          // Only send a status when the control actually changed. Otherwise an
          // unrelated edit must never overwrite a saved status with NULL.
          ...(statusChanged ? { status: value.status } : {}),
          ...(reasonChanged ? { reason: value.reason } : {}),
          ...(roomChanged ? { roomOverride: value.roomOverride } : {}),
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null);

    if (records.length === 0) {
      setMessage({ ok: true, text: "Nothing new to save. Select Present or Absent first." });
      return;
    }

    setSavingOfficial(true);
    setMessage(null);
    try {
      const res = await fetch("/api/attendance/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          schoolYear,
          semester,
          ...(departmentCode ? { departmentCode } : { courseCode }),
          records,
          replace: true,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setAuthExpired(true);
        setMessage({
          ok: false,
          text: "Your session has expired or you no longer have permission. Sign in again; your work is still in this tab and has not been finalized.",
        });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save attendance.");
      const result = data.result as
        | {
            requested: number;
            saved: number;
            created: number;
            updated: number;
            skipped: number;
            explicitStatuses: number;
          }
        | undefined;
      setMessage({
        ok: true,
        text: result
          ? `Attendance saved: ${result.saved} record(s) written (${result.created} new, ${result.updated} updated)${
              result.skipped ? `, ${result.skipped} skipped` : ""
            }. ${result.explicitStatuses} explicit status value(s).`
          : "Attendance saved.",
      });
      setOfficialValues({ ...values });
      setDirty(false);
      setTouched(false);
      setSavedInfo(data.saved ?? savedInfo);
      // An official save supersedes the working draft.
      await fetch(`/api/attendance/draft?scopeKey=${encodeURIComponent(scopeKey)}`, {
        method: "DELETE",
      }).catch(() => undefined);
      draftVersion.current = 0;
      setRestoredDraft(false);
      setSaveState("idle");
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save attendance." });
    } finally {
      setSavingOfficial(false);
    }
  }

  async function discardDraft() {
    if (!window.confirm("Discard this draft and restore the last saved attendance values?")) return;
    try {
      await fetch(`/api/attendance/draft?scopeKey=${encodeURIComponent(scopeKey)}`, {
        method: "DELETE",
      });
      setValues(officialValues);
      setDirty(false);
      setTouched(false);
      draftVersion.current = 0;
      setConflict(null);
      setSaveState("idle");
      setRestoredDraft(false);
      setMessage({ ok: true, text: "Draft discarded." });
    } catch {
      setMessage({ ok: false, text: "Could not discard the draft." });
    }
  }

  function keepMine() {
    if (!conflict) return;
    draftVersion.current = conflict.version;
    setConflict(null);
    setTouched(true);
    setSaveState("saving");
  }

  function useLatestDraft() {
    if (!conflict) return;
    setValues(mergeDraftWithOfficial(officialValues, conflict.payload));
    draftVersion.current = conflict.version;
    setConflict(null);
    setTouched(false);
    setDirty(true);
    setSaveState("saved");
  }

  function retryAfterSignIn() {
    setAuthExpired(false);
    setSaveState("idle");
    setTouched(true);
    setMessage(null);
  }

  return (
    <div className="space-y-3">
      {authExpired ? (
        <div className="alert alert-error block text-sm" role="alert">
          <p className="font-semibold">Your session has expired.</p>
          <p className="mt-1 text-xs">
            The draft could not be saved because you are no longer signed in. Your edits are still
            in this tab and have not been finalized. Sign in again, then retry — earlier saved
            drafts are preserved.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href="/login" className="btn btn-sm">
              Sign in again
            </a>
            <button type="button" className="btn btn-sm" onClick={retryAfterSignIn}>
              Retry save
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">
          {dateLabel} — {targetLabel}
        </span>
        {savedInfo ? (
          <span className="badge bg-green-100 text-green-800">
            Saved by {savedInfo.savedByName}
            {savedInfo.savedAt ? ` on ${savedInfo.savedAt.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span className="badge bg-zinc-200 text-zinc-700">Not encoded</span>
        )}
        {dirty ? (
          <span className="badge bg-amber-100 text-amber-800">
            {restoredDraft ? "Draft restored" : "Unsaved changes"}
          </span>
        ) : savedInfo ? null : (
          <span className="badge bg-zinc-100 text-zinc-600">Draft</span>
        )}
        <DraftIndicator
          state={saveState}
          authExpired={authExpired}
          onDiscard={dirty ? discardDraft : undefined}
        />
        {columns.length > 1 ? (
          <div className="relative ml-auto">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQueryValue(e.target.value)}
              placeholder="Find faculty..."
              className="input w-48 pl-8"
              aria-label="Find faculty column"
            />
          </div>
        ) : null}
      </div>

      {conflict ? (
        <div className="alert alert-warn block text-sm">
          <p className="font-semibold">A newer draft was saved in another tab.</p>
          <p className="mt-1 text-xs">
            Your current edits have not been overwritten. Choose which version to keep.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={keepMine}>
              Keep my edits
            </button>
            <button type="button" className="btn btn-sm" onClick={useLatestDraft}>
              Load the newer draft
            </button>
          </div>
        </div>
      ) : null}

      {unassigned.length > 0 ? (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Unassigned (TBA) classes have no faculty column:{" "}
          {unassigned.map((u) => `${u.cn} ${u.subject} ${u.time}`).join("; ")}. Assign a faculty in the
          schedule to encode them.
        </p>
      ) : null}

      {filtering ? (
        <p className="text-xs text-muted">
          {matchedColumns.size} of {columns.length} faculty match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : null}

      <ScrollArea className="rounded-md border border-zinc-200 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 min-w-[5.5rem] border border-zinc-300 bg-zinc-100 px-2 py-1 shadow-[1px_0_0_0_#d4d4d8]"
              >
                TIME
              </th>
              {columns.map((col, colIndex) => {
                const matched = matchedColumns.has(colIndex);
                return (
                  <th
                    key={col.facultyId}
                    colSpan={2}
                    className={
                      "min-w-[15rem] border border-zinc-300 px-2 py-1 text-center font-bold " +
                      (filtering && !matched ? "bg-zinc-50 text-zinc-400" : "bg-zinc-100")
                    }
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
            <tr>
              {columns.map((col) => (
                <Fragment key={col.facultyId}>
                  <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-[10px]">ROOM</th>
                  <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-[10px]">ENTRY</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.hour}>
                <td className="sticky left-0 z-20 whitespace-nowrap border border-zinc-200 bg-white px-2 py-1 text-center text-xs shadow-[1px_0_0_0_#e4e4e7]">
                  {row.label}
                </td>
                {columns.map((col, colIndex) => {
                  const dim = filtering && !matchedColumns.has(colIndex);
                  const dimClass = dim ? "opacity-40" : "";
                  const spot = layout[colIndex][rowIndex];
                  const cell = row.cells[colIndex];
                  const entry = cell ? (
                    <EntryControl
                      cell={cell}
                      value={values[cell.key]}
                      locked={locked}
                      invalid={
                        values[cell.key]?.status === "absent" &&
                        (values[cell.key]?.reason ?? "").trim().length < 2
                      }
                      update={update}
                    />
                  ) : (
                    <span className="text-zinc-300">—</span>
                  );
                  if (spot && typeof spot === "object") {
                    return (
                      <Fragment key={col.facultyId}>
                        <td
                          rowSpan={spot.span}
                          className={
                            "min-w-[6rem] border border-zinc-200 px-1 py-1 text-center align-middle text-[11px] font-medium " +
                            dimClass
                          }
                        >
                          {spot.room}
                        </td>
                        <td className={"min-w-[11rem] border border-zinc-200 px-1 py-1 " + dimClass}>
                          {entry}
                        </td>
                      </Fragment>
                    );
                  }
                  if (spot === "covered") {
                    return (
                      <td
                        key={`${col.facultyId}-e`}
                        className={"min-w-[11rem] border border-zinc-200 px-1 py-1 " + dimClass}
                      >
                        {entry}
                      </td>
                    );
                  }
                  return (
                    <Fragment key={col.facultyId}>
                      <td className="border border-zinc-200 bg-zinc-50" />
                      <td className="border border-zinc-200 bg-zinc-50" />
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>

      {unassigned.length > 0 ? (
        <p className="text-xs text-muted">
          Only classes with an assigned faculty appear above.
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-zinc-200 bg-white/95 px-1 py-3">
        <span className="text-sm">
          <strong>{allCells.length}</strong> scheduled hours &middot;{" "}
          <strong className="text-green-700">{presentCount}</strong> present &middot;{" "}
          <strong className="text-red-700">{absentCount}</strong> absent &middot;{" "}
          <strong className="text-zinc-600">{unsetCount}</strong> not yet encoded
        </span>
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={locked || savingOfficial || allCells.length === 0 || hasInvalid}
        >
          {savingOfficial ? "Saving…" : "Save Attendance"}
        </button>
        {hasInvalid ? (
          <span className="text-xs text-red-700">
            {invalidCells.length} absence(s) need a reason.
          </span>
        ) : null}
        {message ? (
          <span className={"text-sm " + (message.ok ? "text-green-700" : "text-red-700")}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraftIndicator({
  state,
  authExpired = false,
  onDiscard,
}: {
  state: SaveState;
  authExpired?: boolean;
  onDiscard?: () => void;
}) {
  const text = authExpired
    ? "Session expired — draft not saved"
    : state === "saving"
      ? "Saving draft…"
      : state === "saved"
        ? "Draft saved"
        : state === "failed"
          ? "Draft save failed"
          : null;
  return (
    <span className="flex items-center gap-2 text-xs">
      {text ? (
        <span
          className={
            authExpired || state === "failed"
              ? "text-red-700"
              : state === "saving"
                ? "text-amber-700"
                : "text-green-700"
          }
          role="status"
        >
          {text}
        </span>
      ) : null}
      {onDiscard ? (
        <button type="button" className="text-xs text-zinc-500 underline" onClick={onDiscard}>
          Discard draft
        </button>
      ) : null}
    </span>
  );
}

function EntryControl({
  cell,
  value,
  locked,
  invalid,
  update,
}: {
  cell: EncodeCell;
  value: CellValue | undefined;
  locked: boolean;
  invalid: boolean;
  update: (key: string, patch: Partial<CellValue>) => void;
}) {
  const status = value?.status ?? "unset";
  return (
    <div className="flex flex-col gap-1">
      <select
        className={
          "input h-8 w-auto px-1 py-0.5 text-[11px] " +
          (invalid ? "border-red-500 bg-red-50" : "")
        }
        value={status}
        disabled={locked}
        aria-label={`Attendance status for ${cell.key}`}
        onChange={(e) => update(cell.key, { status: e.target.value as AttendanceStatus })}
      >
        <option value="unset">Select Entry</option>
        <option value="present">Present</option>
        <option value="absent">Absent</option>
      </select>
      {status === "absent" ? (
        <input
          type="text"
          placeholder="reason (required)"
          className={
            "input w-auto px-1 py-0.5 text-[11px] " +
            (invalid ? "border-red-500 bg-red-50" : "")
          }
          value={value?.reason ?? ""}
          disabled={locked}
          maxLength={500}
          aria-label={`Reason for absence ${cell.key}`}
          onChange={(e) => update(cell.key, { reason: e.target.value })}
        />
      ) : null}
      {cell.roomType === "TBA" ? (
        <input
          type="text"
          placeholder="actual room"
          className="input w-auto px-1 py-0.5 text-[11px]"
          value={value?.roomOverride ?? ""}
          disabled={locked}
          onChange={(e) => update(cell.key, { roomOverride: e.target.value })}
        />
      ) : null}
    </div>
  );
}

function hasDifferences(
  values: Record<string, CellValue>,
  official: Record<string, CellValue>,
): boolean {
  for (const [key, value] of Object.entries(values)) {
    const current = official[key];
    if (!current) {
      if (value.status !== "unset" || value.reason || value.roomOverride) return true;
      continue;
    }
    if (
      value.status !== current.status ||
      value.reason !== current.reason ||
      value.roomOverride !== current.roomOverride
    ) {
      return true;
    }
  }
  return false;
}
