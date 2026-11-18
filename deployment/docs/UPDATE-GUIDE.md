# Application Update & Maintenance Guide

## 1. Overview
The **Faculty Attendance and Time Log System** installer includes an automated upgrade mechanism.

Upgrades are designed to be completely **non-destructive**:
1. All existing records (faculty, schedules, attendance logs, cutoff summaries, user roles) are preserved.
2. An automated database backup is taken before applying migrations.
3. Migrations only apply additive schema updates (`prisma migrate deploy`).
4. System settings, passwords, and custom selections remain intact.

---

## 2. Upgrading Using the Installer (Recommended)

When a new version of the installer (`Faculty-Attendance-Installer.exe`) is released:

1. Download the new installer onto the host computer.
2. Right-click and choose **Run as administrator**.
3. The installer detects the existing version from the Windows Registry:
   * It displays the current installation directory (e.g. `C:\Program Files\FacultyAttendance`).
   * It automatically keeps your database settings (`Host`, `Port`, `Database`, `User`).
   * It **disables** the fresh database initialization option so existing data is never wiped.
4. Click **Next** through the setup pages and click **Install**.
5. The installer will:
   * Stop the running `FacultyAttendance` service.
   * Create an automated pre-update backup (`preupdate-*.dump`) in `C:\ProgramData\FacultyAttendance\backups\`.
   * Replace application binaries and frontend assets.
   * Run `prisma migrate deploy` to update database tables.
   * Restart the background service.
   * Verify the HTTP 200 response on `http://localhost:3000/login`.

---

## 3. Upgrading via PowerShell Script

Administrators can also trigger an update from the command line:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\FacultyAttendance\scripts\windows\Update-FacultyAttendance.ps1"
```

The script performs the same verified steps:
1. Stops the service safely.
2. Creates an immediate database backup.
3. Applies pending Prisma migrations.
4. Restarts the service and waits for the health check.

---

## 4. Rollback Procedure

In the rare event that an update fails:
1. Your previous database state is preserved in:
   `C:\ProgramData\FacultyAttendance\backups\preupdate-<dbname>-<timestamp>.dump`.
2. Run `Restore-Database.ps1` with the `-SwitchConfig` switch:
   ```powershell
   cd "C:\Program Files\FacultyAttendance\scripts\windows"
   powershell -ExecutionPolicy Bypass -File .\Restore-Database.ps1 `
       -BackupFile "C:\ProgramData\FacultyAttendance\backups\preupdate-<dbname>-<timestamp>.dump" `
       -TargetDatabase "faculty_attendance_previous" `
       -SwitchConfig
   ```
3. The application will immediately switch to the backup database and resume normal operation.
