# Database Backup, Persistence, and Disaster Recovery Guide

## 1. Overview
The Faculty Attendance and Time Log System stores all critical institutional records—faculty master lists, Excel schedules, attendance logs, cutoff summaries, and custom selections—in a PostgreSQL database.

This guide explains how automated and manual backups work, where data is stored, and how to restore records in case of hardware failure or migration.

---

## 2. Storage Directory Structure

All persistent data, logs, and backups are stored outside the installation directory to ensure they survive application re-installs and updates:

```
C:\ProgramData\FacultyAttendance\
├── app.env                  # Private runtime configuration (ACL restricted to SYSTEM/Admins)
├── backups\                 # Database dumps (.dump format)
│   ├── preinstall-*.dump    # Automated backup created before any installer migration
│   ├── preupdate-*.dump     # Automated backup created before application updates
│   ├── scheduled-*.dump     # Daily automated backup (02:00 AM)
│   └── manual-*.dump        # On-demand backups created by administrator
└── logs\                    # System logs (startup, setup, app, backup, restore)
```

---

## 3. Automated Daily Backups

During installation, a Windows Scheduled Task named `FacultyAttendanceBackup` is registered:
* **Trigger**: Daily at 02:00 AM.
* **Account**: `NT AUTHORITY\SYSTEM` (runs automatically even if no user is logged in).
* **Execution**: Executes `Backup-Database.ps1`.
* **Format**: PostgreSQL compressed custom archive (`pg_dump -Fc`).
* **Retention Policy**: Backups older than **30 days** are automatically cleaned up to save disk space.

---

## 4. Creating a Manual Backup On-Demand

### Method 1: Using the Control Panel (Easiest)
1. Open the **Faculty Attendance Control Panel** on the host desktop.
2. Click **💾 Backup Database Now**.
3. A confirmation window will display the backup filename and confirmation.

### Method 2: Using PowerShell
Open an elevated PowerShell window and run:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\FacultyAttendance\scripts\windows\Backup-Database.ps1"
```

---

## 5. Restoring a Database Backup

Restoration is performed safely to prevent accidental data corruption.

### Safe Restoration Procedure

1. Open PowerShell as Administrator.
2. To restore into a new database (e.g. `faculty_attendance_restored`):
   ```powershell
   cd "C:\Program Files\FacultyAttendance\scripts\windows"
   powershell -ExecutionPolicy Bypass -File .\Restore-Database.ps1 `
       -BackupFile "C:\ProgramData\FacultyAttendance\backups\faculty-attendance-20261118-020000.dump" `
       -TargetDatabase "faculty_attendance_restored"
   ```
3. The restore script will:
   * Verify the backup file integrity.
   * Create the target database.
   * Restore all tables, schemas, relations, and records.
   * Verify table row counts and completed migrations.

4. **Switch Live System to the Restored Database**:
   Add the `-SwitchConfig` switch:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Restore-Database.ps1 `
       -BackupFile "C:\ProgramData\FacultyAttendance\backups\faculty-attendance-20261118-020000.dump" `
       -TargetDatabase "faculty_attendance_restored" `
       -SwitchConfig
   ```
   *This automatically backs up the old `app.env`, points the live application to the new restored database, and restarts the background service seamlessly.*

---

## 6. Disaster Recovery / Moving to a New Server

If the host hardware fails:
1. Copy the latest `.dump` file from `C:\ProgramData\FacultyAttendance\backups\` to a USB drive or cloud storage.
2. Install PostgreSQL on the new server.
3. Run `Faculty-Attendance-Installer.exe` on the new server with default options.
4. Run the restore command above with `-SwitchConfig` to import your records.
5. All faculty data, historical attendance records, and sessions are immediately restored.
