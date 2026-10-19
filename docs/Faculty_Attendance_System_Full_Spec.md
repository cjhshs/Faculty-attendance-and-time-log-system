# FACULTY ATTENDANCE AND TIME LOG SYSTEM — FULL SPECIFICATION

Version: 1.0 (October 12, 2026)
Client: Ramon Magsaysay Memorial Colleges, Inc. — College of Engineering and Technology, Pioneer Ave., General Santos City
Purpose of this document: a complete, self-contained backup of every requirement, decision and assumption, written so it can be pasted into another AI tool or handed to a developer.

---

## 0. HOW TO USE THIS DOCUMENT WITH ANOTHER AI

Paste this whole document and say:

> "Read this specification fully. Do not invent features that are not listed. Where something is marked ASSUMPTION or OPEN QUESTION, ask me before building it. Use the technology stack in Section 13A exactly. Then build the system in the order given in Section 14, one step at a time, and wait for my confirmation after each step."

---

## 1. PROJECT SUMMARY

A **web-based** system for recording faculty attendance per hour of class.

Real-world flow:

1. The department holds the class schedule of all faculty members per course (program). The Dean or the Dean's Assistant imports that schedule (an Excel file) into the web system.
2. Each day, authorized staff print a daily attendance sheet from the system. The staff choose which courses to print.
3. Working students walk around the school to the designated rooms, check whether the faculty member is present, and put a **check mark per time range** on the printed sheet. No check means absent.
4. At the end of the day (about 5 PM or 8 PM), staff **encode the paper results** into the system.
5. Every 15 days (cutoff period), the system gives a summary per faculty member of present days, absent days and absent hours. This summary is used for evaluation. **Salary is NOT computed by the system.**
6. Summaries can be printed (one faculty, all faculty in bulk, or per course) and exported to one Excel file with many tabs.

Priorities: fast, not laggy, no unnecessary features, validated input, clear error messages.

---

## 2. USERS AND ROLES

| Actor | Uses the system? | What they do |
|---|---|---|
| Dean | Yes (login) | Full access, manages users and roles |
| Dean's Assistant | Yes (login) | Imports schedules, manages data |
| Staff (assigned staff) | Yes (login) | Prints daily sheets, encodes attendance, prints summaries |
| Working students | **No login** | Carry the printed sheet, check attendance by room, return the sheet to staff |

Access control is dynamic (RBAC), see Section 11.

---

## 3. SOURCE DATA: THE SCHEDULE EXCEL FILE

File analyzed: `attendance_to_import.xlsx` — one sheet named `Sheet1`, about 380 data rows plus one header row.

### 3.1 Columns (exact headers)

`Term Type`, `Subject`, `CN`, `Description`, `Unit`, `Sem`, `Schedule`, `Section`, `Course`, `Slots`, `Instructor`, `Code`

| Column | Meaning | Example |
|---|---|---|
| Term Type | Term indicator, **information only** (see 3.4) | `1`, `2` |
| Subject | Subject code | `GE501`, `LIS101` |
| CN | Class number (unique per class offering) | `44017` |
| Description | Subject title | `Science, Technology, and Society` |
| Unit | Units | `3` |
| Sem | Semester | `1st Sem` |
| Schedule | Packed schedule text (see 3.2) | see below |
| Section | Section code | `CE1_B3S12627`, `IT1_S1B12627` |
| Course | Program / course | `BLIS`, `BSCE-SE`, `BSCS`, `BSIT`, `ACT` |
| Slots | Enrollment, enrolled/capacity | `47/45` |
| Instructor | Faculty name | `Claver, Priscilla  De Leon` |
| Code | Year level | `1st`, `2nd`, `3rd`, `4th` |

"Course" in this project always means the **program**, for example BSIT. "Print per course" means per program.

### 3.2 The Schedule column format

One cell contains several slot entries separated by ` || `. Each entry is:

`<DAYS> <START>-<END> <PLACE>` with an optional suffix like `(Lab)`.

Real examples from the file:

```
F/M/T/Th/W 10:00 AM-11:00 AVR || F/M/T/Th/W 10:00 AM-11:00 OLC || F/M/T/Th/W 10:00 AM-11:00 ASYNC
F/M/T/Th/W 07:00 PM-08:00 AGM212 || F/M/T/Th/W 07:00 PM-08:00 OLC || F/M/T/Th/W 07:00 PM-08:00 ASYNC
F/T/Th/W 04:00 PM-05:00 TBA || F/T/Th/W 04:00 PM-05:00 OLC || F/T/Th/W 04:00 PM-05:00 ASYNC || M 04:00 PM-05:00 TBA (Lab)
```

