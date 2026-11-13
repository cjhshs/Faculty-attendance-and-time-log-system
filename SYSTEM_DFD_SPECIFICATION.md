# FACULTY ATTENDANCE AND TIME LOG SYSTEM — DATA FLOW DIAGRAM (DFD) SPECIFICATION

> **Institution:** Ramon Magsaysay Memorial Colleges, Inc. (RMMC)  
> **Unit:** College of Engineering and Technology (CET), Pioneer Avenue, General Santos City  
> **System:** Faculty Attendance and Time Log System  
> **Document Purpose:** Comprehensive, detailed Data Flow Diagram (DFD) specification from Context Level (Level 0) down to functional decomposition (Level 1 & Level 2), complete with a comprehensive Data Dictionary, Process Specifications, and Data Store Definitions.

---

## TABLE OF CONTENTS

1. [DFD Conventions & Notation](#1-dfd-conventions--notation)
2. [Level 0: System Context Diagram](#2-level-0-system-context-diagram)
   - 2.1 Context Diagram Architecture
   - 2.2 External Entities Inventory
   - 2.3 Boundary Input and Output Data Flows
3. [Level 1: System Decomposition DFD](#3-level-1-system-decomposition-dfd)
   - 3.1 Subsystem Process Architecture
   - 3.2 Master Data Stores Inventory
   - 3.3 Inter-Process Data Routing
4. [Level 2: Detailed Process Decompositions](#4-level-2-detailed-process-decompositions)
   - 4.1 Process 1.0: User Authentication & Access Control (RBAC)
   - 4.2 Process 2.0: Schedule Ingestion, Parsing & Conflict Analysis
   - 4.3 Process 3.0: Department Registry & Faculty Membership Management
   - 4.4 Process 4.0: Daily Attendance Sheet Generation & Print Dispatch
   - 4.5 Process 5.0: Physical Room Inspection & Daily Digital Encoding
   - 4.6 Process 6.0: 15-Day Cutoff Attendance Aggregation & Reporting
   - 4.7 Process 7.0: System Governance, Security Auditing & Operational Reset
5. [Comprehensive Data Dictionary](#5-comprehensive-data-dictionary)
   - 5.1 Data Flow Definitions
   - 5.2 Data Store Structures (Physical Schema Alignment)
   - 5.3 Process Specifications (Mini-Specs / P-Specs)
6. [Traceability & Architectural Constraints](#6-traceability--architectural-constraints)

---

## 1. DFD CONVENTIONS & NOTATION

This specification employs the **Gane and Sarson / Yourdon-DeMarco hybrid notation** represented natively via standard Mermaid diagrams and structured data dictionaries:

```text
┌───────────────────────┐         (  Process ID  )         ╔══════════════════════╗
│    External Entity    │   ───►  (   Process    )   ───►  ║ D# |   Data Store    ║
│ [Source / Sink Agent] │  [Flow] (Transformation)         ╚══════════════════════╝
└───────────────────────┘
```

- **External Entities (Rectangles):** People, departments, or external hardware/files outside system boundary (Dean, Assistant Dean, Staff Encoders, Working Students, Faculty, Source Excel File).
- **Processes (Circles / Rounded Rectangles):** Logic transforming incoming data flows into outgoing data flows (Numbered hierarchically: `0.0`, `1.0`, `1.1`, `2.1.1`).
- **Data Stores (Open Double Rectangles / Parallel Lines):** Persistent database tables in PostgreSQL.
- **Data Flows (Arrows with Labels):** Packets of data moving between entities, processes, and data stores.

---

## 2. LEVEL 0: SYSTEM CONTEXT DIAGRAM

The Context Diagram defines the boundary of the **Faculty Attendance & Time Log System (0.0)** relative to its external operational environment.

### 2.1 Context Diagram Architecture

```mermaid
flowchart TD
    Excel["External Entity:<br>Excel Schedule File<br>(attendance_to_import.xlsx)"]
    Dean["External Entity:<br>Dean / Assistant Dean<br>(Administrator)"]
    Staff["External Entity:<br>Department Staff<br>(Attendance Encoders)"]
    Student["External Entity:<br>Working Student Checkers<br>(Physical Room Inspectors)"]
    Faculty["External Entity:<br>Faculty Members<br>(Observed Subjects/Classes)"]

    System(["Process 0.0:<br>Faculty Attendance &<br>Time Log System"])

    Excel -->|"Raw Class Schedule Data<br>(CN, Days, Time, Room, Faculty, Subject)"| System
    Dean -->|"Credentials, Roster Assignments,<br>Import Triggers, System Reset Phrases"| System
    System -->|"Validation Previews, Conflict Reports,<br>Audit Trails, System Health"| Dean

    Staff -->|"Credentials, Manila Date Range,<br>Encoded Checkmarks, Session Certifications"| System
    System -->|"Printable Room Attendance Sheets,<br>Draft Restorations, 15-Day Summaries"| Staff

    System -->|"Physical Printed Log Sheets<br>(Paginated 24 faculty/page, Room Checkboxes)"| Student
    Student -->|"Physical Checkmark Tickmarks<br>(Delivered on Paper to Office)"| Staff
    Faculty -.->|"Physical Classroom Presence<br>(Visual Observation per Hour)"| Student
```

### 2.2 External Entities Inventory

| Entity Name | Classification | Real-World Role | Primary Interfacing Data Flows |
|---|---|---|---|
| **Excel Schedule File** | Source (Input) | Semester class schedules exported from curriculum office (`attendance_to_import.xlsx`). | In: `Raw Class Schedule Data` |
| **Dean / Assistant Dean** | Person (Interactive) | System owner, academic department head. Authorizes users, assigns departments, resolves timetable conflicts. | In: `Credentials`, `Roster Assignments`, `Import Triggers`, `Reset Phrase`<br>Out: `Validation Previews`, `Conflict Reports`, `Audit Trails` |
| **Department Staff** | Person (Interactive) | Administrative office staff. Generates daily printable sheets, transcribes paper checkmarks into matrix grid, prints cutoff reports. | In: `Credentials`, `Encoded Checkmarks`, `Session Saves`<br>Out: `Printable Sheets`, `Cutoff Evaluation Reports` |
| **Working Students** | Person (Offline) | Scholarship students assigned to inspect classrooms hourly. Has **no login account**; works strictly on paper. | In: `Physical Printed Log Sheets`<br>Out: `Physical Checkmark Tickmarks` (Paper) |
| **Faculty Members** | Person (Passive) | College professors teaching scheduled classes. Observed in physical/virtual classrooms. | Out: `Physical Classroom Presence` |

---

## 3. LEVEL 1: SYSTEM DECOMPOSITION DFD

The Level 1 diagram decomposes Process 0.0 into its 7 core functional subsystems and establishes all persistent PostgreSQL data stores.

```mermaid
flowchart TD
    %% Entities
    Dean["Dean / Assistant Dean"]
    Staff["Department Staff"]
    Excel["Excel Timetable File"]
    Student["Working Student"]

    %% Processes
    P1["1.0<br>Authenticate & Manage RBAC"]
    P2["2.0<br>Ingest, Parse & Repair Schedule"]
    P3["3.0<br>Manage Department Registry"]
    P4["4.0<br>Generate & Print Daily Sheets"]
    P5["5.0<br>Encode & Certify Daily Attendance"]
    P6["6.0<br>Aggregate & Export 15-Day Cutoff"]
    P7["7.0<br>System Audit & Protected Reset"]

    %% Stores
    D1[("D1: Users & Permissions")]
    D2[("D2: Colleges & Departments")]
    D3[("D3: Faculty Registry")]
    D4[("D4: Courses & Programs")]
    D5[("D5: Rooms & Labs")]
    D6[("D6: Schedule Slots Master")]
    D7[("D7: Import Batches")]
    D8[("D8: Attendance Records & Sessions")]
    D9[("D9: Academic Periods & Holidays")]
    D10[("D10: Institutional Settings")]
    D11[("D11: Security Audit Log")]

    %% P1 Flows
    Dean & Staff -->|"User Credentials"| P1
    P1 <-->|"Verify & Fetch Roles"| D1
    P1 -->|"Session Context"| P2 & P3 & P4 & P5 & P6 & P7

    %% P2 Flows
    Excel -->|"Workbook Binary"| P2
    P2 <-->|"Check Registered Names"| D3
    P2 <-->|"Check Courses & Rooms"| D4 & D5
    P2 -->|"Write Validated Slots"| D6
    P2 -->|"Record Import Batch"| D7
    P2 -->|"Audit Import Event"| D11
    P2 -->|"Conflict Preview"| Dean

    %% P3 Flows
    Dean -->|"Department Assignment / Removal"| P3
    P3 <-->|"Read / Update Department"| D3
    P3 <-->|"Validate College Codes"| D2
    P3 -->|"Audit Membership Change"| D11

    %% P4 Flows
    Staff -->|"Date & Scope Parameters"| P4
    P4 <-->|"Check Academic Boundary"| D9
    P4 <-->|"Fetch Day Timetable Slots"| D6
    P4 <-->|"Fetch Roster & Department"| D3
    P4 <-->|"Fetch Institutional Logos & Headers"| D10
    P4 -->|"Formatted Paper Sheet"| Student

    %% P5 Flows
    Student -->|"Physical Paper Sheet"| Staff
    Staff -->|"Hourly Cell Checkmarks"| P5
    P5 <-->|"Auto-save / Restore Drafts"| D8
    P5 -->|"Certified Daily Session"| D8
    P5 -->|"Audit Session Save"| D11

    %% P6 Flows
    Staff -->|"15-Day Date Range"| P6
    P6 <-->|"Query Attendance & Slots"| D6 & D8
    P6 <-->|"Fetch Department Membership"| D3
    P6 -->|"Certified Summary (Excel/Print)"| Staff

    %% P7 Flows
    Dean -->|"Reset Phrase & Confirmation"| P7
    P7 <-->|"Wipe Operational Slots/Attendance"| D6 & D7 & D8
    P7 -->|"Log Reset Action"| D11
```

### 3.2 Master Data Stores Inventory

| Store ID | Table Name | Data Store Purpose | Lifecycle / Persistence Rule |
|---|---|---|---|
| **D1** | `users`, `roles`, `permissions`, `user_roles`, `role_permissions` | System accounts, bcrypt password hashes, and dynamic RBAC capabilities. | Permanent master data; preserved during resets. |
| **D2** | `colleges` | Institutional faculties (CET, CBE, CTE, COAHS, etc.). | Permanent master data; preserved during resets. |
| **D3** | `faculty` | Verified master instructor roster with permanent `departmentId`. | Permanent master data; preserved during resets. |
| **D4** | `courses` | Academic degree programs (BSIT, BSCS, etc.) and college mappings. | Permanent master data; preserved during resets. |
| **D5** | `rooms` | Classrooms, computer laboratories, AVR, and online OLC modes. | Permanent master data; preserved during resets. |
| **D6** | `schedule_slots` | Timetable meeting offerings (CN, weekday, time, room, faculty, course). | Operational data; flushes during operational reset. |
| **D7** | `import_batches` | File import audit headers, checksums, and row counts. | Operational data; flushes during operational reset. |
| **D8** | `attendance`, `attendance_sessions`, `attendance_drafts` | Hourly checkmarks, certified sessions, and in-progress local drafts. | Operational data; flushes during operational reset. |
| **D9** | `academic_periods`, `holidays` | Semester date boundaries (`startDate`, `endDate`) and holiday suspensions. | Master control data; preserved during resets. |
| **D10**| `settings`, `report_signatures` | Institutional headers, signatories, school seal, and college emblem. | Master control data; preserved during resets. |
| **D11**| `audit_logs` | Immutable audit stream with actor ID, action type, timestamp, and impact. | Permanent audit data; preserved during resets. |

---

## 4. LEVEL 2: DETAILED PROCESS DECOMPOSITIONS

---

### 4.1 Process 1.0: User Authentication & Access Control (RBAC)

Decomposes credential verification, role-based route guarding, and force-password reset.

```mermaid
flowchart TD
    User["User Actor<br>(Dean / Staff)"]
    D1[("D1: Users & Permissions")]

    P11["1.1<br>Validate User Credentials"]
    P12["1.2<br>Enforce Initial Password Reset"]
    P13["1.3<br>Extract Roles & Permissions Matrix"]
    P14["1.4<br>Generate Signed Session Token"]

    User -->|"Username & Password"| P11
    P11 <-->|"Lookup Account & PasswordHash"| D1
    P11 -->|"Invalid Credentials"| User
    P11 -->|"Authenticated User Row"| P12

    P12 -->|"mustChangePassword == true"| User
    User -->|"New Password Payload"| P12
    P12 -->|"Update Hash & Clear Flag"| D1

    P12 -->|"Verified Account"| P13
    P13 <-->|"Fetch RolePermissions via Join"| D1
    P13 -->|"Permissions Set"| P14
    P14 -->|"Encrypted Cookie Session"| User
```

#### Process Mini-Specs (1.0)
- **1.1 Validate Credentials:** Query `users` by unique username. Verify password hash using `bcrypt.compare()`. If user inactive, deny access immediately.
- **1.2 Enforce Password Reset:** If `mustChangePassword === true`, redirect to `/change-password`. Validate minimum 8 characters; update `passwordHash` and set `mustChangePassword = false`.
- **1.3 Extract Permissions:** Join `user_roles` → `roles` → `role_permissions` → `permissions`. Construct a permissions array (`faculty.manage`, `attendance.encode`, etc.).
- **1.4 Generate Session:** Serialize authenticated identity and permissions into encrypted HTTP-only session cookie.

---

### 4.2 Process 2.0: Schedule Ingestion, Parsing & Conflict Analysis

Decomposes the deterministic timetable ingestion pipeline from Excel byte upload to relational commit.

```mermaid
flowchart TD
    Excel["attendance_to_import.xlsx"]
    Dean["Dean / Assistant Dean"]
    D3[("D3: Faculty Registry")]
    D4[("D4: Courses Catalog")]
    D5[("D5: Rooms Catalog")]
    D6[("D6: Schedule Slots")]
    D7[("D7: Import Batches")]
    D11[("D11: Audit Logs")]

    P21["2.1<br>Read Workbook & Extract 12 Columns"]
    P22["2.2<br>Decompose Compound Schedule Cells (||)"]
    P23["2.3<br>Select Room via Priority (Phys > OLC > TBA)"]
    P24["2.4<br>Resolve Faculty via normalizeFacultyName()"]
    P25["2.5<br>Detect Schedule Conflicts & Overlaps"]
    P26["2.6<br>Compute Department Breakdown & Summary"]
    P27["2.7<br>Filter Scope & Commit Transaction"]

    Excel -->|"File Buffer"| P21
    P21 -->|"Raw Row Objects (382 rows)"| P22
    P22 -->|"Split Day-Time-Place Tokens"| P23
    P23 -->|"Normalized Meeting Blocks"| P24
    
    P24 <-->|"Match Normalized Name"| D3
    P24 -->|"Resolved Status (MATCHED, UNASSIGNED, etc.)"| P25
    
    P25 -->|"Evaluate Pairwise Overlaps"| P26
    P26 -->|"Pre-Flight Validation Preview<br>(Breakdown: CET: 378, TBA: 2, Errors: 3)"| Dean

    Dean -->|"Scope Selection (CET) & Commit Trigger"| P27
    P27 <-->|"Auto-create Missing Programs / Rooms"| D4 & D5
    P27 -->|"Bulk Insert / Update Slots"| D6
    P27 -->|"Create Import Batch Record"| D7
    P27 -->|"Audit Import Batch Details"| D11
```

#### Process Mini-Specs (2.0)
- **2.1 Read Workbook:** Read `attendance_to_import.xlsx` using SheetJS. Verify presence of required 12 headers (`Term Type`, `Subject`, `CN`, `Description`, `Unit`, `Sem`, `Schedule`, `Section`, `Course`, `Slots`, `Instructor`, `Code`).
- **2.2 Decompose Compound Schedule:** Split cell by `||`. Group by identical `(weekday set, start_time, end_time)`.
- **2.3 Select Room Priority:** Apply physical classroom first (`AVR`, `FGM512`, etc.); if absent, select `OLC`; if absent, select `TBA`. Discard `ASYNC`. Strip `(Lab)` suffix for room lookup.
- **2.4 Resolve Faculty:** Normalize instructor name with `normalizeFacultyName()`. Search `faculty` table:
  - Unique match with `departmentId`: `"MATCHED"`.
  - Unique match with `departmentId == null`: `"UNASSIGNED"`.
  - Multiple matches: `"AMBIGUOUS"`.
  - No match: `"UNMATCHED"`.
  - Instructor `TBA`: `"TBA"`.
- **2.5 Detect Conflicts:** Cross-check slots on the same faculty at the same weekday/time interval:
  - Different classes: `CONFLICT` (blocking).
  - Same subject + multiple sections: `COMBINED` (non-blocking).
  - Identical class repeated: `DUPLICATE` (non-blocking).
- **2.6 Compute Breakdown:** Count parsed rows by registered department (`CET`, `CBE`, `CTE`, `COAHS`, `Other`, `Unassigned`).
- **2.7 Commit Transaction:** Execute single ACID transaction. If `reprocessOnly === true`, update existing slots from current roster without inserting new slots.

---

### 4.3 Process 3.0: Department Registry & Faculty Membership Management

Decomposes the permanent faculty department registry, quick assignment, and non-destructive removal.

```mermaid
flowchart TD
    Dean["Dean / Assistant Dean"]
    D2[("D2: Colleges Table")]
    D3[("D3: Faculty Table")]
    D6[("D6: Schedule Slots")]
    D8[("D8: Attendance Records")]
    D11[("D11: Audit Logs")]

    P31["3.1<br>Load Registry & Calculate Historical Counts"]
    P32["3.2<br>Seed / Apply Initial CET Roster (105 Members)"]
    P33["3.3<br>Assign Faculty to Department (Single / Bulk)"]
    P34["3.4<br>Remove Department Membership (Confirmed)"]

    Dean -->|"View / Filter Request"| P31
    P31 <-->|"Fetch Roster & Departments"| D3 & D2
    P31 <-->|"Count Attached Records"| D6 & D8
    P31 -->|"Roster View with Counts"| Dean

    Dean -->|"Trigger Initial CET Seed"| P32
    P32 <-->|"Match 105 Documented Candidates"| D3
    P32 -->|"Set departmentId = CET.id"| D3
    P32 -->|"Log Roster Seed Audit"| D11

    Dean -->|"Faculty ID & Target Dept ID"| P33
    P33 <-->|"Validate College ID"| D2
    P33 -->|"Update Faculty.departmentId"| D3
    P33 -->|"Audit Assignment Event"| D11

    Dean -->|"Faculty ID & confirm=1"| P34
    P34 <-->|"Load Historical Slots & Attendance"| D6 & D8
    P34 -->|"Set Faculty.departmentId = NULL"| D3
    P34 -->|"Audit Removal with Preserved Counts"| D11
```

#### Process Mini-Specs (3.0)
- **3.1 Load Registry:** Query `faculty` joined with `colleges`. Query `COUNT(schedule_slots)` and `COUNT(attendance)` grouped by `facultyId`.
- **3.2 Apply Initial CET Roster:** Match `INITIAL_CET_ROSTER` (Kimberly Kate Abueme + 104 candidates) against `faculty`. Update `departmentId = CET.id` inside a transaction.
- **3.3 Assign Department:** Update `faculty.departmentId`. Associated schedule slots and attendance records immediately reflect the new department because queries join through `faculty.department`.
- **3.4 Remove Department:** Ensure `confirm === "1"`. Set `departmentId = null`. Historical slots and attendance records remain untouched. Log exact impact text: `"[Name]: [From] → no department. X slots and Y attendance records preserved"`.

---

### 4.4 Process 4.0: Daily Attendance Sheet Generation & Print Dispatch

Decomposes the daily sheet generation pipeline, time-gating, 24-faculty pagination, and signatory injection.

```mermaid
flowchart TD
    Staff["Department Staff"]
    Student["Working Student Checker"]
    D6[("D6: Schedule Slots")]
    D3[("D3: Faculty Registry")]
    D8[("D8: Attendance (Overrides)")]
    D9[("D9: Academic Periods & Holidays")]
    D10[("D10: Settings & Signatures")]

    P41["4.1<br>Initialize Date & Boundary Gate (Asia/Manila)"]
    P42["4.2<br>Query Schedule Slots by Department Scope"]
    P43["4.3<br>Apply Room Overrides & Holiday Notices"]
    P44["4.4<br>Paginate Columns (Max 24 Faculty / Sheet)"]
    P45["4.5<br>Inject Institutional Branding & Signatories"]
    P46["4.6<br>Render Print-Optimized Layout (@media print)"]

    Staff -->|"Date, Department (CET), Programs"| P41
    P41 <-->|"Verify Against Semester Bounds"| D9
    P41 -->|"Valid Date Context"| P42

    P42 <-->|"Fetch Slots for Weekday & Dept"| D6
    P42 <-->|"Verify Faculty Department == CET"| D3
    P42 -->|"Raw Meeting Slots"| P43

    P43 <-->|"Fetch Active Room Overrides"| D8
    P43 <-->|"Check Holiday Calendar"| D9
    P43 -->|"Resolved Class Meetings"| P44

    P44 -->|"Paginated Column Sets"| P45
    P45 <-->|"Fetch Seal Logos, Headers, Signatories"| D10
    P45 -->|"Complete Document Tree"| P46
    P46 -->|"Printed Physical Log Sheets"| Student
```

#### Process Mini-Specs (4.0)
- **4.1 Boundary Gate:** Default date via `getTodayLocalDate()` (`Asia/Manila`). Check if date falls between `academic_periods.startDate` and `endDate`. If holiday exists, set holiday label.
- **4.2 Query Slots:** Extract `weekdayOfDate(date)`. If `department === "CET"`, query `schedule_slots` where `weekday == target` AND `faculty.department.code == "CET"`. **Never filter by course code; CET instructors teaching NSTP/GE are included.**
- **4.3 Apply Overrides:** Query `attendance.roomOverride` for active slots on that date.
- **4.4 Paginate Columns:** Fixed 24 faculty members per printable landscape page. If 40 faculty members teach on Monday in BSIT, split into Page 1 (24 faculty) and Page 2 (16 faculty).
- **4.5 Inject Branding:** Load `settings` for school header, college header, campus address, school seal URI, college logo URI, and signatory names/titles.

---

### 4.5 Process 5.0: Physical Room Inspection & Daily Digital Encoding

Decomposes the student walkaround inspection, evening encoding, real-time draft persistence, and session certification.

```mermaid
flowchart TD
    Student["Working Student Checker"]
    Faculty["Faculty Classroom"]
    Staff["Department Staff Encoder"]
    D6[("D6: Schedule Slots")]
    D8[("D8: Attendance Records & Sessions")]
    D11[("D11: Audit Logs")]

    P51["5.1<br>Physical Classroom Inspection (Hourly)"]
    P52["5.2<br>Triage Paper Sheets at Office"]
    P53["5.3<br>Load Daily Encoding Grid Matrix"]
    P54["5.4<br>Record Status per Hour Cell (P/A/L/E)"]
    P55["5.5<br>Auto-Save In-Progress Draft Payload"]
    P56["5.6<br>Certify & Commit Attendance Session"]

    Student -->|"Physical Visit per Meeting Hour"| P51
    Faculty -.->|"Presence / Activity"| P51
    P51 -->|"Paper Tickmarks [✓]"| P52
    P52 -->|"Completed Paper Sheet"| Staff

    Staff -->|"Select Date & Department"| P53
    P53 <-->|"Fetch Timetable Grid Slots"| D6
    P53 <-->|"Restore Draft / Existing Records"| D8
    P53 -->|"Rendered Matrix View"| Staff

    Staff -->|"Toggle Cell: Present / Absent / Late"| P54
    P54 -->|"Cell Change Event"| P55
    P55 -->|"Persist JSON Draft (`/api/attendance/draft`)"| D8

    Staff -->|"Click 'Save & Certify Session'"| P56
    P56 -->|"Upsert Attendance Rows (slotId, hourStart, present)"| D8
    P56 -->|"Create AttendanceSession Record"| D8
    P56 -->|"Log Certified Encoding Session"| D11
```

#### Process Mini-Specs (5.0)
- **5.1 Physical Inspection:** Working students physically visit assigned rooms (`AVR`, `FGM512`, `EMM303`) during class meeting hours. If instructor is physically conducting class, mark `[✓]`.
- **5.2 Triage Paper:** Staff receive paper sheets at 5:00 PM / 8:00 PM.
- **5.3 Load Encoding Grid:** Render matrix with rows = hourly intervals (`07:00-08:00` ... `20:00-21:00`) and columns = scheduled faculty members.
- **5.4 Record Cell Status:**
  - `Present`: `present = true`.
  - `Absent`: `present = false`.
  - `Late`: `present = true`, `remarks = "Late (15m)"`.
  - `Excused`: `present = true`, `remarks = "Excused - Official Business"`.
- **5.5 Auto-Save Draft:** On change, debounced POST to `/api/attendance/draft` stores JSON payload in `attendance_drafts`.
- **5.6 Certify Session:** Transactionally write individual `attendance` records. Create `attendance_sessions` entry marking `status = "SAVED"` with `savedById` and `savedAt`.

---

### 4.6 Process 6.0: 15-Day Cutoff Attendance Aggregation & Reporting

Decomposes the cutoff evaluation engine, hourly summation, multi-tab Excel workbook generation, and print report layout.

```mermaid
flowchart TD
    Staff["Department Staff / Dean"]
    D3[("D3: Faculty Registry")]
    D6[("D6: Schedule Slots Master")]
    D8[("D8: Attendance Records")]
    D10[("D10: Settings & Signatures")]

    P61["6.1<br>Validate 15-Day Evaluation Range"]
    P62["6.2<br>Compute Scheduled vs Rendered Hours"]
    P63["6.3<br>Aggregate Absences & Tardiness Metrics"]
    P64["6.4<br>Generate Multi-Tab Excel Workbook (.xlsx)"]
    P65["6.5<br>Render Certified Printable Evaluation Report"]

    Staff -->|"Start Date, End Date, Dept Scope"| P61
    P61 -->|"Cutoff Window Context"| P62

    P62 <-->|"Fetch Registered Faculty"| D3
    P62 <-->|"Enumerate Active Slots in Range"| D6
    P62 <-->|"Lookup Recorded Attendance Records"| D8
    P62 -->|"Hourly Computation Vector"| P63

    P63 -->|"Evaluation Summary Table"| Staff

    Staff -->|"Click 'Export to Excel'"| P64
    P64 -->|"Download Multi-Tab Workbook (.xlsx)"| Staff

    Staff -->|"Click 'Print Report'"| P65
    P65 <-->|"Inject Signatories & Certifications"| D10
    P65 -->|"Printable HTML Report View"| Staff
```

#### Process Mini-Specs (6.0)
- **6.1 Validate Range:** Ensure `startDate <= endDate` and range does not exceed standard cutoff bounds (max 31 days).
- **6.2 Compute Scheduled vs Rendered Hours:** For each day in range, determine scheduled slots. Compute scheduled hours via `hoursOfRange(start, end)`. Match against `attendance` table:
  - If `present === true`, add to `renderedHours`.
  - If `present === false`, add to `absentHours`.
  - Unencoded past slots count as absences with flag `unencoded`.
- **6.3 Aggregate Metrics:** Compute tardiness count and total minutes late from `attendance.remarks`.
- **6.4 Multi-Tab Excel Export:** Build Excel workbook using `exceljs`:
  - Tab 1: Overall College Summary.
  - Tab 2+: Individual Program Sheets (BSIT, BSCS, etc.).
- **6.5 Certified Printable Report:** Output clean HTML table with institutional headers, evaluation columns, and signature blocks (`Prepared By`, `Certified Correct by Dean`).

---

### 4.7 Process 7.0: System Governance, Security Auditing & Operational Reset

Decomposes administrative activity logging, advisory lock synchronization, and the operational reset barrier.

```mermaid
flowchart TD
    Dean["Dean (SuperAdmin)"]
    D6[("D6: Schedule Slots Master")]
    D7[("D7: Import Batches")]
    D8[("D8: Attendance Records & Sessions")]
    D1[("D1: Users & Permissions")]
    D2[("D2: Colleges Table")]
    D3[("D3: Faculty Table")]
    D4[("D4: Courses Catalog")]
    D5[("D5: Rooms Catalog")]
    D11[("D11: Security Audit Log")]

    P71["7.1<br>Record Transactional Audit Event"]
    P72["7.2<br>Query Audit Trail Stream"]
    P73["7.3<br>Validate Reset Phrase ('RESET OPERATIONAL DATA')"]
    P74["7.4<br>Acquire PostgreSQL Advisory Lock"]
    P75["7.5<br>Execute Operational Flush (D6, D7, D8)"]
    P76["7.6<br>Verify Preservation of Master Data (D1-D5, D11)"]

    %% Logging
    P71 -->|"Insert Audit Row"| D11
    Dean -->|"Filter Query"| P72
    P72 <-->|"Fetch Audit Records"| D11
    P72 -->|"Audit Trail Log View"| Dean

    %% Reset
    Dean -->|"Input Phrase: 'RESET OPERATIONAL DATA'"| P73
    P73 -->|"Phrase Matched"| P74
    P74 <-->|"pg_advisory_xact_lock(812734561)"| D6

    P74 -->|"Exclusive Transaction Lock"| P75
    P75 -->|"DELETE FROM attendance"| D8
    P75 -->|"DELETE FROM attendance_sessions"| D8
    P75 -->|"DELETE FROM schedule_slots"| D6
    P75 -->|"DELETE FROM import_batches"| D7

    P75 -->|"Post-Flush Verification"| P76
    P76 <-->|"Assert Record Counts"| D1 & D2 & D3 & D4 & D5 & D11
    P76 -->|"Audit Log: 'system.reset.operational'"| D11
    P76 -->|"Success Summary Banner"| Dean
```

#### Process Mini-Specs (7.0)
- **7.1 Audit Logging:** All state-changing actions write to `audit_logs` with `userId`, `action`, `details`, and `createdAt`.
- **7.2 Audit Stream Query:** Filterable by date range, user ID, and action category.
- **7.3 Validate Reset Phrase:** Strict string match: `RESET OPERATIONAL DATA`.
- **7.4 Acquire Advisory Lock:** Execute `SELECT pg_advisory_xact_lock(812734561)` to guarantee no simultaneous transactions or imports occur during reset.
- **7.5 Execute Flush:** Delete records from `attendance`, `attendance_sessions`, `schedule_slots`, `import_batches`, and `repair_findings`.
- **7.6 Verify Preservation:** Assert count of `faculty`, `colleges`, `courses`, `rooms`, `users`, `roles`, `settings`, and `audit_logs` are preserved 100%.

---

## 5. COMPREHENSIVE DATA DICTIONARY

### 5.1 Data Flow Definitions

#### `Raw Class Schedule Data`
- **Origin:** Excel File (`attendance_to_import.xlsx`)
- **Destination:** Process 2.1 (`Read Workbook`)
- **Composition:**
  ```text
  RawRow = {
    Term Type   : String,   // "1" or "2"
    Subject     : String,   // e.g. "GE501", "LIS101"
    CN          : String,   // e.g. "44017"
    Description : String,   // Subject title
    Unit        : Number,   // e.g. 3
    Sem         : String,   // e.g. "1st Semester"
    Schedule    : String,   // Compound format: "DAYS START-END PLACE || ..."
    Section     : String,   // e.g. "IT1_S1B12627"
    Course      : String,   // Program code, e.g. "BSIT", "BSCS"
    Slots       : String,   // Capacity, e.g. "47/45"
    Instructor  : String,   // Instructor full name
    Code        : String    // Year level, e.g. "1st", "2nd"
  }
  ```

#### `Meeting Slot Entity`
- **Origin:** Process 2.3 (`Select Room Priority`)
- **Destination:** Process 2.4 & Data Store D6 (`schedule_slots`)
- **Composition:**
  ```text
  PlannedSlot = {
    cn                : String,
    subject           : String,
    description       : String | null,
    units             : Integer,
    section           : String | null,
    yearLevel         : String | null,
    courseCode        : String,
    instructorRaw     : String,
    facultyName       : String | null,
    facultyDepartment : String | null,   // "CET", "CBE", null
    facultyStatus     : Enum,            // "MATCHED" | "UNASSIGNED" | "AMBIGUOUS" | "UNMATCHED" | "TBA"
    schoolYear        : String,
    semester          : String,
    weekday           : Integer,         // 0 (Sun) .. 6 (Sat)
    startTime         : String,          // "HH:mm" (24h)
    endTime           : String,          // "HH:mm" (24h)
    roomCode          : String,
    roomType          : Enum,            // "PHYSICAL" | "ONLINE" | "TBA"
    mode              : Enum,            // "FACE_TO_FACE" | "ONLINE" | "LAB"
    status            : Enum             // "new" | "update" | "unchanged" | "error"
  }
  ```

#### `Attendance Record Entry`
- **Origin:** Process 5.4 (`Record Cell Status`)
- **Destination:** Data Store D8 (`attendance`)
- **Composition:**
  ```text
  AttendanceEntry = {
    id           : Integer (PK),
    slotId       : Integer (FK -> schedule_slots.id),
    date         : Date (YYYY-MM-DD),
    hourStart    : String (HH:mm),
    present      : Boolean,
    encodedById  : Integer (FK -> users.id),
    remarks      : String | null,
    roomOverride : String | null
  }
  ```

---

### 5.2 Data Store Structures (Physical Schema Alignment)

#### D1: `users`
| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `Int` | PK, Auto | Unique account ID |
| `name` | `String` | Not Null | Display name |
| `username` | `String` | Unique, Not Null | Login username |
| `password_hash`| `String` | Not Null | Bcrypt hash |
| `active` | `Boolean`| Default `true` | Active status toggle |
| `must_change_password` | `Boolean` | Default `true` | Forces initial password update |

#### D2: `colleges`
| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `Int` | PK, Auto | Unique college ID |
| `code` | `String` | Unique, Not Null | Code (`CET`, `CBE`, `CTE`, `COAHS`) |
| `name` | `String` | Not Null | Full college name |
| `sort_order` | `Int` | Default `0` | UI tab ordering |

#### D3: `faculty`
| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `Int` | PK, Auto | Unique faculty ID |
| `full_name` | `String` | Not Null | Full name (`Surname, Given Middle`) |
| `surname` | `String` | Not Null | Surname for sorting |
| `department_id`| `Int` | Nullable, FK -> `colleges.id` | Permanent registered department |
| `active` | `Boolean`| Default `true` | Active roster status |

#### D6: `schedule_slots`
| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `Int` | PK, Auto | Unique class meeting ID |
| `class_number` | `String` | Not Null, Indexed | Class Number (`CN`) |
| `subject` | `String` | Not Null | Subject code (`IT101`) |
| `course_id` | `Int` | FK -> `courses.id` | Academic program offering class |
| `faculty_id` | `Int` | Nullable, FK -> `faculty.id` | Assigned instructor |
| `weekday` | `Int` | Not Null (0..6) | Day of week |
| `start_time` | `String` | Not Null (`HH:mm`) | Class start clock time |
| `end_time` | `String` | Not Null (`HH:mm`) | Class end clock time |
| `room_id` | `Int` | FK -> `rooms.id` | Scheduled classroom |
| `school_year` | `String` | Not Null | Academic year (`2026-2027`) |
| `semester` | `String` | Not Null | Academic semester (`1st Semester`) |
| `import_batch_id` | `Int` | Nullable, FK -> `import_batches.id` | Ingestion batch link |

#### D8: `attendance`
| Field | Type | Modifiers | Description |
|---|---|---|---|
| `id` | `Int` | PK, Auto | Unique attendance entry ID |
| `slot_id` | `Int` | FK -> `schedule_slots.id` | Linked class meeting |
| `date` | `DateTime`| Not Null, Indexed | Calendar date of attendance |
| `hour_start` | `String` | Not Null (`HH:mm`) | Specific hourly clock block |
| `present` | `Boolean`| Not Null | Checkmark status (`true`=present, `false`=absent) |
| `encoded_by_id`| `Int` | FK -> `users.id` | Encoder user attribution |
| `remarks` | `String` | Nullable | Lateness/excuse notes |
| `room_override`| `String` | Nullable | Relocated classroom code |

---

## 6. TRACEABILITY & ARCHITECTURAL CONSTRAINTS

1. **No Circular Inferences:** Faculty department membership is established in **Data Store D3** and referenced by **D6** via `facultyId`. No process may infer or mutate `Faculty.departmentId` based on `Course.collegeId` or `Subject`.
2. **Deterministic Name Keying:** The normalize function `normalizeFacultyName()` transforms strings into upper-case NFKC tokens without punctuation, stripping `.` and `,` and collapsing multiple spaces. This ensures unambiguous lookup across differing Excel styles (`JUAN D. DELA CRUZ` vs `Juan D Dela Cruz`).
3. **Multi-Mode Prioritization:** Compound timetable cells containing `Physical || OLC || ASYNC` collapse into a single meeting record in **D6**. `ASYNC` is strictly discarded from print sheets.
4. **Offline Student Checker Protocol:** The physical paper workflow remains the single source of ground-truth attendance observation. The web system acts as the ingestion, evaluation, and certification platform.
5. **Operational Resiliency:** Resets flushes only operational timetable slots (**D6**), batches (**D7**), and attendance checkmarks (**D8**). The Master Roster (**D3**) and Department Registry (**D2**) survive 100% intact across all resets and reboots.
