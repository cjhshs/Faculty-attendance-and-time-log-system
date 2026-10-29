# Windows Host Installation

This guide describes the supported Windows host layout for the Faculty Attendance and Time Log System.

The installer is intentionally conservative:

- Existing databases are backed up before migrations.
- Migrations use `prisma migrate deploy` only.
- `prisma migrate reset` and `prisma db push` are never used.
- Seeding is never automatic. A fresh database is initialized only when the installer option is explicitly selected.
- The installer does not contain a database password, session secret, or administrator password.

## Host prerequisites

- Windows 11 or Windows Server x64.
- Administrator access for installation.
- PostgreSQL 14 or newer installed on the host. PostgreSQL 18 is recommended.
- Node.js 22 or 24 LTS if the package was built without the bundled Node runtime.
- A static IP address or DHCP reservation for the host.
- A trusted private LAN. Do not expose the application to the public internet.

The application package includes the production build, Node dependencies, Prisma Client, migrations, and the support scripts. The target host does not need the development project or npm.

## Build the package

Run these commands from the development project on a Windows x64 build machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Build-Package.ps1 -BundleNode -Force
```

This runs the production build, tests, lint, and creates:

```text
dist\FacultyAttendance\
```

Use `-SkipTests` or `-SkipLint` only for a packaging-only check. Do not ship a package that has not passed the normal test, lint, and build checks.

The package deliberately excludes `.env`, `.git`, test data, and database backups.

## Build the installer

Install Inno Setup 6 on the build machine, then compile:

```powershell
iscc.exe .\installer\FacultyAttendance.iss
```

The installer is written to `dist\installer\FacultyAttendance-Setup.exe`.

## Install on the host

1. Make sure PostgreSQL is installed and its Windows service is running.
2. Make a current database backup before installing or upgrading.
3. Run `FacultyAttendance-Setup.exe` as Administrator.
4. Enter the PostgreSQL connection details.
5. Select LAN access only if other computers should reach the host.
6. For a brand-new empty database, explicitly select the initialization option. This creates reference data and the first administrator; it does not create attendance or schedule records.
7. For an existing database, do not select initialization. The installer backs up the database and applies pending migrations only.
8. Finish the wizard and wait for the readiness check.

The installer writes the runtime configuration to:

```text
C:\ProgramData\FacultyAttendance\app.env
```

That file contains the database connection string and session secret. Its ACL is restricted to SYSTEM and Administrators. Do not copy it into the repository or send it in chat.

## Access

On the host:

```text
http://localhost:3000/
```

On another computer on the private LAN:

```text
http://HOSTNAME:3000/
```

or:

```text
http://HOST-IP:3000/
```

The default port is 3000, but the installer allows a different port.

## LAN firewall

The setup script creates one inbound rule for the application port:

- TCP only
- Private network profile only
- Remote address: `LocalSubnet`
- No rule is created for PostgreSQL port 5432

Do not add a public firewall rule for the application and do not expose PostgreSQL to the LAN. The application server is the only LAN-facing component.

## HTTP and HTTPS

The default LAN mode is HTTP restricted to the private LAN. This is functional but does not encrypt passwords or session traffic on the wire. Use it only on a trusted network segment.

The session cookie is secure by default in production. For an intentionally approved HTTP LAN installation, the installer sets:

```text
SESSION_COOKIE_SECURE=false
```

If you place the application behind an HTTPS reverse proxy, set `SESSION_COOKIE_SECURE=true`, bind the Next.js server to localhost, and expose only the HTTPS proxy port through the firewall. Do not enable `SESSION_COOKIE_SECURE=true` on a plain-HTTP URL, because login will fail.

## Upgrade an existing installation

1. Run a manual backup first.
2. Run the new installer over the existing installation.
3. Do not select database initialization.
4. The setup script creates another pre-migration backup, runs `prisma migrate deploy`, and starts the application.
5. Verify the login page and a sample schedule/attendance page.

Never run `prisma migrate reset` or `prisma db push` against production.

## Backups

The installer registers a daily backup task at 02:00. It creates compressed custom-format PostgreSQL dumps under:

```text
C:\ProgramData\FacultyAttendance\backups\
```

Backups are retained for 30 days by default. Run a manual backup with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\FacultyAttendance\scripts\windows\Backup-Database.ps1"
```

Keep at least one encrypted copy off the host. Test restores periodically.

## Restore and recovery

Restore to a new empty database rather than overwriting production:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\FacultyAttendance\scripts\windows\Restore-Database.ps1" `
  -BackupFile "C:\ProgramData\FacultyAttendance\backups\faculty-attendance-....dump" `
  -TargetDatabase "faculty_attendance_restore"
```

The script refuses a target database that already contains tables. After verifying the restored data, add `-SwitchConfig` to update the live configuration. The previous configuration is saved with a timestamp.

If the application or database is damaged:

1. Stop the application scheduled task.
2. Keep the damaged database untouched.
3. Restore the latest verified dump into a new database.
4. Verify migration and schedule counts.
5. Switch the configuration and test login.
6. Keep the old database until the restored copy has been accepted.

## Service and startup

The setup script registers:

- `FacultyAttendance` - starts the application at Windows startup as SYSTEM.
- `FacultyAttendanceBackup` - runs the database backup daily at 02:00.

The application wrapper restarts the Node process if it exits unexpectedly. Logs are written to:

```text
C:\ProgramData\FacultyAttendance\logs\
```

If the host is rebooted, PostgreSQL must also be configured to start automatically. This is a separate PostgreSQL service setting and must not be changed by this installer without checking the existing database configuration.

## Security checks before production use

- Change the first administrator password after login.
- Keep PostgreSQL bound to localhost or restricted by `pg_hba.conf`; do not open 5432 to the LAN.
- Use a dedicated PostgreSQL application role instead of the `postgres` superuser when possible.
- Use HTTPS for encrypted LAN traffic where required.
- Review the dependency audit before exposing the host; do not run `npm audit fix --force` blindly.
- Keep Windows, Node.js, and PostgreSQL patched.
- Restrict `C:\ProgramData\FacultyAttendance` to SYSTEM and Administrators.
- Test the installer on a clean Windows VM before deploying to the real host.

## Clean-PC test checklist

- Install on a clean Windows VM with no development tools.
- Verify PostgreSQL service starts after reboot.
- Verify the installer creates the database and schema on a fresh install.
- Verify an existing database is backed up and migrated without data loss.
- Verify login from the host and one LAN client.
- Verify the firewall blocks the port from a non-LAN address.
- Verify the daily backup task and a restore into a separate database.
- Verify uninstall does not delete the database or backups.

Do not claim the installer is production-ready until these checks pass on the target environment.