Parsing rules:

- Split on `||`, trim each part.
- Days are separated by `/`. Tokens seen in the file: `M`, `T`, `W`, `Th`, `F`. **Classes also run on Saturday and Sunday**, so the parser must also accept Saturday and Sunday codes. ASSUMPTION: `S` = Saturday and `Su` = Sunday (not seen in the sample file; confirm with real weekend data, and show unknown tokens as import errors instead of guessing).
- Times are in 12-hour format (`10:00 AM-11:00 AM`). Convert to 24-hour and store start and end.
- The place token is one of: a physical room code (examples: `AVR`, `AGM212`, `FGM512`, `FGM308`, `FGM610`, `FGM406`, `EMM201`, `EMM302`, `EMM303`, `RA128`), `OLC` (online), `ASYNC` (asynchronous online), or `TBA` (room not yet assigned).
- A suffix in parentheses, such as `(Lab)`, marks the slot as a lab.
- Each cell usually repeats the same days and time with 3 different places. These are **one class meeting with alternative modes**, not three separate meetings. Collapse them into one slot using the room rule in 3.3.

### 3.3 Room selection rule (decided by the client)

For each class meeting (same days, same time):

1. If a **physical room** exists (anything not `OLC`, `ASYNC`, `TBA`), use it as the room.
2. Else if `OLC` exists, the room is `OLC` (mode = online).
3. Else if `TBA` exists, the room is `TBA` (mode = to be assigned; the printed sheet leaves a write-in line).
4. `ASYNC` is never printed as the room.
5. Lab entries (`(Lab)`) are their own meeting, with their own day and time.

Online (OLC/ASYNC) classes **still count for attendance**. Sometimes online classes are held in a lab, or checked through social media, and the check is still recorded on the paper sheet.

ASSUMPTION: When both a physical room and OLC exist for the same meeting, the physical room is printed (the earlier question about showing "AVR / OLC" was answered "yes" to the physical-first rule).

### 3.4 Term Type

Per the client, Term Type 1 means a subject that runs only in the first half of the semester, and 3 means the whole semester. The sample file contains values `1` and `2` (2 presumably means second half, unconfirmed). **The system stores the value for information only and does not use it for any logic.** Which classes appear on a printed sheet depends only on the weekday of the selected date. Staff decide which day's attendance to print.

### 3.5 Data quality problems found (the import must handle them)

- Instructor names have trailing spaces, double spaces inside names, and inconsistent upper/lower case (`Espinosa, Lester John `, `ATIENZA, JURIELHYN Suardiana`, `Claver, Priscilla  De Leon`).
- Some instructors are `TBA` (no faculty assigned yet).
- The same person teaches in several programs (for example Rendaje in BSCS and BSIT, Salabao in BSCE-SE and BSIT). The faculty summary must combine all programs for that person, while the daily sheet is printed per course.
- Slots can be like `13/40` or `47/45` (over capacity). This is not an error.

Normalization rules: trim, collapse repeated spaces, compare case-insensitively, keep format `Surname, Given Middle`. Show likely duplicates (very similar names) in the import preview so the user can merge them.

---

## 4. IMPORT FEATURE

Who: users with the "Import schedule" permission (Dean or Assistant).

Steps:

1. Upload `.xlsx`.
2. The system parses (using a library such as SheetJS) and runs validation.
3. **Preview screen** before anything is saved, showing: number of rows, new faculty, new slots, updated slots, unchanged, and a list of errors and warnings (unknown day token, unreadable time, empty instructor, duplicate CN).
4. User confirms. The system saves in one database transaction.
5. **Re-import behavior:** existing slots are updated and new ones are added. Nothing is deleted without explicit confirmation.

Performance: the import runs as a background job with a progress indicator, and uses bulk inserts, so a large file never freezes the page.

---

## 5. PRINTED DAILY ATTENDANCE SHEET

### 5.1 Selecting what to print

- The Print Attendance page opens with **today's date as the default**, and a list of all courses. Staff tick which courses to print.
- Staff can change the date to **any date** (past or future). All seven days of the week are supported, including Saturday and Sunday.
- Output is **per course**, one course per page (or set of pages).

### 5.2 Which classes appear

