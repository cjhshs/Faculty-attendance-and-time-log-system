"use client";

import { Fragment, useMemo, useState } from "react";
import { ScrollArea } from "../../ScrollArea";

export type EncodeCell = {
  key: string;
  slotId: number;
  hour: string;
  room: string;
  roomType: "PHYSICAL" | "ONLINE" | "TBA";
  present: boolean;
  reason: string;
  roomOverride: string;
};

export type EncodeRow = {
  hour: string;
  label: string;
  cells: (EncodeCell | null)[];
};

export type EncodeColumn = { facultyId: number; label: string };

type CellValue = { present: boolean; reason: string; roomOverride: string };

type LayoutCell =
  | { type: "room"; room: string; span: number }
  | { type: "covered" }
  | { type: "empty" };

export function EncodeClient({
  date,
  courseCode,
  dateLabel,
  columns,
  rows,
  locked,
  session,
  unassigned,
}: {
  date: string;
  courseCode: string;
  dateLabel: string;
  columns: EncodeColumn[];
  rows: EncodeRow[];
  locked: boolean;
  session: { savedByName: string; savedAt: string } | null;
  unassigned: { cn: string; subject: string; time: string }[];
}) {
  const [values, setValues] = useState<Record<string, { present: boolean; reason: string; roomOverride: string }>>(
    () => {
      const initial: Record<string, { present: boolean; reason: string; roomOverride: string }> = {};
      for (const row of rows) {
        for (const cell of row.cells) {
          if (!cell) continue;
          initial[cell.key] = {
            present: cell.present,
            reason: cell.reason,
            roomOverride: cell.roomOverride,
          };
        }
      }
      return initial;
    },
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedInfo, setSavedInfo] = useState(session);
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [query, setQuery] = useState("");

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
  const presentCount = allCells.filter((c) => values[c.key]?.present).length;
  const absentCount = allCells.length - presentCount;

  function update(key: string, patch: Partial<{ present: boolean; reason: string; roomOverride: string }>) {
    setValues((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setDirty(true);
  }

  async function save() {
    if (savedInfo && !confirmedReplace) {
      if (
        !window.confirm(
          "Attendance for this date and program is already saved. Replace the saved values?",
        )
      )
        return;
      setConfirmedReplace(true);
    }
    setSaving(true);
    setMessage(null);
    try {
      const records = allCells.map((c) => ({
        slotId: c.slotId,
        hourStart: c.hour,
        present: values[c.key]?.present ?? false,
        reason: values[c.key]?.reason ?? "",
        roomOverride: values[c.key]?.roomOverride ?? "",
      }));
      const res = await fetch("/api/attendance/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, courseCode, records, replace: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save attendance.");
      setMessage({ ok: true, text: "Attendance saved." });
      setDirty(false);
      setSavedInfo(data.saved ?? savedInfo);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save attendance." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">
          {dateLabel} — {courseCode}
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
          <span className="badge bg-amber-100 text-amber-800">Unsaved changes</span>
        ) : savedInfo ? null : (
          <span className="badge bg-zinc-100 text-zinc-600">Draft</span>
        )}
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find faculty..."
              className="input w-48 pl-8"
              aria-label="Find faculty column"
            />
          </div>
        ) : null}
      </div>

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
                    const entry = cell
                      ? renderEntry(cell, values[cell.key], locked, update)
                      : <span className="text-zinc-300">—</span>;
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
          <strong className="text-red-700">{absentCount}</strong> will count as absent
        </span>
        <button className="btn btn-primary" onClick={save} disabled={locked || saving || allCells.length === 0}>
          {saving ? "Saving…" : "Save Attendance"}
        </button>
        {message ? (
          <span className={"text-sm " + (message.ok ? "text-green-700" : "text-red-700")}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function renderEntry(
  cell: { key: string; roomType: string },
  value: { present: boolean; reason: string; roomOverride: string } | undefined,
  locked: boolean,
  update: (key: string, patch: Partial<{ present: boolean; reason: string; roomOverride: string }>) => void,
) {
  const present = value?.present ?? false;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={present}
          disabled={locked}
          onChange={(e) => update(cell.key, { present: e.target.checked })}
        />
        <span className="text-[10px] text-muted">{present ? "present" : "absent"}</span>
      </label>
      {!present ? (
        <input
          type="text"
          placeholder="reason (optional)"
          className="input w-auto px-1 py-0.5 text-[11px]"
          value={value?.reason ?? ""}
          disabled={locked}
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
