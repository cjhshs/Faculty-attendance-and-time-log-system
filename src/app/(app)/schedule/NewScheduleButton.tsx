"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../Modal";
import { createScheduleSlot, type ScheduleEditState } from "./actions";
import { WEEKDAY_NAMES } from "@/lib/dates";

const INITIAL: ScheduleEditState = { ok: false, message: "" };
const NEW_FACULTY = "__new_faculty__";

type Option = { id: number; label: string };
type RoomOption = { id: number; code: string; type: string };
type Term = { schoolYear: string; semester: string };

export function NewScheduleButton({
  faculty,
  rooms,
  courses,
  term,
}: {
  faculty: Option[];
  rooms: RoomOption[];
  courses: Option[];
  term: Term | null;
}) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
        disabled={!term}
        title={
          term
            ? "Create a single new schedule slot"
            : "Choose a specific academic year and semester first"
        }
      >
        + New schedule
      </button>

      {open && term ? (
        <NewScheduleForm
          faculty={faculty}
          rooms={rooms}
          courses={courses}
          term={term}
          onClose={() => setOpen(false)}
          onSaved={(message) => {
            setOpen(false);
            setToast(message);
          }}
        />
      ) : null}

      {toast ? (
        <div role="status" className="no-print alert alert-success shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function NewScheduleForm({
  faculty,
  rooms,
  courses,
  term,
  onClose,
  onSaved,
}: {
  faculty: Option[];
  rooms: RoomOption[];
  courses: Option[];
  term: Term;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createScheduleSlot, INITIAL);
  const [facultyChoice, setFacultyChoice] = useState("");

  useEffect(() => {
    if (state.ok && state.message) {
      onSaved(state.message);
      router.refresh();
    }
  }, [state.ok, state.message, onSaved, router]);

  return (
    <Modal open onClose={onClose} labelledBy="new-schedule-title" dismissible={!pending}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h2 id="new-schedule-title" className="section-title">
            New schedule
          </h2>
          <p className="text-xs text-muted">
            {term.schoolYear} · {term.semester}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-sm btn-ghost"
          aria-label="Close"
          disabled={pending}
        >
          ✕
        </button>
      </div>

      <form action={action} className="space-y-5 px-5 py-5">
        <input type="hidden" name="termSchoolYear" value={term.schoolYear} />
        <input type="hidden" name="termSemester" value={term.semester} />

        {state.message && !state.ok ? (
          <p role="alert" className="alert alert-error">
            {state.message}
          </p>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-navy">
            Class details
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label req" htmlFor="n-course">
                Program
              </label>
              <select
                id="n-course"
                name="courseId"
                className="select"
                defaultValue={courses[0]?.id ?? ""}
                required
                autoFocus
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label req" htmlFor="n-cn">
                Class number (CN)
              </label>
              <input id="n-cn" name="cn" className="input" placeholder="e.g. 48120" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label req" htmlFor="n-subject">
                Subject
              </label>
              <input
                id="n-subject"
                name="subject"
                className="input"
                placeholder="e.g. CC101 or NSTP1"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="n-section">
                Section
              </label>
              <input id="n-section" name="section" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-year">
                Year level
              </label>
              <input id="n-year" name="yearLevel" className="input" />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-navy">
            Schedule
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label req" htmlFor="n-day">
                Day
              </label>
              <select id="n-day" name="weekday" className="select" defaultValue={1} required>
                {WEEKDAY_NAMES.map((name, index) => (
                  <option key={index} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label req" htmlFor="n-start">
                Start time
              </label>
              <input
                id="n-start"
                type="time"
                name="startTime"
                className="input"
                defaultValue="08:00"
                required
              />
            </div>
            <div>
              <label className="label req" htmlFor="n-end">
                End time
              </label>
              <input
                id="n-end"
                type="time"
                name="endTime"
                className="input"
                defaultValue="10:00"
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-navy">
            Assignment
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="n-faculty">
                Faculty
              </label>
              <select
                id="n-faculty"
                name="facultyId"
                className="select"
                value={facultyChoice}
                onChange={(e) => setFacultyChoice(e.target.value)}
              >
                <option value="">— Unassigned (TBA) —</option>
                <option value={NEW_FACULTY}>+ Add new faculty…</option>
                {faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {facultyChoice === NEW_FACULTY ? (
              <div>
                <label className="label req" htmlFor="n-new-faculty">
                  New faculty name
                </label>
                <input
                  id="n-new-faculty"
                  name="newFacultyName"
                  className="input"
                  placeholder="Surname, First name Middle"
                  required
                />
              </div>
            ) : null}
            <div>
              <label className="label req" htmlFor="n-room">
                Room
              </label>
              <select
                id="n-room"
                name="roomId"
                className="select"
                defaultValue={rooms[0]?.id ?? ""}
                required
              >
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
              <label className="label req" htmlFor="n-mode">
                Mode
              </label>
              <select id="n-mode" name="mode" className="select" defaultValue="FACE_TO_FACE" required>
                <option value="FACE_TO_FACE">Face-to-face</option>
                <option value="ONLINE">Online</option>
                <option value="LAB">Laboratory</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">
            The teacher is matched to the roster. Only a major/professional subject makes this class
            appear on that program&apos;s attendance sheet; GE/NSTP subjects stay in the summary only.
          </p>
        </fieldset>

        <details className="rounded-lg border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-navy">Additional details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="n-units">
                Units
              </label>
              <input id="n-units" type="number" min={0} name="units" className="input" defaultValue={0} />
            </div>
            <div>
              <label className="label" htmlFor="n-termtype">
                Term type
              </label>
              <input id="n-termtype" name="termType" className="input" />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="n-desc">
                Description
              </label>
              <input id="n-desc" name="description" className="input" />
            </div>
          </div>
        </details>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Creating…" : "Create schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
