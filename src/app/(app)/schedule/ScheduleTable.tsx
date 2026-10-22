"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deleteScheduleSlot, updateScheduleSlot, type ScheduleEditState } from "./actions";
import { WEEKDAY_NAMES, formatTime12 } from "@/lib/dates";

export type ScheduleRowData = {
  id: number;
  cn: string;
  subject: string;
  description: string | null;
  units: number;
  section: string | null;
  yearLevel: string | null;
  termType: string | null;
  semester: string | null;
  courseId: number;
  facultyId: number | null;
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: number;
  mode: string;
  attendanceCount: number;
};

export type Option = { id: number; label: string };
export type RoomOption = { id: number; code: string; type: string };

const MODE_LABELS: Record<string, string> = {
  FACE_TO_FACE: "Face-to-face",
  ONLINE: "Online",
  LAB: "Laboratory",
};

const initialState: ScheduleEditState = { ok: false, message: "" };

export function ScheduleTable({
  rows,
  faculty,
  rooms,
  courses,
  canEdit,
  emptyMessage,
}: {
  rows: ScheduleRowData[];
  faculty: Option[];
  rooms: RoomOption[];
  courses: Option[];
  canEdit: boolean;
  emptyMessage: string;
}) {
  const [editing, setEditing] = useState<ScheduleRowData | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ScheduleRowData | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const courseById = new Map(courses.map((c) => [c.id, c.label]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const facultyById = new Map(faculty.map((f) => [f.id, f.label]));

  return (
    <>
      <table className="data-table [&_td]:px-2 [&_th]:px-2">
        <thead>
          <tr>
            <th scope="col">Program</th>
            <th scope="col">CN</th>
            <th scope="col">Subject</th>
            <th scope="col">Section</th>
            <th scope="col">Day</th>
            <th scope="col">Time</th>
            <th scope="col">Room</th>
            <th scope="col">Mode</th>
            <th scope="col">Faculty</th>
            {canEdit ? <th scope="col" className="text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const room = roomById.get(s.roomId);
            const isTba = !room || room.type === "TBA";
            return (
              <tr key={s.id}>
                <td className="font-medium">{courseById.get(s.courseId) ?? "—"}</td>
                <td className="font-mono text-xs">{s.cn}</td>
                <td>{s.subject}</td>
                <td>{s.section ?? "—"}</td>
                <td>{WEEKDAY_NAMES[s.weekday]}</td>
                <td className="whitespace-nowrap">
                  {formatTime12(s.startTime)}–{formatTime12(s.endTime)}
                </td>
                <td>
                  {isTba ? (
                    <span className="badge bg-amber-100 text-amber-800">TBA</span>
                  ) : (
                    <span className="whitespace-nowrap">{room!.code}</span>
                  )}
                </td>
                <td className="whitespace-nowrap">{MODE_LABELS[s.mode] ?? s.mode}</td>
                <td>
                  {s.facultyId ? (
                    facultyById.get(s.facultyId) ?? "—"
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  )}
                </td>
                {canEdit ? (
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="btn btn-sm"
                      title="Edit this schedule"
                      aria-label={`Edit schedule ${s.cn}`}
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                        <path d="M13.586 2.586a2 2 0 112.828 2.828l-9.9 9.9a1 1 0 01-.44.254l-3.5 1a1 1 0 01-1.238-1.238l1-3.5a1 1 0 01.254-.44l9.996-9.996zM12.172 4l1.414 1.414L15.414 3.586a1 1 0 10-1.414-1.414L12.172 4zM4.293 12.707l6.01-6.01 1.414 1.414-6.01 6.01-1.414-1.414z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(s)}
                      className="btn btn-sm btn-danger ml-2"
                      title={s.attendanceCount > 0 ? "Has attendance — cannot be deleted" : "Delete schedule"}
                      aria-label={`Delete schedule ${s.cn}`}
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                        <path d="M8.75 1a.75.75 0 00-.75.75V3H4.5a.75.75 0 000 1.5h.4l.7 12.1A2.5 2.5 0 008.1 19h3.8a2.5 2.5 0 002.5-2.4l.7-12.1h.4a.75.75 0 000-1.5H12V1.75A.75.75 0 0011.25 1h-2.5zM6.6 4.5h6.8l-.7 12a1 1 0 01-1 .95H8.3a1 1 0 01-1-.95l-.7-12zM8.5 7a.75.75 0 011.5 0v7a.75.75 0 01-1.5 0V7zm3 0a.75.75 0 011.5 0v7a.75.75 0 01-1.5 0V7z" />
                      </svg>
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={canEdit ? 10 : 9} className="text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {editing ? (
        <EditModal
          key={editing.id}
          row={editing}
          faculty={faculty}
          rooms={rooms}
          courses={courses}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setToast(message);
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteModal
          key={deleting.id}
          row={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            setDeleting(null);
            setToast(message);
          }}
        />
      ) : null}

      {toast ? (
        <div className="no-print fixed bottom-5 right-5 z-[60] alert alert-success shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function DeleteModal({
  row,
  onClose,
  onDeleted,
}: {
  row: ScheduleRowData;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(deleteScheduleSlot, initialState);
  const blocked = row.attendanceCount > 0;

  useEffect(() => {
    if (state.ok && state.message) onDeleted(state.message);
  }, [state, onDeleted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const content = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-slot-title"
      >
        <h2 id="delete-slot-title" className="section-title">
          Delete schedule
        </h2>
        <p className="mt-2 text-sm text-muted">
          CN {row.cn} &middot; {row.subject} &middot; {WEEKDAY_NAMES[row.weekday]}{" "}
          {formatTime12(row.startTime)}–{formatTime12(row.endTime)}
        </p>

        {blocked ? (
          <p className="mt-3 alert alert-error block" role="alert">
            This schedule has {row.attendanceCount} encoded attendance record(s) and cannot be
            deleted. Deleting it would damage historical attendance and reports.
          </p>
        ) : (
          <p className="mt-3 text-sm">
            This will permanently remove this schedule slot. This cannot be undone.
          </p>
        )}

        {!state.ok && state.message ? (
          <p className="mt-3 alert alert-error block" role="alert">
            {state.message}
          </p>
        ) : null}

        <form action={action} className="mt-5 flex justify-end gap-2">
          <input type="hidden" name="id" value={row.id} />
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={pending || blocked}
            title={blocked ? "Has attendance — cannot be deleted" : "Delete this schedule"}
          >
            {pending ? "Deleting…" : "Delete schedule"}
          </button>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function EditModal({
  row,
  faculty,
  rooms,
  courses,
  onClose,
  onSaved,
}: {
  row: ScheduleRowData;
  faculty: Option[];
  rooms: RoomOption[];
  courses: Option[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(updateScheduleSlot, initialState);
  const locked = row.attendanceCount > 0;

  useEffect(() => {
    if (state.ok && state.message) onSaved(state.message);
  }, [state, onSaved]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit schedule ${row.cn}`}
        className="my-8 w-full max-w-2xl rounded-xl border border-line bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="section-title">Edit schedule</h2>
            <p className="text-xs text-muted">
              CN {row.cn} &middot; {row.subject}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        <form action={action} className="space-y-5 px-5 py-5">
          <input type="hidden" name="id" value={row.id} />

          {state.message && !state.ok ? (
            <p role="alert" className="alert alert-error">
              {state.message}
            </p>
          ) : null}

          {locked ? (
            <p className="alert alert-warn block">
              This slot has {row.attendanceCount} encoded attendance record(s). The day and time are
              locked to protect historical data. Room, faculty and other details can still be changed.
            </p>
          ) : null}

          {/* Class details */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-navy">
              Class details
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label req" htmlFor="e-course">
                  Program
                </label>
                <select id="e-course" name="courseId" className="select" defaultValue={row.courseId} required>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label req" htmlFor="e-cn">
                  Class number (CN)
                </label>
                <input id="e-cn" name="cn" className="input" defaultValue={row.cn} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label req" htmlFor="e-subject">
                  Subject
                </label>
                <input id="e-subject" name="subject" className="input" defaultValue={row.subject} required />
              </div>
              <div>
                <label className="label" htmlFor="e-section">
                  Section
                </label>
                <input id="e-section" name="section" className="input" defaultValue={row.section ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="e-year">
                  Year level
                </label>
                <input id="e-year" name="yearLevel" className="input" defaultValue={row.yearLevel ?? ""} />
              </div>
            </div>
          </fieldset>

          {/* Schedule */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-navy">
              Schedule
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label req" htmlFor="e-day">
                  Day
                </label>
                {locked ? (
                  <>
                    <input type="hidden" name="weekday" value={row.weekday} />
                    <input type="hidden" name="startTime" value={row.startTime} />
                    <input type="hidden" name="endTime" value={row.endTime} />
                    <p className="input bg-slate-50 text-muted">{WEEKDAY_NAMES[row.weekday]}</p>
                  </>
                ) : (
                  <select id="e-day" name="weekday" className="select" defaultValue={row.weekday} required>
                    {WEEKDAY_NAMES.map((name, index) => (
                      <option key={index} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="label req" htmlFor="e-start">
                  Start time
                </label>
                {locked ? (
                  <p className="input bg-slate-50 text-muted">{formatTime12(row.startTime)}</p>
                ) : (
                  <input
                    id="e-start"
                    type="time"
                    name="startTime"
                    className="input"
                    defaultValue={row.startTime}
                    required
                  />
                )}
              </div>
              <div>
                <label className="label req" htmlFor="e-end">
                  End time
                </label>
                {locked ? (
                  <p className="input bg-slate-50 text-muted">{formatTime12(row.endTime)}</p>
                ) : (
                  <input
                    id="e-end"
                    type="time"
                    name="endTime"
                    className="input"
                    defaultValue={row.endTime}
                    required
                  />
                )}
              </div>
            </div>
          </fieldset>

          {/* Assignment */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-navy">
              Assignment
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="e-faculty">
                  Faculty
                </label>
                <select
                  id="e-faculty"
                  name="facultyId"
                  className="select"
                  defaultValue={row.facultyId ?? ""}
                >
                  <option value="">— Unassigned (TBA) —</option>
                  {faculty.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label req" htmlFor="e-room">
                  Room
                </label>
                <select id="e-room" name="roomId" className="select" defaultValue={row.roomId} required>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.type === "PHYSICAL"
                        ? r.code
                        : `${r.code} (${r.type === "TBA" ? "TBA" : "Online"})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label req" htmlFor="e-mode">
                  Mode
                </label>
                <select id="e-mode" name="mode" className="select" defaultValue={row.mode} required>
                  <option value="FACE_TO_FACE">Face-to-face</option>
                  <option value="ONLINE">Online</option>
                  <option value="LAB">Laboratory</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* Additional details */}
          <details className="rounded-lg border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-navy">
              Additional details
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="e-units">
                  Units
                </label>
                <input
                  id="e-units"
                  type="number"
                  min={0}
                  name="units"
                  className="input"
                  defaultValue={row.units}
                />
              </div>
              <div>
                <label className="label" htmlFor="e-term">
                  Term type
                </label>
                <input id="e-term" name="termType" className="input" defaultValue={row.termType ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="e-sem">
                  Semester
                </label>
                <input id="e-sem" name="semester" className="input" defaultValue={row.semester ?? ""} />
              </div>
              <div className="sm:col-span-3">
                <label className="label" htmlFor="e-desc">
                  Description
                </label>
                <input
                  id="e-desc"
                  name="description"
                  className="input"
                  defaultValue={row.description ?? ""}
                />
              </div>
            </div>
          </details>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