The system takes the weekday of the chosen date and pulls every slot of the chosen courses scheduled for that weekday. Term Type does not filter. Dates marked in the holiday calendar are flagged on the sheet or skipped.

### 5.3 Layout (based on the school's existing paper form)

Existing form (from the photo and Excel sample):

- Header: school logo (left), `RAMON MAGSAYSAY MEMORIAL COLLEGES, INC.`, `COLLEGE OF ENGINEERING AND TECHNOLOGY`, `PIONEER AVE., GENERAL SANTOS CITY`, college logo (right), title `ATTENDANCE`.
- `DATE:` field with weekday and date (example: `Monday 10/12/26`).
- A grid: **rows = time ranges** (7:00-8:00, 8:00-9:00, … up to 8:00-9:00 PM, one hour each), **columns = faculty surnames** (example: NOSOTROS, OCZON, ARRIZA, JAMERO, PASCUAL, ESPINOS, ALARCIO, FARNAZO, ABDURAJIK, CASTAÑO, RIVAS, CALLAGA).
- Footer: `Prepared by:` and `Checked by:`.

### 5.4 NEW: room column (a new feature added by the developers; not on the current paper form)

Today the working student writes the room by hand in the cell. The new design prints it automatically.

**Each faculty gets TWO narrow columns:**

| Column | Content |
|---|---|
| Room | Printed automatically, 4 to 5 characters (for example `COM B`, `EMM201`, `OLC`, `TBA`) |
| Check | Left empty for the working student to put one check mark |

Rules:

- **Grouping:** if the same faculty has consecutive hours in the same room, the room is printed once as a merged block across those hours (like the bracketed `COM B` cells in the sample). The check column still has **one box per hour**, because attendance is checked per time range.
- A physical room is printed as is. `OLC` is printed as `OLC`. `TBA` is printed as `TBA` and the student can write the real room next to it.
- A small legend at the bottom: `✔ = present, blank = absent, TBA = write the room`.
- Landscape orientation, **12 faculty per page** (the existing form has 12 columns), continuing on the next page if there are more.
- Faculty column header is the surname (as in the sample). If two faculty share a surname, add the first initial.
- **No reason column on the printed form.** If a faculty member is absent with a reason, the student writes it on the back of the paper, or just tells the staff verbally when there is only one case.
- **Prepared by / Checked by:** two default names pre-filled, editable, with the option to add more names (see Settings, Section 10).

### 5.5 Example (BSIT, Monday 10/12/2026), simplified

| TIME | OCZON room | ✔ | NALAUNAN room | ✔ |
|---|---|---|---|---|
| 11:00-12:00 | | | TBA | ☐ |
| 12:00-1:00 | EMM201 | ☐ | | |

---

## 6. ENCODING SCREEN

