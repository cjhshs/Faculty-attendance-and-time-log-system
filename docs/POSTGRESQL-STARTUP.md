# PostgreSQL Startup on Windows

This document explains how to bring an **existing** PostgreSQL cluster back up
without initializing a new database, deleting data, changing the port, or
blindly editing service configuration.

The helper script is:

```text
scripts\windows\Start-PostgreSQL.ps1
```

## What the script will and will not do

It will:

- Find an existing PostgreSQL Windows service (default: `postgresql-x64-18`).
- Request UAC elevation when the service must be started.
- Refuse to start if the service's configured data directory does not exist.
- Verify that the existing cluster accepts connections with `pg_isready`.
- Optionally set the verified service to start automatically after reboot
  (`-SetAutomatic`).
- Detect a cluster already running from a manual `pg_ctl start` so it does not
  try to start a second postmaster on the same data directory/port.

It will **never**:

- run `initdb` or create a new cluster;
- delete, move or rewrite the data directory;
- change the PostgreSQL port;
- edit `pg_hba.conf` or `postgresql.conf`;
- run `prisma migrate reset`, `prisma db push`, or drop a database.

## Diagnose first (read-only)

```powershell
sc.exe qc postgresql-x64-18
sc.exe queryex postgresql-x64-18
Get-Service postgresql*
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5432
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" status -D "C:\Program Files\PostgreSQL\18\data"
```

Also read the newest file in:

```text
C:\Program Files\PostgreSQL\18\data\log\
```

A service that exits immediately is usually caused by:

- the data directory or log directory not being writable by the service account;
- a port conflict with another PostgreSQL instance;
- a corrupt `postmaster.pid` left by a hard shutdown (inspect before removing);
- a service account that was changed after installation.

Do not delete `postmaster.pid` until `pg_ctl status` confirms no postmaster is
running.

## Start it safely

Run from a normal (non-elevated) shell. The script prompts for elevation only
when needed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Start-PostgreSQL.ps1
```

Specify the exact service if auto-detection finds several:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Start-PostgreSQL.ps1 -ServiceName postgresql-x64-18
```

Make the verified service start automatically after reboot:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Start-PostgreSQL.ps1 -ServiceName postgresql-x64-18 -SetAutomatic
```

`-SetAutomatic` changes only the service start mode. The binary path, service
account, data directory and port are verified first and left untouched.

If PostgreSQL was installed without a Windows service, start the existing
cluster with the existing data directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Start-PostgreSQL.ps1 `
  -UsePgCtl `
  -PgBin "C:\Program Files\PostgreSQL\18\bin" `
  -DataDir "C:\Program Files\PostgreSQL\18\data"
```

## Check the existing database is intact

After the server is ready:

```powershell
$env:PGPASSWORD = "<the existing postgres password>"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
  -h 127.0.0.1 -p 5432 -U postgres -d faculty_attendance_new `
  -tAc "select current_database(), count(*) from faculty;"
```

Expected on this installation: `faculty_attendance_new|311` (the roster count
before any department assignments). Confirm the migration state as well:

```powershell
npx prisma migrate status
```

## If the service still will not start

1. Keep the data directory untouched.
2. Capture `sc.exe qc`, `sc.exe queryex`, and the newest PostgreSQL log.
3. Confirm the service account (`NT AUTHORITY\NetworkService` on a default
   PostgreSQL 18 install) has Full Control on both the data directory and its
   `log` folder.
4. Confirm no other `postgres.exe` is listening on 5432:

   ```powershell
   Get-NetTCPConnection -LocalPort 5432 -State Listen
   ```

5. If a manual instance is running, stop it only when approved:

   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" stop -D "C:\Program Files\PostgreSQL\18\data" -m fast
   ```

   Then start the service with the script. Do not run `pg_ctl start` while the
   service is running.

If the service configuration itself is suspected, change one property at a
time, record the previous value (`sc.exe qc`), and re-verify `pg_isready` and the
application login afterwards. The application installer deliberately does not
modify PostgreSQL service configuration.

## Observed state on this host (verified)

- Service: `postgresql-x64-18`.
- Binary: `C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe runservice … -D "C:\Program Files\PostgreSQL\18\data"`.
- Service account: `NT AUTHORITY\NetworkService`, with Full Control on the data
  directory (verified read-only with `Get-Acl`).
- Data directory exists.
- Start type was `DEMAND_START`; the service does not start after a reboot until
  it is set to automatic.
- Starting the service from a non-elevated shell fails with
  `Cannot open postgresql-x64-18 service on computer '.'`; elevation is required.
- A standalone `pg_ctl` instance was running during this work, so the service
  could not be started until that instance is stopped.
