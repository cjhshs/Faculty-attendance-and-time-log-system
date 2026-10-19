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