- Staff pick the date and course. The screen mirrors the printed grid so encoding is quick.
- Staff tick each hour that has a check on the paper.
- For any absence, staff can type a **short optional reason** (taken from the back of the paper or from the working student).
- Staff can correct the room when it was `TBA` (stored for that date's record).
- **Draft state:** until staff press **Save for the day**, nothing counts. On save, every unchecked hour of that day becomes **absent**. This prevents a half-encoded day from being counted as absent.
- Editing a saved past date requires the separate permission "Edit past attendance".

---

## 7. HOLIDAY AND NO-CLASS CALENDAR

- Users with permission mark dates (or a range) as no-class, with a label (for example "Holiday", "Class suspension").
- Hours on those dates are excluded from scheduled hours and are never counted as absences.
- The daily print shows a note or skips the date.

---

## 8. SUMMARY (CUTOFF PERIOD)

### 8.1 Date range

- The user picks **any** start and end date (for example Oct 1 to Oct 15).
- **Default: the 15-day cutoff period containing today** — 1st to 15th, or 16th to the end of the month.

### 8.2 Per faculty member, over the range

- Total scheduled hours
- Total present hours
- **Total absent hours**
- Total present days
- **Total absent days** (a scheduled day where no hour was checked)
- Partial days (some hours checked, some not) are shown separately, and their missed hours still count in absent hours
- List of absence reasons by date
- Holidays and no-class days are excluded

Faculty who teach in several programs are combined into one summary (the report also shows a breakdown by program).

**Salary is not part of the system.** No rates, no deductions.

### 8.3 Printing

- One faculty member
- All faculty (bulk)
- **Per course** (summary of the faculty in a chosen program)

---

## 9. EXCEL EXPORT

- A button "Export to Excel" on the summary page.
- Output: **one `.xlsx` file** containing:
  - an **overall summary tab** (all faculty, one row each), and
  - **one tab per faculty member** with that person's day-by-day detail and totals.
- The export follows the chosen date range. Changing the range and exporting again regenerates the whole workbook.
- Generated on the server (for example with ExcelJS) with formatted headers and column widths. Optionally the totals can be live Excel formulas, so edits inside the file recalculate.
- Sheet names must be valid for Excel (maximum 31 characters, no `\ / ? * [ ]`), made unique if two faculty collide.

---

## 10. SETTINGS

- **Prepared by** and **Checked by** names printed on the sheet. Two defaults, editable, with the option to add more names.
- Printed header text and logos.
- Room list (for example COM A, COM B, COM C) so staff can pick instead of retyping.

---

## 11. LOGIN AND DYNAMIC ACCESS CONTROL (RBAC)

- Login for the Dean and staff. **The Dean and staff can create new users.**
- Roles are created and edited inside the system (not hard-coded). A role is a set of permission checkboxes. A user can have one or more roles.

Suggested permissions:

| Group | Permissions |
|---|---|
| Schedule | Import schedule, edit schedule slots |
| Faculty | View faculty, add/edit faculty and rooms |
| Attendance | Print daily sheets, encode attendance, edit attendance of past dates |
| Calendar | Manage holidays and no-class days |
| Summary | View summary, print summary, export Excel |
| Settings | Edit Prepared by / Checked by and header |
| Users | View users, create/edit users, assign roles, manage roles |

Safeguards:

- Two default roles: **Dean** (all permissions, cannot be deleted) and **Staff** (encode and print by default, not import and not user management). Both editable, except Dean's full-access protection.
- A user can grant only permissions they themselves hold, so no one can create an account more powerful than their own.
- At least one active Dean account must always exist.
- First-login password change, passwords stored hashed.
- Audit log: who imported, encoded, edited or exported, and when.

---

## 12. DATA MODEL (SUGGESTED)

| Table | Key fields |
|---|---|
| `users` | id, name, username, password_hash, active, must_change_password |
| `roles`, `permissions`, `role_permissions`, `user_roles` | RBAC |
| `faculty` | id, full_name (normalized), surname, active |
| `courses` | id, code (BLIS, BSCE-SE, BSCS, BSIT, ACT), name |
| `rooms` | id, code, type (physical / online / TBA) |
| `schedule_slots` | id, cn, subject, description, units, section, year_level, course_id, faculty_id (nullable when TBA), weekday (0-6, Sunday to Saturday), start_time, end_time, room_id, mode (face-to-face / online / lab), term_type (info only), semester |
| `attendance` | id, slot_id, date, hour_start, present (boolean), reason (text, nullable), room_override (nullable), encoded_by, encoded_at, day_status (draft/saved) |
| `holidays` | id, date, label |
| `settings` | key, value (prepared-by names, header text) |
| `audit_log` | id, user_id, action, details, created_at |

Design principle for speed: **do not store a row for every class on every date.** Store the schedule once (one record per weekday/time/room). Generate each day's sheet from it. Store only the attendance results staff actually encode. Index on `(date)`, `(faculty_id)`, `(slot_id, date)`. Compute each summary with a single query over the date range.

---

## 13. NON-FUNCTIONAL REQUIREMENTS

- Fast and responsive; no laggy pages. Server-side pagination and range queries; no loading the full database into the browser.
- Import in the background with progress.
- Print pages are plain HTML/CSS optimized for printing; bulk PDF is generated on the server.
- Clear validation and error messages (for the import especially).
- No unnecessary features beyond Section 15's list.
- Responsive enough for a laptop or tablet in the office; mobile is not required.

The technology stack is fixed in Section 13A.

---

## 13A. TECHNOLOGY AND DEPLOYMENT

Use exactly this stack. Do not substitute other frameworks without asking.

| Layer | Choice | Notes |
|---|---|---|
| Frontend and backend | **Next.js (TypeScript)**, one project | Pages and server code in the same project. Server actions or API routes handle all data. |
| Database | **PostgreSQL** | Handles the date-range summary queries well. |
| Database access | **Prisma** | Typed queries and schema migrations. |
| Login | Session-based login with hashed passwords (for example Auth.js with a credentials provider, bcrypt or argon2) | Permissions are checked **on the server** for every action; hiding a button in the page is not enough. |
| Excel import | **SheetJS (xlsx)** | Reads the schedule file (Section 3). |
| Excel export | **ExcelJS** | Builds the multi-tab workbook with formatting (Section 9). |
| Printing | Print-styled HTML/CSS pages (landscape, 12 faculty per page) | Staff print straight from the browser. |
| Bulk PDF | **Puppeteer** (server-side) | For bulk summary prints; optional if browser printing is enough. |

### Deployment (no Docker)

Docker is intentionally **excluded** to keep setup simple. Install directly on the school's server or computer:

1. Install Node.js (LTS) and PostgreSQL.
2. Create the database and set the connection string in an `.env` file.
3. Run `npm install`, then the Prisma migration command to create the tables, then a seed script that creates the default **Dean** and **Staff** roles and the first Dean account (forced to change password at first login).
4. Build with `npm run build` and run with `npm start`, kept alive by a process manager (for example PM2) so it restarts after a reboot.
5. Staff open the system in a browser using the server's address on the school network.
6. **Backups:** schedule a nightly `pg_dump` of the database and keep copies off the server. This matters because attendance records cannot be recreated.

Required deliverables from the developer: a `README` with these exact install steps, an `.env.example` file, and the seed script.

---

## 14. BUILD ORDER

1. Login and RBAC
2. Excel import with preview and name cleanup
3. Faculty, course and room master lists
4. Daily attendance print (room grouping, default today, course selection)
5. Encoding screen (draft and save)
6. Holiday and no-class calendar
7. Summary for any date range (default 15 days)
8. Summary printing: per faculty, bulk, per course
9. Multi-tab Excel export
10. Settings (Prepared by / Checked by names)

---

## 15. COMPLETE FEATURE LIST (FINAL)

1. Login and dynamic roles and permissions
2. Schedule import from Excel with preview and name cleanup
3. Faculty, course and room lists
4. Daily attendance print, default today, changeable date, per selected course, with automatic room column and TBA write-in
5. Encoding screen mirroring the printed grid, with optional short reasons
6. Holiday and no-class calendar
7. Summary for any date range, default 15-day cutoff
8. Summary printing per faculty, bulk, and per course
9. Excel export with an overall tab plus one tab per faculty
10. Settings for Prepared by and Checked by names
11. Audit log

Explicitly **out of scope**: salary computation, a Late status, term-based date filtering, a reason column on the printed form, working-student logins.

---

## 16. DECISIONS LOG (CLIENT ANSWERS)

| Topic | Decision |
|---|---|
| Room source | Physical room first; if none, OLC; TBA stays TBA with a write-in space |
| Online/async classes | Count for attendance |
| How attendance is recorded | One check per time range; no check = absent |
| Reasons | Not on the printed form; on the back of the paper or told verbally; encoded by staff as a short reason |
| Salary | Excluded from the system |
| Printing | Per course, default today, staff can change the date; per-course summary print also included |
| Term Type | Information only |
| Weekends | Included (Saturday and Sunday classes exist) |
| Holiday calendar | Yes |
| Draft until save | Yes |
| Summary default range | 15 days |
| Prepared by / Checked by | Two defaults, editable, can add more |
| Login | Dean and staff; staff can add users; dynamic RBAC |
| Room column | New feature by the developers, not on the current paper form |
| "1" in the sample screenshot | Mockup artifact; ignore |
| Technology | Next.js (TypeScript), PostgreSQL, Prisma, SheetJS, ExcelJS, Puppeteer; **no Docker** (plain server install with PM2), see Section 13A |

---

## 17. ASSUMPTIONS AND OPEN QUESTIONS (CONFIRM BEFORE BUILDING)

1. Saturday and Sunday codes in the Schedule column are assumed to be `S` and `Su`. Not present in the sample file; confirm with a real file.
2. Term Type `2` is assumed to mean second half of the semester (client only defined 1 and 3).
3. Whether a physical room is preferred over OLC when both appear is assumed yes (confirmed in conversation).
4. The class hours on the printed grid run from 7:00 AM to 9:00 PM (taken from the sample form); extend if the schedule has earlier or later classes.
5. Faculty with the same surname get a first-initial suffix in the printed column header.
6. Faculty listed as `TBA` in the Excel have no faculty column; their slots are flagged as unassigned in the import preview.
