# FACULTY ATTENDANCE AND TIME LOG SYSTEM (Next.js + PostgreSQL)

Web-based system for faculty attendance and time logging. Boots a Next.js (App Router) app
with Prisma on PostgreSQL. No Docker required.

## Stack
- Next.js 16 (App Router, Turbopack) + React 19
- PostgreSQL + Prisma ORM
- Tailwind CSS 4
- ExcelJS / SheetJS (xlsx) for import and export
- bcryptjs for password hashing

## Prerequisites
- Node.js LTS (v20 / v22 / v24)
- PostgreSQL 14+
- Git (optional)

## Setup
1. Copy the environment file and adjust values:
   ```
   copy .env.example .env
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Generate the Prisma client:
   ```
   npx prisma generate
   ```
4. Apply database migrations (creates the schema):
   ```
   npx prisma migrate deploy
   ```
   For local development you can use `npm run prisma:migrate` instead.
5. Seed roles, permissions, settings and the first Dean account:
   ```
   npm run seed
   ```
6. Build and run:
   ```
   npm run build
   npm run start
   ```
   Production process manager example: `pm2 start npm --name faculty-attendance -- start`.

## First login
The seed creates a Dean account using `SEED_DEAN_USERNAME` / `SEED_DEAN_PASSWORD`
(defaults: `dean` / `Dean@12345`). The account is flagged `mustChangePassword`, so you are
asked to set a new password at first sign-in.

## Windows Installer & Production Deployment

For non-developer computers, use the standalone Windows deployment package located in [`deployment/`](file:///f:/faculty-attendance-next/deployment):

1. **Installer**: Run `deployment/Faculty-Attendance-Installer.exe` as Administrator.
2. **Bundled Runtime**: Includes Node.js x64 runtime; target host does not require Node.js or development tools.
3. **Database**: Detects or connects to local PostgreSQL, runs migrations safely, and seeds initial data.
4. **Automatic Service**: Automatically runs on boot as a Windows background service (`FacultyAttendance-Web`).
5. **Control Panel**: Desktop shortcut **Faculty Attendance Control Panel** provides Start, Stop, Restart, Status, and Backup controls.
6. **Local & LAN Access**:
   - Host PC: `http://localhost:3000/`
   - LAN PCs: `http://<HOST-IP>:3000/` (LAN IPv4 is automatically detected and displayed in the Control Panel).
7. **Backups**: Automatically runs daily backups at 02:00 AM with 30-day retention under `C:\ProgramData\FacultyAttendance\backups\daily\`.

For comprehensive instructions, see:
- [Installation Guide](file:///f:/faculty-attendance-next/deployment/docs/INSTALLATION-GUIDE.md)
- [LAN Access Guide](file:///f:/faculty-attendance-next/deployment/docs/LAN-ACCESS-GUIDE.md)
- [Backup and Recovery](file:///f:/faculty-attendance-next/deployment/docs/BACKUP-AND-RECOVERY.md)
- [Troubleshooting Guide](file:///f:/faculty-attendance-next/deployment/docs/TROUBLESHOOTING.md)

---

## Daily use
1. **Schedule** – import the Excel schedule and review the parsed slots.
2. **Attendance print** – print the blank daily sheets for a date.
3. **Attendance encode** – record present/absent per scheduled hour and save.
4. **Summary** – tallies per faculty over a cutoff range; print or export to Excel.
5. **Settings / Users / Calendar / Audit** – configure headers, accounts, holidays and review history.

## Notes
- Absences are only counted for encoded date/program scopes. Scopes that were never encoded
  are reported as *incomplete* and are excluded from absent hours.

## Backups
- Dump the database: `pg_dump -U postgres faculty_attendance_new > backup.sql`
- Restore: `psql -U postgres faculty_attendance_new < backup.sql`
- Keep copies off-server.
