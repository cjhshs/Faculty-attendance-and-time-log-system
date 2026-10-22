# Schedule Import — Data-Quality Report

Source workbook: `attendance_to_import.xlsx` (sheet `Sheet1`)
Scope: **382 data rows, 12 columns**
Columns: `Term Type`, `Subject`, `CN`, `Description`, `Unit`, `Sem`, `Schedule`, `Section`, `Course`, `Slots`, `Instructor`, `Code`

This report is produced by the deterministic engine in `src/lib/schedule-repair.ts`
(`analyzeWorkbook`). It inspects every row; it never mutates data.

---

## A. Compound `Schedule` cells (`||`)

Each cell is split on `||`. Distribution of parts per cell:

| parts / cell | cells |
| --- | --- |
| 1 | 139 |
| 2 | 107 |
| 3 | 134 |
| 4 | 2 |

**158 cells** have all parts on the **same days and time** (for example
`F/M/T/Th/W 10:00 AM-11:00 AVR || … OLC || … ASYNC`). These are **delivery‑mode /
location alternatives for a single meeting**, not separate class hours. The other
multi‑part cells differ by day or time and are **genuine separate meetings** (for
example a lab hour and a lecture hour).

Place / mode vocabulary (count of parts):

| token | count | meaning |
| --- | --- | --- |
| `OLC` | 180 | online room |
| `ASYNC` | 140 | asynchronous — never a physical room |
| `TBA` | 138 | room/location placeholder (see E) |
| physical rooms | … | `EMM201`, `EMM303`, `FGM308`, `PC`, `AGM212`, `FGM512`, `COM A/B/C/D`, `FGM610`, `RA128`, `EMM302`, `AGM102 (CE LAB)`, `AVR`, `RACOMLAB`, `FGM406`, `EMM308` |

**Rule applied (verified against the spec §5 and the existing importer):** group a
cell's parts by *sorted weekday set + start + end*. Parts sharing a group are
alternatives → **one meeting**; the room is chosen physical → `OLC` → `TBA`, and
`ASYNC` is never selected. Parts with different days/time are separate meetings.
This is why `AVR || OLC || ASYNC` is **one** hour, not three.

NOTE: `AGM102 (CE LAB)` is a physical room with a lab qualifier. The lab suffix must
be stripped (`AGM102`) and the meeting marked `isLab`, otherwise room matching fails.

## B. Instructor names

* **153 rows** have leading/trailing or repeated internal spaces (e.g.
  `"Claver, Priscilla  De Leon"`, `"Espinosa, Lester John "`).
* Distinct raw names: **105**. Distinct after trim/collapse/lowercase: **105**.
* Normalization therefore merges **no** two distinct people in this workbook — it is
  safe to normalize for matching, but the **original text is preserved** and only
  unambiguous matches against existing faculty are auto‑linked.

## C. LIS105 records (CN `42003` and `42007`)

| CN | Subject | Section | Instructor | Schedule | Slots |
| --- | --- | --- | --- | --- | --- |
| 42003 | LIS105 | `LIS2_B1S12627` | Narciso, Jessie John Saligue | `F/M/T/Th/W 01:00 PM-02:00 TBA \|\| … OLC \|\| … ASYNC` | 16/40 |
| 42007 | LIS105 | `LIS2_B1S12627` | Narciso, Jessie John Saligue | (identical) | 2/40 |

Verdict: **possible duplicate / split record**, not an exact duplicate (CN and
enrolment differ). It must be surfaced for **human review** and never deleted on the
basis of matching schedule fields.

## D. Other repeated / suspicious records

* **No `CN` appears in more than one row.**
* **No two rows are byte‑identical** across all 12 columns.
* Exactly **one** group shares `Subject + Section + Instructor + Schedule` with a
  different `CN` — the LIS105 pair above.

So "exact duplicates" = 0; "possible duplicates" = 1.

## E. `TBA`

Two different meanings, which the importer must not conflate:

* **Instructor column = `TBA`** — the only genuine "missing instructor" cases:
  rows/CNs **42008, 44129, 48115** (3 rows).
* **`TBA` inside the `Schedule` cell** — appears in **134 rows**, almost always as one
  of several same‑time alternatives (`TBA || OLC || ASYNC`). Here `TBA` is a
  **room/location placeholder**, not an assignment. A meeting whose schedule says
  `TBA` while the Instructor column names someone is **assigned**, and must **not** be
  reported as unassigned.

## Invalid / ambiguous rows

| row | CN | Schedule | Issue |
| --- | --- | --- | --- |
| 277 | 44181 | `F/S 08:00 PM-08:00 TBA \|\| F/S 08:00 PM-09:00 TBA` | first part: end not after start |
| 336 | 48086 | `F 06:00 AM-06:00 PC` | zero‑length interval |
| 354 | 48115 | `-` | no parseable schedule; instructor `TBA` |

## Hours counting rule (single documented rule)

> **one scheduled hour per meeting‑day per 60‑minute clock hour of the meeting
> interval**, computed by `hoursOfRange(start, end)` in `src/lib/dates.ts` and shared
> by the importer, the engine, and the printable sheet.

Consequences: `07:00–09:00` = 2 h; `07:00–14:00` = 7 h (CN 44185, legitimate);
`TBA || OLC || ASYNC` at one time = 1 h. A meeting with **no instructor** cannot be
printed (no column), so its hours appear in `scheduledHours` but not in the sheet —
reported as a reconciliation discrepancy, never silently dropped.

## Actual instructor conflicts

Overlaps are classified by one shared pure function (`classifyOverlaps` in
`src/lib/import.ts`) used by both the importer and the repair engine, so the two
surfaces can never disagree. On `attendance_to_import.xlsx`:

| Class | Count | Meaning |
| --- | --- | --- |
| `CONFLICT_OVERLAP` | **17** | Different classes booked on one instructor at the same time. |
| `COMBINED_SECTIONS` | **18** | Same subject taught to several sections at once (needs confirmation, not an error). |
| duplicate record | **9** | One class listed twice (same CN, or same subject+section under two CNs). Not a clash. |

The 17 real clashes affect 8 instructors: Arriza, Claver, Espinosa, Jamero,
Nosotros, Pascual, Saligumba, Tabal. A Mon–Fri clash is reported **once** with all
five weekdays, and a same-subject block shared by six sections is reported once
with the full CN list — never as one finding per day or per section pair.

An earlier version counted **143** overlapping pairs, because it treated
same-CN duplicates, alternative rooms/durations in one cell, and concurrent
sections of one subject as clashes. Those are now classified separately above.

