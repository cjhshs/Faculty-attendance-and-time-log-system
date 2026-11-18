# Troubleshooting Guide: Faculty Attendance and Time Log System

## 1. Quick Diagnostic Checklist

If the system is not loading or client PCs cannot connect:

1. **Check System Status**:
   Open **Faculty Attendance Control Panel** on the host desktop. Check if the status badge shows **🟢 SYSTEM ONLINE**. If it shows **🔴 STOPPED**, click **▶ Start System**.
2. **Check PostgreSQL Service**:
   Ensure PostgreSQL is running on the host. In PowerShell:
   ```powershell
   Get-Service -Name "postgresql*"
   ```
   If stopped, start it:
   ```powershell
   Start-Service postgresql-x64-18
   ```
3. **Verify Port 3000**:
   Verify port 3000 is listening:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen
   ```
4. **Check Recent Logs**:
   Logs are located in `C:\ProgramData\FacultyAttendance\logs\`:
   * `app-*.err.log` — Web application runtime errors.
   * `startup.log` — Service startup history.
   * `setup.log` — Installer & migration logs.
   * `backup.log` — Database backup logs.

---

## 2. Common Issues and Solutions

### Issue A: "Can't reach this page" or "Connection Refused" from Localhost
* **Cause**: Background task is stopped or port is blocked.
* **Fix**:
  1. Open the Control Panel and click **▶ Start System**.
  2. If the status does not turn green within 15 seconds, check `C:\ProgramData\FacultyAttendance\logs\app-*.err.log`.
  3. Ensure PostgreSQL is accepting connections on `localhost:5432`.

---

### Issue B: Other Computers Cannot Reach the Host (`http://192.168.x.x:3000/`)
* **Cause 1**: Windows Network Profile is set to **Public** instead of **Private**.
  * **Fix**: On the host, open Windows Settings > **Network & Internet** > **Properties** of your active connection. Change the Network profile type from **Public network** to **Private network**. Windows Firewall blocks inbound LAN traffic by default on Public profiles.
* **Cause 2**: Host IP address changed.
  * **Fix**: Open the Control Panel on the host and verify the current **LAN Access URL**. If your router assigned a new IP address, provide the updated address to client PCs, or configure a static IP.
* **Cause 3**: Firewall rule was deleted or disabled.
  * **Fix**: Run in elevated PowerShell:
    ```powershell
    New-NetFirewallRule -DisplayName "Faculty Attendance Web" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
    ```

---

### Issue C: Port 3000 is Already in Use by Another Application
* **Symptom**: Application fails to start with error `EADDRINUSE: address already in use :::3000`.
* **Fix**:
  1. Edit `C:\ProgramData\FacultyAttendance\app.env`.
  2. Change `PORT=3000` to an open port (e.g. `PORT=8080` or `PORT=3001`).
  3. Update Windows Firewall for the new port:
     ```powershell
     New-NetFirewallRule -DisplayName "Faculty Attendance Web" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private -RemoteAddress LocalSubnet
     ```
  4. Restart the service via the Control Panel. Access the system at `http://localhost:8080/`.

---

### Issue D: Database Connection Error (`PrismaClientInitializationError`)
* **Symptom**: `Can't reach database server at localhost:5432`.
* **Fix**:
  1. Verify the PostgreSQL Windows Service is running:
     ```powershell
     Start-Service -Name "postgresql*"
     ```
  2. Test local connection using `psql`:
     ```cmd
     psql -U postgres -h localhost -d faculty_attendance_new
     ```
  3. Verify credentials in `C:\ProgramData\FacultyAttendance\app.env`.

---

### Issue E: Password Reset / Forgotten Administrator Password
* **Fix**: Open PowerShell as Administrator and run the emergency password reset helper:
  ```powershell
  cd "C:\Program Files\FacultyAttendance\app"
  $env:DATABASE_URL = (Get-Content "C:\ProgramData\FacultyAttendance\app.env" | Where-Object { $_ -match "^DATABASE_URL=" }).Split("=", 2)[1]
  $node = "C:\Program Files\FacultyAttendance\runtime\node.exe"
  & $node -e "
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();
  async function reset() {
    const hash = await bcrypt.hash('Admin@12345', 10);
    await prisma.user.updateMany({ where: { username: 'dean' }, data: { passwordHash: hash } });
    console.log('Password for user dean has been reset to Admin@12345');
    await prisma.\$disconnect();
  }
  reset();
  "
  ```
